/**
 * Ensure `.siteglide/user/` is gitignored so local CLI metadata does not pollute git status.
 * `.siteglide/project/` remains committable for team settings (e.g. modules.json).
 */

const fs = require('fs');
const path = require('path');
const { run, getGitReadiness } = require('./readiness');
const { GITIGNORE_USER_LINE, GITIGNORE_SECRETS_LINE } = require('../siteglidePaths');

const SITEGLIDE_IGNORE_ENTRY = GITIGNORE_USER_LINE;
const SITEGLIDE_IGNORE_COMMENT =
	'# Siteglide CLI local runtime (sync, pull baselines, locks — ignore to avoid false git conflicts)';

/** Paths probed with `git check-ignore --no-index` from the repository root. */
const SITEGLIDE_USER_IGNORE_PROBE_PATHS = [
	GITIGNORE_USER_LINE,
	'.siteglide/user',
	'.siteglide/user/sync/example.json',
	'.siteglide',
	'.siteglide/'
];

/**
 * @param {string} [cwd]
 * @returns {string | null}
 */
function getGitRepoRoot(cwd = process.cwd()) {
	const topLevel = run('git', ['rev-parse', '--show-toplevel'], { cwd });
	if (!topLevel.ok || !topLevel.stdout) {
		return null;
	}
	return topLevel.stdout;
}

/**
 * Ignore rules that would apply to new paths under `.siteglide/user/`.
 * Uses `--no-index` from the repo root so tracked files and cwd subfolders do not skew results.
 * @param {string} [cwd]
 * @returns {boolean}
 */
function isSiteglideUserIgnoreConfigured(cwd = process.cwd()) {
	const root = getGitRepoRoot(cwd);
	if (!root) {
		return false;
	}

	for (const entry of SITEGLIDE_USER_IGNORE_PROBE_PATHS) {
		const res = run('git', ['check-ignore', '-q', '--no-index', '--', entry], { cwd: root });
		if (res.ok) {
			return true;
		}
	}

	for (const content of readSiteglideIgnoreRuleSources(root)) {
		if (gitignoreAlreadyListsSiteglide(content)) {
			return true;
		}
	}

	return false;
}

/**
 * @param {string} repoRoot
 * @returns {string[]}
 */
function readSiteglideIgnoreRuleSources(repoRoot) {
	/** @type {string[]} */
	const sources = [];

	const gitignorePath = path.join(repoRoot, '.gitignore');
	if (fs.existsSync(gitignorePath)) {
		sources.push(fs.readFileSync(gitignorePath, 'utf8'));
	}

	const excludePath = path.join(repoRoot, '.git', 'info', 'exclude');
	if (fs.existsSync(excludePath)) {
		sources.push(fs.readFileSync(excludePath, 'utf8'));
	}

	const globalExclude = run('git', ['config', '--get', 'core.excludesfile'], { cwd: repoRoot });
	if (globalExclude.ok && globalExclude.stdout) {
		const globalPath = path.isAbsolute(globalExclude.stdout)
			? globalExclude.stdout
			: path.join(repoRoot, globalExclude.stdout);
		if (fs.existsSync(globalPath)) {
			sources.push(fs.readFileSync(globalPath, 'utf8'));
		}
	}

	return sources;
}

/**
 * @param {string} [cwd]
 * @returns {string[]}
 */
function listTrackedSiteglideUserFiles(cwd = process.cwd()) {
	const root = getGitRepoRoot(cwd);
	if (!root) {
		return [];
	}

	const res = run('git', ['ls-files', '--', '.siteglide/user', '.siteglide/user/'], { cwd: root });
	if (!res.ok || !res.stdout) {
		return [];
	}

	return res.stdout.split(/\r?\n/).filter(Boolean);
}

/**
 * @param {string} rev commit or tree-ish
 * @param {string} [cwd]
 * @returns {string[]}
 */
function listTrackedSiteglideUserFilesAtRevision(rev, cwd = process.cwd()) {
	const root = getGitRepoRoot(cwd);
	if (!root || !rev) {
		return [];
	}

	const res = run('git', ['ls-tree', '-r', '--name-only', rev, '--', '.siteglide/user'], { cwd: root });
	if (!res.ok || !res.stdout) {
		return [];
	}

	return res.stdout.split(/\r?\n/).filter(Boolean);
}

/**
 * Stop tracking `.siteglide/user/` (and everything under it) while keeping files on disk.
 * @param {string} [cwd]
 * @returns {{ ok: boolean, untracked?: string[], error?: string, stderr?: string }}
 */
function untrackSiteglideUserFromGit(cwd = process.cwd()) {
	const root = getGitRepoRoot(cwd);
	if (!root) {
		return { ok: false, error: 'not a git repository' };
	}

	const trackedBefore = listTrackedSiteglideUserFiles(root);
	if (trackedBefore.length === 0) {
		return { ok: true, untracked: [] };
	}

	const res = run('git', ['rm', '-r', '--cached', '--ignore-unmatch', '--', '.siteglide/user'], { cwd: root });
	if (!res.ok) {
		return { ok: false, error: 'git rm failed', stderr: res.stderr };
	}

	return { ok: true, untracked: trackedBefore };
}

/**
 * @param {string} [cwd]
 * @returns {boolean}
 */
