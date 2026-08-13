/**
 * Cross-command exclusivity for sync / pull / deploy in one project directory.
 *
 * Prevents overlapping runs that can cause unexpected side-effects (including
 * infinite update loops when sync watches files that pull/deploy rewrite).
 *
 * Nested CLI subprocesses (merge-first pull, post-deploy pull) set
 * SITEGLIDE_NESTED_CLI=1 to bypass the lock.
 *
 * Sync liveness is read from `.siteglide/sync/<pid>.json`.
 * Pull/deploy claim files under `.siteglide/command-locks/<pid>.json`.
 */

const fs = require('fs');
const path = require('path');
const { isPidAlive, syncStatusDir, readStatusFile } = require('./syncStatus');

const LOCK_DIR_SEGMENTS = ['.siteglide', 'command-locks'];
const NESTED_ENV = 'SITEGLIDE_NESTED_CLI';

/** What must not already be running when starting each command. */
const BLOCKED_BY = {
	sync: ['pull'],
	pull: ['sync', 'pull', 'deploy'],
	deploy: ['pull', 'deploy']
};

const SIDE_EFFECT_HELPER =
	'Siteglide CLI prevents certain commands from running at the same time to avoid unexpected side-effects, ' +
	'including infinite update loops. Timed subprocesses are allowed.';

/**
 * Print a command-lock refusal: red headline, white helper text, then exit.
 * @param {{ headline?: string, helper?: string, message?: string }} result
 * @param {{ exit?: boolean }} [opts]
 */
function logCommandLockRefusal(result, opts = {}) {
	const logger = require('./logger');
	const chalk = require('chalk');
	const headline = result.headline || result.message || 'Command blocked by another Siteglide CLI process.';
	const helper = result.helper || SIDE_EFFECT_HELPER;
	logger.Error(headline, { exit: false });
	logger.Print(`${chalk.white(helper)}\n`);
	if (opts.exit !== false) {
		process.exit(1);
	}
}

/**
 * @param {string} [cwd]
 * @returns {string}
 */
function commandLockDir(cwd = process.cwd()) {
	return path.join(cwd, ...LOCK_DIR_SEGMENTS);
}

/**
 * @param {string} [cwd]
 * @param {number} [pid]
 * @returns {string}
 */
