const fs = require('fs-extra'),
	path = require('path'),
	dir = require('./directories'),
	logger = require('./logger'),
	Confirm = require('./confirm');

/**
 * TEMPORARY: ask before renaming marketplace_builder → app (remove later).
 * Lets you keep legacy layout on production sites while testing a newer CLI.
 *
 * @returns {Promise<boolean>} true if user answered Y
 */
const confirmRenameLegacyToApp = async () => {
	logger.Info(
		`This project still uses ${dir.LEGACY_APP}/. platformOS (and AI tools) prefer ${dir.APP}/ — ` +
			'renaming keeps the layout tidier and helps AI tools recognise the code structure.'
	);
	logger.Info(
		'(Temporary prompt — say n to leave marketplace_builder/ alone, e.g. for an older CLI on other projects.)'
	);
	const answer = await Confirm(
		`Rename ${dir.LEGACY_APP}/ → ${dir.APP}/ before pull? (Y/n)\n`
	);
	return answer === 'Y';
};

/**
 * Rename marketplace_builder → app on disk only (no git staging — large trees
 * can hit ENOBUFS on Windows; users stage/commit themselves if they want).
 *
 * @param {string} cwd
 * @returns {Promise<'renamed-fs'>}
 */
const renameLegacyToApp = async (cwd) => {
	const legacy = path.join(cwd, dir.LEGACY_APP);
	const modern = path.join(cwd, dir.APP);

	logger.Info(`[pull] Migrating ${dir.LEGACY_APP}/ → ${dir.APP}/ (filesystem rename)`);
	await fs.move(legacy, modern, { overwrite: false });
	logger.Info(
		`[pull] Renamed ${dir.LEGACY_APP}/ → ${dir.APP}/. ` +
			'Stage and commit in git yourself if you want rename history recorded.'
	);
	return 'renamed-fs';
};

/**
 * platformOS guidance: use `app/` not legacy `marketplace_builder/`.
 * If only the legacy folder exists, rename it to `app`.
 *
 * @param {{ cwd?: string, skipConfirm?: boolean }} [opts]
 * @returns {Promise<'renamed-fs'|'skipped-both'|'skipped-missing'|'skipped-declined'>}
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

	// TEMPORARY confirm — remove skipConfirm default / prompt when ready to always migrate.
	if (!opts.skipConfirm) {
		const ok = await confirmRenameLegacyToApp();
		if (!ok) {
			logger.Info(
				`[pull] Keeping ${dir.LEGACY_APP}/ (pull will write there). Prefer ${dir.APP}/ when you can.`
			);
			return 'skipped-declined';
		}
	}

	return renameLegacyToApp(cwd);
};

/**
 * Which folder pull should write site files into after migrate.
 * Prefer app/ when present; otherwise marketplace_builder/ if that was kept.
 *
 * @param {string} [cwd]
 * @returns {Promise<string>}
 */
const resolveSiteAppRoot = async (cwd = process.cwd()) => {
	if (await fs.pathExists(path.join(cwd, dir.APP))) {
		return dir.APP;
	}
	if (await fs.pathExists(path.join(cwd, dir.LEGACY_APP))) {
		return dir.LEGACY_APP;
	}
	return dir.APP;
};

/**
 * Resolve exclusive site root for sync/deploy: `app/` OR `marketplace_builder/`.
 * If both exist, warns and exits — source of truth is ambiguous.
 *
 * @param {string} [cwd]
 * @returns {string|null} Folder name, or null if neither exists
 */
const assertExclusiveSiteAppRoot = (cwd = process.cwd()) => {
	if (dir.bothAppRootsExist(cwd)) {
		logger.Error(
			`Both ${dir.APP}/ and ${dir.LEGACY_APP}/ exist. ` +
				'Sort out which is the source of truth (keep one, remove or rename the other) before continuing.'
		);
	}
	return dir.currentApp(cwd) || null;
};

module.exports = {
	migrateMarketplaceBuilderToApp,
	resolveSiteAppRoot,
	assertExclusiveSiteAppRoot
};
