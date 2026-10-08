/**
 * Ensure `.siteglide/user/` is gitignored so local CLI metadata does not pollute git status.
 * `.siteglide/project/` remains committable for team settings (e.g. modules.json).
 */

const fs = require('fs');
const path = require('path');
const { run, getGitReadiness } = require('./readiness');
const { confirmYesNo } = require('../prompts');
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
 * @param {{ cwd?: string, logger?: object }} opts
 * @param {boolean} configured
 * @returns {Promise<{ ok: boolean, skipped?: string, cancelled?: boolean, declined?: boolean, untracked?: string[] }>}
 */
async function promptUntrackSiteglideUserIfNeeded(opts, configured) {
	const cwd = opts.cwd || process.cwd();
	const logger = opts.logger || require('../logger');
	const tracked = listTrackedSiteglideUserFiles(cwd);

	if (tracked.length === 0) {
		return { ok: true };
	}

	if (!process.stdin.isTTY || process.env.CI) {
		const hint = configured
			? '[pull] .siteglide/user/ is listed in .gitignore but still tracked by git. Run: git rm -r --cached -- .siteglide/user'
			: '[pull] After adding .siteglide/user/ to .gitignore, run: git rm -r --cached -- .siteglide/user';
		logger.Warn(hint, { exit: false });
		return { ok: true, skipped: 'non_interactive' };
	}

	const count = tracked.length;
	const fileWord = count === 1 ? 'file' : 'files';
	const question = configured
		? `.siteglide/user/ is in .gitignore but ${count} ${fileWord} under it are still tracked by git (ignore rules do not apply until they are untracked). Stop tracking .siteglide/user/ now? Files stay on disk.`
		: `${count} ${fileWord} under .siteglide/user/ are tracked by git. Stop tracking .siteglide/user/ so .gitignore can take effect? Files stay on disk.`;

	const answer = await confirmYesNo(question, { default: true });
	if (answer == null) {
		return { ok: true, cancelled: true };
	}
	if (!answer) {
		return { ok: true, declined: true };
	}

	const untrack = untrackSiteglideUserFromGit(cwd);
	if (!untrack.ok) {
		logger.Warn(`[pull] Could not untrack .siteglide/user/: ${untrack.error || 'unknown error'}`, { exit: false });
		return untrack;
	}

	logger.Success(`[pull] Stopped tracking ${untrack.untracked.length} file(s) under .siteglide/user/`);
	return { ok: true, untracked: untrack.untracked };
}

/**
 * When git is initialized, prompt to gitignore `.siteglide/user/` if it is not already ignored.
 * @param {{ cwd?: string, logger?: object }} [opts]
 * @returns {Promise<{ ok: boolean, skipped?: string, alreadyIgnored?: boolean, declined?: boolean, cancelled?: boolean, path?: string, untracked?: string[] }>}
 */
async function ensureSiteglideGitignored(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const logger = opts.logger || require('../logger');

	if (!getGitReadiness({ cwd }).repoInitialized) {
		return { ok: true, skipped: 'no_repo' };
	}

	const configured = isSiteglideUserIgnoreConfigured(cwd);
	const tracked = listTrackedSiteglideUserFiles(cwd);

	if (configured && tracked.length === 0) {
		return { ok: true, alreadyIgnored: true };
	}

	if (configured && tracked.length > 0) {
		const untrackResult = await promptUntrackSiteglideUserIfNeeded(opts, true);
		return { ...untrackResult, alreadyIgnored: true };
	}

	if (!process.stdin.isTTY || process.env.CI) {
		logger.Warn(
			'[pull] .siteglide/user/ is not in .gitignore. Siteglide CLI updates this folder during sync, deploy, and pull, which can create false appearances of conflict in git. Add ".siteglide/user/" to .gitignore when you can.',
			{ exit: false }
		);
		return { ok: true, skipped: 'non_interactive' };
	}

	const answer = await confirmYesNo(
		'The .siteglide/user/ folder is not git-ignored. Siteglide CLI writes sync and pull metadata there — that can create false appearances of conflict in git. Add .siteglide/user/ to .gitignore? (project/ stays committable)',
		{ default: true }
	);
	if (answer == null) {
		return { ok: true, cancelled: true };
	}
	if (!answer) {
		return { ok: true, declined: true };
	}

	const result = appendSiteglideToGitignore(cwd);
	if (!result.ok) {
		logger.Warn(`[pull] Could not update .gitignore: ${result.error || 'unknown error'}`, { exit: false });
		return result;
	}
	if (!result.alreadyPresent) {
		logger.Success(`[pull] Added ${SITEGLIDE_IGNORE_ENTRY} to .gitignore`);
	}

	const untrackResult = await promptUntrackSiteglideUserIfNeeded(opts, true);
	return { ok: true, path: result.path, ...untrackResult };
}

module.exports = {
	SITEGLIDE_IGNORE_ENTRY,
	SITEGLIDE_IGNORE_COMMENT,
	getGitRepoRoot,
	readSiteglideIgnoreRuleSources,
	isSiteglideUserIgnoreConfigured,
	listTrackedSiteglideUserFiles,
	untrackSiteglideUserFromGit,
	isSiteglideDirGitignored,
	gitignoreAlreadyListsSiteglide,
	appendSiteglideToGitignore,
	ensureSiteglideGitignored
};
