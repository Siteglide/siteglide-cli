const fs = require('fs-extra'),
	path = require('path'),
	{ execFileSync } = require('child_process'),
	dir = require('./directories'),
	logger = require('./logger');

const gitEnv = {
	...process.env,
	GIT_TERMINAL_PROMPT: '0',
	LC_ALL: 'C'
};

let cachedGitBin;

/**
 * Prefer git.exe on Windows. Spawning the `git.cmd` shim via execFile can drop
 * arguments (leading to `fatal: bad source, source=`).
 */
const resolveGitBin = () => {
	if (cachedGitBin) {
		return cachedGitBin;
	}
	if (process.platform !== 'win32') {
		cachedGitBin = 'git';
		return cachedGitBin;
	}
	try {
		const out = execFileSync('where.exe', ['git'], {
			encoding: 'utf8',
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		const candidates = String(out)
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);
		const exe = candidates.find((candidate) => /\.exe$/i.test(candidate));
		cachedGitBin = exe || candidates[0] || 'git.exe';
	} catch (error) {
		cachedGitBin = 'git.exe';
	}
	return cachedGitBin;
};

const runGit = (args, cwd) => {
	// execFile — no shell (avoids PowerShell glob/arg mangling).
	return execFileSync(resolveGitBin(), args, {
		cwd,
		env: gitEnv,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true
	});
};

const isGitWorkTree = (cwd = process.cwd()) => {
	try {
		runGit(['rev-parse', '--is-inside-work-tree'], cwd);
		return true;
	} catch (error) {
		return false;
	}
};

/** True if git has any indexed paths under marketplace_builder. */
const isLegacyTracked = (cwd) => {
	try {
		const out = runGit(['ls-files', '--', dir.LEGACY_APP], cwd);
		return String(out || '').trim().length > 0;
	} catch (error) {
		return false;
	}
};

/**
 * After a same-volume directory rename, update the index so git records renames
 * (works cross-platform; avoids fragile `git mv` under Windows/Node).
 */
const stageRenameInGit = (cwd) => {
	runGit(['add', '-A', '--', dir.APP, dir.LEGACY_APP], cwd);
};

const toPosixAbs = (cwd, name) => path.resolve(cwd, name).split(path.sep).join('/');

/**
 * Try `git mv` with relative then absolute POSIX paths, using git.exe on Windows.
 * @returns {boolean} true if git mv succeeded
 */
const tryGitMv = (cwd) => {
	const attempts = [
		[dir.LEGACY_APP, dir.APP],
		[toPosixAbs(cwd, dir.LEGACY_APP), toPosixAbs(cwd, dir.APP)]
	];

	let lastDetail = '';
	for (let i = 0; i < attempts.length; i++) {
		const [from, to] = attempts[i];
		try {
			runGit(['mv', from, to], cwd);
			return true;
		} catch (error) {
			lastDetail = (error.stderr || error.stdout || error.message || String(error)).toString().trim();
			logger.Debug(`[pull] git mv attempt failed (${from} → ${to}): ${lastDetail}`);
		}
	}

	logger.Warn(
		`[pull] git mv failed (${lastDetail || 'unknown error'}); using filesystem rename + git add`,
		{ exit: false }
	);
	return false;
};

/**
 * Rename marketplace_builder → app. Prefer git mv when tracked; always fall back to
 * filesystem rename + index update (reliable on Windows PowerShell/CMD).
 *
 * @param {string} cwd
 * @returns {'renamed-git'|'renamed-fs'}
 */
const renameLegacyToApp = async (cwd) => {
	const legacy = path.join(cwd, dir.LEGACY_APP);
	const modern = path.join(cwd, dir.APP);
	const inGit = isGitWorkTree(cwd);
	const tracked = inGit && isLegacyTracked(cwd);

	if (tracked) {
		logger.Info(`[pull] Migrating ${dir.LEGACY_APP}/ → ${dir.APP}/ (platformOS layout, git)`);
		logger.Debug(`[pull] Using git binary: ${resolveGitBin()}`);
		if (tryGitMv(cwd)) {
			return 'renamed-git';
		}
	} else if (inGit) {
		logger.Info(
			`[pull] Migrating ${dir.LEGACY_APP}/ → ${dir.APP}/ (filesystem rename; folder not in git index)`
		);
	} else {
		logger.Info(`[pull] Migrating ${dir.LEGACY_APP}/ → ${dir.APP}/ (platformOS layout)`);
	}

	await fs.move(legacy, modern, { overwrite: false });

	if (inGit) {
		try {
			stageRenameInGit(cwd);
			if (tracked) {
				logger.Info('[pull] Staged rename in git index (history preserved via rename detection)');
			}
		} catch (error) {
			logger.Warn(
				`[pull] Renamed on disk but could not update git index: ${error.message}`,
				{ exit: false }
			);
		}
	}

	return 'renamed-fs';
};

/**
 * platformOS guidance: use `app/` not legacy `marketplace_builder/`.
 * If only the legacy folder exists, rename it to `app`.
 *
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<'renamed-git'|'renamed-fs'|'skipped-both'|'skipped-missing'>}
 */
const migrateMarketplaceBuilderToApp = async (opts = {}) => {
	const cwd = opts.cwd || process.cwd();
	const legacy = path.join(cwd, dir.LEGACY_APP);
	const modern = path.join(cwd, dir.APP);

	if (!(await fs.pathExists(legacy))) {
		return 'skipped-missing';
	}

	if (await fs.pathExists(modern)) {
		logger.Warn(
			`[pull] Both ${dir.LEGACY_APP}/ and ${dir.APP}/ exist — leaving both. Prefer ${dir.APP}/ (platformOS).`,
			{ exit: false }
		);
		return 'skipped-both';
	}

	return renameLegacyToApp(cwd);
};

module.exports = {
	migrateMarketplaceBuilderToApp,
	isGitWorkTree,
	resolveGitBin
};