function commandLockPath(cwd = process.cwd(), pid = process.pid) {
	return path.join(commandLockDir(cwd), `${pid}.json`);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isPidJsonName(name) {
	return /^\d+\.json$/.test(name);
}

/**
 * @param {string} filePath
 * @returns {{ pid: number, command: string, environment?: string, cwd?: string, startedAt?: string } | null}
 */
function readCommandLockFile(filePath) {
	try {
		const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		if (!data || typeof data !== 'object') {
			return null;
		}
		const pid = Number(data.pid);
		const command = data.command;
		if (!Number.isInteger(pid) || typeof command !== 'string' || !command) {
			return null;
		}
		return {
			pid,
			command,
			environment: typeof data.environment === 'string' ? data.environment : undefined,
			cwd: data.cwd,
			startedAt: data.startedAt
		};
	} catch {
		return null;
	}
}

/**
 * Live sync + pull + deploy processes for this project cwd.
 * @param {{ cwd?: string, isAlive?: (pid: number) => boolean }} [opts]
 * @returns {Array<{ pid: number, command: string, environment?: string, startedAt?: string, source: string }>}
 */
function listLiveCommands(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const isAlive = opts.isAlive || isPidAlive;
	const out = [];

	const syncDir = syncStatusDir(cwd);
	try {
		for (const name of fs.readdirSync(syncDir)) {
			if (!isPidJsonName(name)) {
				continue;
			}
			const filePath = path.join(syncDir, name);
			const entry = readStatusFile(filePath);
			if (!entry) {
				continue;
			}
			if (!isAlive(entry.pid)) {
				try {
					fs.unlinkSync(filePath);
				} catch {
					// ignore
				}
				continue;
			}
			out.push({
				pid: entry.pid,
				command: 'sync',
				environment: entry.environment,
				startedAt: entry.startedAt,
				source: filePath
			});
		}
	} catch {
		// no sync dir
	}

	const lockDir = commandLockDir(cwd);
	try {
		for (const name of fs.readdirSync(lockDir)) {
			if (!isPidJsonName(name)) {
				continue;
			}
			const filePath = path.join(lockDir, name);
			const entry = readCommandLockFile(filePath);
			if (!entry) {
				try {
					fs.unlinkSync(filePath);
				} catch {
					// ignore
				}
				continue;
			}
			if (!isAlive(entry.pid)) {
				try {
					fs.unlinkSync(filePath);
				} catch {
					// ignore
				}
				continue;
			}
			out.push({
				pid: entry.pid,
				command: entry.command,
				environment: entry.environment,
				startedAt: entry.startedAt,
				source: filePath
			});
		}
	} catch {
		// no lock dir
	}

	return out;
}

/**
 * @param {string} startingCommand
 * @param {{ cwd?: string, pid?: number, isAlive?: (pid: number) => boolean }} [opts]
 * @returns {{ ok: true, nested?: boolean } | { ok: false, blockedBy: object, message: string }}
 */
function assertCommandAllowed(startingCommand, opts = {}) {
	if (process.env[NESTED_ENV] === '1') {
		return { ok: true, nested: true };
	}

	const blockedSet = new Set(BLOCKED_BY[startingCommand] || []);
	if (blockedSet.size === 0) {
		return { ok: true };
	}

	const cwd = opts.cwd || process.cwd();
	const pid = opts.pid != null ? opts.pid : process.pid;
	const live = listLiveCommands({ cwd, isAlive: opts.isAlive });

	for (const entry of live) {
		if (entry.pid === pid) {
			continue;
		}
		if (!blockedSet.has(entry.command)) {
			continue;
		}
		const envLabel = entry.environment ? `(env: ${entry.environment})` : '';
		const headline =
			`Cannot start ${startingCommand} while ${entry.command} is running (pid ${entry.pid}${envLabel}).`;
		const helper = SIDE_EFFECT_HELPER;
		return {
			ok: false,
			blockedBy: entry,
			headline,
			helper,
			message: `${headline} ${helper}`
		};
	}

	return { ok: true };
}

/**
 * Claim a pull or deploy lock for this process (not used for sync — sync uses syncStatus).
 * @param {'pull'|'deploy'} command
 * @param {{ environment: string, cwd?: string, pid?: number, isAlive?: (pid: number) => boolean }} opts
 * @returns {{ ok: true, path?: string, nested?: boolean } | { ok: false, blockedBy?: object, message: string }}
 */
function claimCommandLock(command, opts) {
	const allowed = assertCommandAllowed(command, opts);
	if (!allowed.ok) {
		return allowed;
	}
	if (allowed.nested) {
		return { ok: true, nested: true };
	}

	const cwd = opts.cwd || process.cwd();
	const pid = opts.pid != null ? opts.pid : process.pid;
	const dir = commandLockDir(cwd);
	fs.mkdirSync(dir, { recursive: true });

	const filePath = commandLockPath(cwd, pid);
	const payload = {
		pid,
		command,
		environment: opts.environment,
		cwd,
		startedAt: new Date().toISOString()
	};
	fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	return { ok: true, path: filePath };
}

/**
 * @param {{ cwd?: string, pid?: number }} [opts]
 */
function clearCommandLock(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const pid = opts.pid != null ? opts.pid : process.pid;
	const filePath = commandLockPath(cwd, pid);
	try {
		fs.unlinkSync(filePath);
	} catch (err) {
		if (err && err.code !== 'ENOENT') {
			throw err;
		}
	}
}

let cleanupRegistered = false;

/**
 * Register exit handlers that clear this process's command lock.
 * @param {{ cwd?: string, pid?: number }} [opts]
 */
function registerCommandLockCleanup(opts = {}) {
	if (cleanupRegistered) {
		return;
	}
	cleanupRegistered = true;

	const clear = () => {
		try {
			clearCommandLock(opts);
		} catch {
			// ignore
		}
	};

	process.on('exit', clear);
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => {
			clear();
			process.exit(signal === 'SIGINT' ? 130 : 143);
		});
	}
}

/**
 * Env fragment for intentional nested CLI (merge-first / post-deploy pull).
 * @returns {{ SITEGLIDE_NESTED_CLI: string }}
 */
function nestedCliEnv() {
	return { [NESTED_ENV]: '1' };
}

module.exports = {
	NESTED_ENV,
	BLOCKED_BY,
	SIDE_EFFECT_HELPER,
	commandLockDir,
	commandLockPath,
	listLiveCommands,
	assertCommandAllowed,
	claimCommandLock,
	clearCommandLock,
	registerCommandLockCleanup,
	nestedCliEnv,
	logCommandLockRefusal,
	isPidJsonName
};
