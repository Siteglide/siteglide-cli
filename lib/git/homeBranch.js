/**
 * Home branch record for merge-first (`.siteglide/user/git/home-branch.json`).
 *
 * Written before merge-first leaves the user's home branch for a temporary branch, updated as the
 * merge moves through its phases, and cleared once the user is back home with the temporary branch
 * deleted. If merge-first stops part-way, the file tells the Siteglide MCP `git_status` tool (and
 * the sync/deploy guard below) where the user came from.
 */

const fs = require('fs');
const path = require('path');
const { joinUser } = require('../siteglidePaths');
const { run } = require('./readiness');
const { isPidAlive } = require('../syncStatus');
const { NESTED_ENV } = require('../commandLock');

const HOME_BRANCH_FILE = 'home-branch.json';

/** Branch names merge-first creates (see tempBranchNameForMode in mergeFirst.js). */
const TEMPORARY_BRANCH_PATTERNS = [
	/^temp-pull-from-/,
	/^siteglide-merge-deploy\//,
	/^siteglide-merge-sync\//
];

/** A recorded owner pid older than this may have been reused by an unrelated process. */
const OWNER_PID_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const STRANDED_HEADLINE =
	'You are on a temporary branch, please checkout to your development branch and merge in any changes before syncing or deploying.';

/** @type {Record<string, 'pull'|'deploy'|'sync'>} */
const COMMAND_BY_MODE = {
	pull_full: 'pull',
	deploy_full_pull: 'deploy',
	sync_full_pull: 'sync'
};

/**
 * @param {string} [cwd]
 * @returns {string}
 */
function homeBranchPath(cwd = process.cwd()) {
	return joinUser(cwd, 'git', HOME_BRANCH_FILE);
}

/**
 * @param {string} [cwd]
 * @returns {object | null}
 */
function readHomeBranch(cwd = process.cwd()) {
	try {
		const data = JSON.parse(fs.readFileSync(homeBranchPath(cwd), 'utf8'));
		if (!data || typeof data !== 'object' || Array.isArray(data)) {
			return null;
		}
		return data;
	} catch {
		return null;
	}
}

/**
 * @param {string} cwd
 * @param {object} record
 */
function writeRecord(cwd, record) {
	const filePath = homeBranchPath(cwd);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
	return filePath;
}

/**
 * Replace any previous record with a fresh one for this merge-first run.
 * @param {object} opts
 * @param {string} opts.homeBranch
 * @param {string} opts.temporaryBranch
 * @param {string} opts.mode merge-first mode (pull_full / deploy_full_pull / sync_full_pull)
 * @param {string} opts.environment
 * @param {string} [opts.mergeStrategy]
 * @param {string | null} [opts.homeHeadAfterWip]
 * @param {string} [opts.phase]
 * @param {string} [opts.cwd]
 * @returns {string} file path
 */
function writeHomeBranch(opts) {
	const cwd = opts.cwd || process.cwd();
	const now = new Date().toISOString();
	return writeRecord(cwd, {
		homeBranch: opts.homeBranch,
		temporaryBranch: opts.temporaryBranch,
		command: COMMAND_BY_MODE[opts.mode] || 'pull',
		environment: opts.environment,
		mergeStrategy: opts.mergeStrategy || null,
		homeHeadAfterWip: opts.homeHeadAfterWip || null,
		ownerPid: process.pid,
		phase: opts.phase || 'creating_temp_branch',
		startedAt: now,
		updatedAt: now
	});
}

/**
 * @param {string} phase
 * @param {{ cwd?: string, mergeStrategy?: string }} [opts]
 */
function updateHomeBranchPhase(phase, opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const existing = readHomeBranch(cwd);
	if (!existing) {
		return;
	}
	const next = Object.assign({}, existing, {
		phase,
		updatedAt: new Date().toISOString()
	});
	if (opts.mergeStrategy) {
		next.mergeStrategy = opts.mergeStrategy;
	}
	writeRecord(cwd, next);
}

/**
 * @param {string} [cwd]
 */
function clearHomeBranch(cwd = process.cwd()) {
	try {
		fs.unlinkSync(homeBranchPath(cwd));
	} catch (err) {
		if (err && err.code !== 'ENOENT') {
			throw err;
		}
	}
}

/**
 * @param {object} record
 * @param {number} maxAgeMs
 * @returns {boolean}
 */
