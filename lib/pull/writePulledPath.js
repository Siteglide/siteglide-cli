/**
 * Write selective-pull content to the project tree from a physical_file_path.
 */

const fs = require('fs');
const path = require('path');
const dir = require('../directories');
const logger = require('../logger');
const {
	isPullIgnoredModule,
	isAgentsOnlyPullModule,
	DEFAULT_PULL_IGNORED_MODULES
} = require('../pullIgnoredModules');

const AGENTS_ROOT = '.agents';
const SITEGLIDE_SKILLS_ROOT = path.join('skills', 'siteglide');
const MODULE_AGENTS_DIR_NAMES = ['agents', '.agents'];

/**
 * @param {string} physicalPath
 * @param {string} moduleName
 * @returns {string | null}
 */
function resolveAgentsAssetRelativePath(physicalPath, moduleName) {
	for (let i = 0; i < MODULE_AGENTS_DIR_NAMES.length; i++) {
		const agentsDirName = MODULE_AGENTS_DIR_NAMES[i];
		const markers = [
			`${dir.MODULES}/${moduleName}/public/assets/${agentsDirName}/`,
			`${dir.MODULES}/${moduleName}/assets/${agentsDirName}/`
		];
		for (let m = 0; m < markers.length; m++) {
			const marker = markers[m];
			const idx = physicalPath.indexOf(marker);
			if (idx !== -1) {
				const assetPath = physicalPath.slice(idx + marker.length).replace(/^skills\//, '');
				return path.join(SITEGLIDE_SKILLS_ROOT, assetPath);
			}
		}
	}
	return null;
}

/**
 * @param {string} physicalPath
 * @param {string} [ignoredModules]
 * @returns {{ root: string, relativePath: string } | null}
 */
function resolveWriteTarget(physicalPath, siteRoot = dir.defaultSiteRoot(), ignoredModules = DEFAULT_PULL_IGNORED_MODULES) {
	const normalized = physicalPath.replace(/\\/g, '/');
	const isModuleAsset = normalized === dir.MODULES || normalized.indexOf(`${dir.MODULES}/`) === 0;
	let root = isModuleAsset ? dir.MODULES : siteRoot;
	let relativePath = isModuleAsset
		? normalized.slice(dir.MODULES.length).replace(/^\//, '')
		: normalized;
	if (!relativePath) {
		return null;
	}
	if (isModuleAsset) {
		const moduleName = relativePath.split('/')[0];
		if (isPullIgnoredModule(moduleName, ignoredModules)) {
			logger.Debug(`[pull] Skipping write for ignored module "${moduleName}": ${normalized}`);
			return null;
		}
		if (isAgentsOnlyPullModule(moduleName)) {
			const agentsRelativePath = resolveAgentsAssetRelativePath(normalized, moduleName);
			if (agentsRelativePath) {
				root = AGENTS_ROOT;
				relativePath = agentsRelativePath;
			} else {
				return null;
			}
		}
	}
	return { root, relativePath };
}

/**
 * @param {string} physicalPath
 * @param {string | Buffer} content
 * @param {object} [opts]
 * @returns {string | null} absolute path written
 */
function writePulledPath(physicalPath, content, opts = {}) {
	const siteRoot = opts.siteRoot || dir.defaultSiteRoot();
	const target = resolveWriteTarget(physicalPath, siteRoot, opts.ignoredModules);
	if (!target) {
		return null;
	}
	const fullPath = path.join(target.root, target.relativePath);
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });
	fs.writeFileSync(fullPath, content, logger.Error);
	return fullPath;
}

module.exports = {
	resolveWriteTarget,
	writePulledPath
};
