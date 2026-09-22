/**
 * Collect unixified physical_file_path strings that a deploy archive would include.
 * Used to build lastDeploy.paths after a successful deploy.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const dir = require('./directories');

/**
 * Normalize to API physical path (forward slashes, no site-root prefix for app files;
 * modules keep modules/<name>/...).
 * @param {string} filePath
 * @param {string | null} siteRoot
 */
function toApiPath(filePath, siteRoot) {
	let p = filePath.replace(/\\/g, '/');
	if (siteRoot && p.startsWith(`${siteRoot}/`)) {
		p = p.slice(siteRoot.length + 1);
	}
	return p;
}

/**
 * @param {{ withAssets?: boolean, cwd?: string }} [opts]
 * @returns {string[]}
 */
function collectDeployManifestPaths(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const withAssets = !!opts.withAssets;
	const siteRoot = dir.currentApp();
	const paths = new Set();

	if (siteRoot) {
		const pattern = path.join(cwd, siteRoot, '**', '*').replace(/\\/g, '/');
		const ignore = withAssets
			? ['**/node_modules/**']
			: ['**/node_modules/**', '**/assets/**'];
		const files = glob.sync(pattern, { nodir: true, ignore, cwd: path.join(cwd, siteRoot), absolute: false });
		// glob with cwd set differently — use simpler approach
	}

	if (siteRoot && fs.existsSync(path.join(cwd, siteRoot))) {
		const rootAbs = path.join(cwd, siteRoot);
		const files = glob.sync('**/*', {
			cwd: rootAbs,
			nodir: true,
			ignore: withAssets ? ['**/node_modules/**'] : ['**/node_modules/**', 'assets/**', '**/assets/**']
		});
		for (const f of files) {
			paths.add(toApiPath(`${siteRoot}/${f.replace(/\\/g, '/')}`, siteRoot));
		}
	}

	const modulesAbs = path.join(cwd, dir.MODULES);
	if (fs.existsSync(modulesAbs)) {
		const moduleNames = glob.sync('*/', { cwd: modulesAbs });
		for (const mod of moduleNames) {
			const name = mod.replace(/\/$/, '');
			const modFiles = glob.sync('?(public|private)/**', {
				cwd: path.join(modulesAbs, name),
				nodir: true
			});
			for (const f of modFiles) {
				const unix = f.replace(/\\/g, '/');
				if (!withAssets && (unix.startsWith('public/assets/') || unix.startsWith('private/assets/'))) {
					continue;
				}
				paths.add(`modules/${name}/${unix}`);
			}
		}
	}

	return [...paths].sort();
}

module.exports = {
	collectDeployManifestPaths,
	toApiPath
};
