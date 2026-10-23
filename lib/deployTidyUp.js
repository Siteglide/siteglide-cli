/**
 * Deploy's tidy-up step: remove the archives `siteglide-cli-archive` writes under `.tmp/`.
 *
 * Deploy never had one. Pull's tidy-up removes `./.tmp`, but in a merge-first deploy the pull
 * runs before the archive is built, so `.tmp/marketplace-release.zip` (a few MB, untracked)
 * was left behind after every deploy — and the next `git add -A` snapshot would commit it.
 *
 * Only deploy's own files are removed; `.tmp` itself goes only when it is empty afterwards,
 * because export and pull also use it for their own scratch files.
 */

const fs = require('fs');
const path = require('path');
const dir = require('./directories');

const DEPLOY_ARCHIVES = ['marketplace-release.zip', 'assets.zip'];

/**
 * @param {string} [cwd]
 * @returns {{ removed: string[], failed: Array<{ path: string, error: string }>, removedTmpDir: boolean }}
 */
function removeDeployArchives(cwd = process.cwd()) {
	const tmpDir = path.join(cwd, dir.TMP);
	const result = { removed: [], failed: [], removedTmpDir: false };

	if (!fs.existsSync(tmpDir)) {
		return result;
	}

	for (let i = 0; i < DEPLOY_ARCHIVES.length; i++) {
		const rel = `${dir.TMP}/${DEPLOY_ARCHIVES[i]}`;
		const abs = path.join(tmpDir, DEPLOY_ARCHIVES[i]);
		if (!fs.existsSync(abs)) {
			continue;
		}
		try {
			fs.rmSync(abs, { force: true });
			result.removed.push(rel);
		} catch (err) {
			result.failed.push({ path: rel, error: err && err.message ? err.message : String(err) });
		}
	}

	try {
		if (fs.readdirSync(tmpDir).length === 0) {
			fs.rmdirSync(tmpDir);
			result.removedTmpDir = true;
		}
	} catch (err) {
		result.failed.push({ path: dir.TMP, error: err && err.message ? err.message : String(err) });
	}

	return result;
}

/**
 * Remove deploy archives and report through the logger. Never throws: a leftover zip is worth a
 * warning, not a failed deploy.
 *
 * @param {{ cwd?: string, logger?: object, logPrefix?: string }} [opts]
 * @returns {ReturnType<typeof removeDeployArchives>}
 */
function tidyUpAfterDeploy(opts = {}) {
	const logger = opts.logger || require('./logger');
	const prefix = opts.logPrefix || '[deploy]';
	const result = removeDeployArchives(opts.cwd);

	for (let i = 0; i < result.removed.length; i++) {
		logger.Debug(`${prefix} Tidying up: removed ./${result.removed[i]}`);
	}
	if (result.removedTmpDir) {
		logger.Debug(`${prefix} Tidying up: removed ./${dir.TMP}`);
	}
	for (let i = 0; i < result.failed.length; i++) {
		const f = result.failed[i];
		logger.Warn(`${prefix} Tidying up: could not remove ./${f.path} (${f.error}). Delete it by hand — it must not be committed.`, { exit: false });
	}

	return result;
}

module.exports = {
	DEPLOY_ARCHIVES,
	removeDeployArchives,
	tidyUpAfterDeploy
};