function isSiteglideDirGitignored(cwd = process.cwd()) {
	return isSiteglideUserIgnoreConfigured(cwd);
}

/**
 * @param {string} content
 * @returns {boolean}
 */
function gitignoreAlreadyListsSiteglide(content) {
	return /(?:^|\n)\s*\.siteglide(?:\/user(?:\/\*\*)?)?\/?\s*(?:#.*)?(?:\n|$)/.test(content);
}

/**
 * @param {string} [cwd]
 * @returns {{ ok: boolean, path?: string, alreadyPresent?: boolean, error?: string }}
 */
function appendSiteglideToGitignore(cwd = process.cwd()) {
	const root = getGitRepoRoot(cwd);
	if (!root) {
		return { ok: false, error: 'not a git repository' };
	}

	const gitignorePath = path.join(root, '.gitignore');
	let content = '';
	if (fs.existsSync(gitignorePath)) {
		content = fs.readFileSync(gitignorePath, 'utf8');
		if (gitignoreAlreadyListsSiteglide(content)) {
			return { ok: true, path: gitignorePath, alreadyPresent: true };
		}
		if (content.length > 0 && !content.endsWith('\n')) {
			content += '\n';
		}
		content += `\n${SITEGLIDE_IGNORE_COMMENT}\n${SITEGLIDE_IGNORE_ENTRY}\n${GITIGNORE_SECRETS_LINE}\n`;
	} else {
		content = `${SITEGLIDE_IGNORE_COMMENT}\n${SITEGLIDE_IGNORE_ENTRY}\n${GITIGNORE_SECRETS_LINE}\n`;
	}

	fs.writeFileSync(gitignorePath, content, 'utf8');
	return { ok: true, path: gitignorePath };
}

/**
 * Append .gitignore rules and untrack `.siteglide/user/` when needed (no prompts).
 *
 * @param {{ cwd?: string, logger?: object, logPrefix?: string }} [opts]
 * @returns {{ ok: boolean, skipped?: string, alreadyIgnored?: boolean, path?: string, gitignoreAdded?: boolean, untracked?: string[] }}
 */
function applySiteglideUserGitIgnorePolicy(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const logger = opts.logger || require('../logger');
	const prefix = opts.logPrefix || '[siteglide]';

	if (!getGitReadiness({ cwd }).repoInitialized) {
		return { ok: true, skipped: 'no_repo' };
	}

	const configured = isSiteglideUserIgnoreConfigured(cwd);
	const tracked = listTrackedSiteglideUserFiles(cwd);

	if (configured && tracked.length === 0) {
		return { ok: true, alreadyIgnored: true };
	}

	let gitignoreAdded = false;
	let gitignorePath;

	if (!configured) {
		const result = appendSiteglideToGitignore(cwd);
		if (!result.ok) {
			logger.Warn(`${prefix} Could not update .gitignore: ${result.error || 'unknown error'}`, { exit: false });
			return result;
		}
		gitignorePath = result.path;
		if (!result.alreadyPresent) {
			gitignoreAdded = true;
			logger.Success(`${prefix} Added ${SITEGLIDE_IGNORE_ENTRY} to .gitignore`);
		}
	}

	const trackedAfterIgnore = listTrackedSiteglideUserFiles(cwd);
	if (trackedAfterIgnore.length === 0) {
		return {
			ok: true,
			alreadyIgnored: configured && !gitignoreAdded,
			path: gitignorePath,
			gitignoreAdded
		};
	}

	const untrack = untrackSiteglideUserFromGit(cwd);
	if (!untrack.ok) {
		logger.Warn(`${prefix} Could not untrack .siteglide/user/: ${untrack.error || 'unknown error'}`, { exit: false });
		return untrack;
	}

	if (untrack.untracked && untrack.untracked.length > 0) {
		logger.Success(`${prefix} Stopped tracking ${untrack.untracked.length} file(s) under .siteglide/user/`);
	}

	return {
		ok: true,
		path: gitignorePath,
		gitignoreAdded,
		untracked: untrack.untracked
	};
}

/**
 * When git is initialized, ensure `.siteglide/user/` is gitignored and untracked.
 * @param {{ cwd?: string, logger?: object, logPrefix?: string }} [opts]
 * @returns {{ ok: boolean, skipped?: string, alreadyIgnored?: boolean, path?: string, gitignoreAdded?: boolean, untracked?: string[] }}
 */
async function ensureSiteglideGitignored(opts = {}) {
	return applySiteglideUserGitIgnorePolicy(
		Object.assign({}, opts, { logPrefix: opts.logPrefix || '[pull]' })
	);
}

module.exports = {
	SITEGLIDE_IGNORE_ENTRY,
	SITEGLIDE_IGNORE_COMMENT,
	getGitRepoRoot,
	readSiteglideIgnoreRuleSources,
	isSiteglideUserIgnoreConfigured,
	listTrackedSiteglideUserFiles,
	listTrackedSiteglideUserFilesAtRevision,
	untrackSiteglideUserFromGit,
	isSiteglideDirGitignored,
	gitignoreAlreadyListsSiteglide,
	appendSiteglideToGitignore,
	applySiteglideUserGitIgnorePolicy,
	ensureSiteglideGitignored
};