function isRecordOlderThan(record, maxAgeMs) {
	const at = Date.parse(record.updatedAt || record.startedAt || '');
	if (Number.isNaN(at)) {
		return true;
	}
	return Date.now() - at > maxAgeMs;
}

/**
 * @param {string} branch
 * @returns {boolean}
 */
function isTemporaryBranchName(branch) {
	if (!branch) {
		return false;
	}
	return TEMPORARY_BRANCH_PATTERNS.some((pattern) => pattern.test(branch));
}

/**
 * Whether the working tree is on a merge-first temporary branch.
 * @param {string} [cwd]
 * @returns {{ onTemporaryBranch: boolean, current?: string, record?: object | null }}
 */
function detectTemporaryBranch(cwd = process.cwd()) {
	const inside = run('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
	if (!inside.ok || inside.stdout !== 'true') {
		return { onTemporaryBranch: false };
	}
	const head = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
	if (!head.ok || !head.stdout || head.stdout === 'HEAD') {
		return { onTemporaryBranch: false };
	}
	const current = head.stdout;
	const record = readHomeBranch(cwd);
	const matchesRecord = Boolean(record && record.temporaryBranch === current);
	return {
		onTemporaryBranch: matchesRecord || isTemporaryBranchName(current),
		current,
		record: matchesRecord ? record : null
	};
}

/**
 * Refusal for a sync/deploy started on a temporary branch, or null when allowed.
 * @param {{ command: 'sync'|'deploy', cwd?: string, env?: NodeJS.ProcessEnv }} opts
 * @returns {{ reason: 'in_progress'|'stranded', headline: string, helper: string } | null}
 */
function temporaryBranchRefusal(opts) {
	const env = opts.env || process.env;
	if (env[NESTED_ENV] === '1') {
		return null;
	}
	const detected = detectTemporaryBranch(opts.cwd || process.cwd());
	if (!detected.onTemporaryBranch) {
		return null;
	}
	const record = detected.record;
	if (
		record
		&& isPidAlive(record.ownerPid)
		&& !isRecordOlderThan(record, OWNER_PID_MAX_AGE_MS)
	) {
		return {
			reason: 'in_progress',
			headline: `siteglide-cli ${record.command || 'pull'} is part-way through Pull and merge on a temporary branch. Wait for it to finish before syncing or deploying.`,
			helper: `Temporary branch: "${detected.current}". Home branch: "${record.homeBranch}".`
		};
	}
	const helper = record && record.homeBranch
		? `Your development branch is "${record.homeBranch}". Ask your AI assistant to run the Siteglide MCP git_status tool for step-by-step rescue.`
		: 'Ask your AI assistant to run the Siteglide MCP git_status tool to find your development branch and rescue the merge.';
	return {
		reason: 'stranded',
		headline: STRANDED_HEADLINE,
		helper
	};
}

/**
 * Exit 1 when sync/deploy is started by the user on a merge-first temporary branch.
 * Nested CLI subprocesses (SITEGLIDE_NESTED_CLI=1) are never refused.
 * @param {{ command: 'sync'|'deploy', cwd?: string }} opts
 * @returns {Promise<void>}
 */
async function assertNotOnTemporaryBranch(opts) {
	const cwd = opts.cwd || process.cwd();
	const refusal = temporaryBranchRefusal(opts);
	if (!refusal) {
		return;
	}
	const logger = require('../logger');
	logger.Error(refusal.headline, { exit: false });
	logger.Print(`${refusal.helper}\n`);
	if (refusal.reason === 'stranded') {
		const detected = detectTemporaryBranch(cwd);
		const record = detected.record || readHomeBranch(cwd);
		const { offerTemporaryBranchAiHelp } = require('../aiPrompts');
		await offerTemporaryBranchAiHelp({
			command: opts.command,
			cwd,
			currentBranch: detected.current,
			homeBranch: record && record.homeBranch ? record.homeBranch : null
		});
	}
	process.exit(1);
}

module.exports = {
	HOME_BRANCH_FILE,
	STRANDED_HEADLINE,
	TEMPORARY_BRANCH_PATTERNS,
	homeBranchPath,
	readHomeBranch,
	writeHomeBranch,
	updateHomeBranchPhase,
	clearHomeBranch,
	isTemporaryBranchName,
	detectTemporaryBranch,
	temporaryBranchRefusal,
	assertNotOnTemporaryBranch
};
