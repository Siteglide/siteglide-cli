/**
 * Ensure `.siteglide/IDE/` is gitignored so local CLI metadata does not pollute git status.
 * `.siteglide/cli-settings/` remains committable for team settings (e.g. modules.json).
 */

const fs = require('fs');
const path = require('path');
const { run, getGitReadiness } = require('./readiness');
const { confirmYesNo } = require('../prompts');
const { SITEGLIDE_IDE_IGNORE_ENTRY } = require('../siteglidePaths');

const SITEGLIDE_IGNORE_ENTRY = SITEGLIDE_IDE_IGNORE_ENTRY;
const SITEGLIDE_IGNORE_COMMENT =
	'# Siteglide CLI IDE metadata (sync, pull baselines, locks — ignore to avoid false git conflicts)';

/**
 * @param {string} [cwd]
 * @returns {boolean}
 */
function isSiteglideDirGitignored(cwd = process.cwd()) {
	for (const entry of ['.siteglide/IDE', '.siteglide/IDE/', '.siteglide', '.siteglide/']) {
		const res = run('git', ['check-ignore', '-q', '--', entry], { cwd });
		if (res.ok) {
			return true;
		}
	}
	return false;
}

/**
 * @param {string} content
 * @returns {boolean}
 */
function gitignoreAlreadyListsSiteglide(content) {
	return /(?:^|\n)\s*\.siteglide(?:\/IDE)?\/?\s*(?:#.*)?(?:\n|$)/.test(content);
}

/**
 * @param {string} [cwd]
 * @returns {{ ok: boolean, path?: string, alreadyPresent?: boolean, error?: string }}
 */
function appendSiteglideToGitignore(cwd = process.cwd()) {
	const topLevel = run('git', ['rev-parse', '--show-toplevel'], { cwd });
	if (!topLevel.ok || !topLevel.stdout) {
		return { ok: false, error: 'not a git repository' };
	}

	const gitignorePath = path.join(topLevel.stdout, '.gitignore');
	let content = '';
	if (fs.existsSync(gitignorePath)) {
		content = fs.readFileSync(gitignorePath, 'utf8');
		if (gitignoreAlreadyListsSiteglide(content)) {
			return { ok: true, path: gitignorePath, alreadyPresent: true };
		}
		if (content.length > 0 && !content.endsWith('\n')) {
			content += '\n';
		}
		content += `\n${SITEGLIDE_IGNORE_COMMENT}\n${SITEGLIDE_IGNORE_ENTRY}\n`;
	} else {
		content = `${SITEGLIDE_IGNORE_COMMENT}\n${SITEGLIDE_IGNORE_ENTRY}\n`;
	}

	fs.writeFileSync(gitignorePath, content, 'utf8');
	return { ok: true, path: gitignorePath };
}

/**
 * When git is initialized, prompt to gitignore `.siteglide/IDE/` if it is not already ignored.
 * @param {{ cwd?: string, logger?: object }} [opts]
 * @returns {Promise<{ ok: boolean, skipped?: string, alreadyIgnored?: boolean, declined?: boolean, cancelled?: boolean, path?: string }>}
 */
async function ensureSiteglideGitignored(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const logger = opts.logger || require('../logger');

	if (!getGitReadiness({ cwd }).repoInitialized) {
		return { ok: true, skipped: 'no_repo' };
	}

	if (isSiteglideDirGitignored(cwd)) {
		return { ok: true, alreadyIgnored: true };
	}

	if (!process.stdin.isTTY || process.env.CI) {
		logger.Warn(
			'[pull] .siteglide/IDE/ is not in .gitignore. Siteglide CLI updates this folder during sync, deploy, and pull, which can create false appearances of conflict in git. Add ".siteglide/IDE/" to .gitignore when you can.',
			{ exit: false }
		);
		return { ok: true, skipped: 'non_interactive' };
	}

	const answer = await confirmYesNo(
		'The .siteglide/IDE/ folder is not git-ignored. Siteglide CLI writes sync and pull metadata there — that can create false appearances of conflict in git. Add .siteglide/IDE/ to .gitignore? (cli-settings/ stays committable)',
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
	if (result.alreadyPresent) {
		return { ok: true, alreadyIgnored: true, path: result.path };
	}
	logger.Success(`[pull] Added ${SITEGLIDE_IGNORE_ENTRY} to .gitignore`);
	return { ok: true, path: result.path };
}

module.exports = {
	SITEGLIDE_IGNORE_ENTRY,
	SITEGLIDE_IGNORE_COMMENT,
	isSiteglideDirGitignored,
	gitignoreAlreadyListsSiteglide,
	appendSiteglideToGitignore,
	ensureSiteglideGitignored
};
