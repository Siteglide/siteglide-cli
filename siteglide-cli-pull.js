#!/usr/bin/env node

const program = require('commander'),
	ora = require('ora'),
	fs = require('fs-extra'),
	logger = require('./lib/logger'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	version = require('./package.json').version,
	downloadFile = require('./lib/downloadFile'),
	waitForStatus = require('./lib/data/waitForStatus'),
	Gateway = require('./lib/proxy'),
	Confirm = require('./lib/confirm'),
	getBinary = require('./lib/assets/getBinary'),
	unzip = require('./lib/unzip'),
	path = require('path'),
	dir = require('./lib/directories');

const pullSpinner = ora({ text: 'Pulling files', stream: process.stdout });

/**
 * Copy each child of `srcDir` into `destDir` (merge/overwrite).
 * Used instead of copying a folder into its parent, which fs-extra cannot do safely.
 *
 * @param {string} srcDir - Source directory whose children should be copied.
 * @param {string} destDir - Destination directory to receive those children.
 * Side effects: writes/overwrites files and folders under destDir.
 */
const copyChildren = async (srcDir, destDir) => {
	await fs.ensureDir(destDir);
	const children = await fs.readdir(srcDir);
	for (let i = 0; i < children.length; i++) {
		const name = children[i];
		await fs.copy(path.join(srcDir, name), path.join(destDir, name), { overwrite: true });
	}
};

/**
 * Remove empty directories left under a pull root after restructuring.
 *
 * @param {string} root - Relative directory to scan (e.g. marketplace_builder).
 * Side effects: deletes empty child directories under `./${root}`; logs non-ENOTEMPTY errors.
 */
const cleanupEmptyDirs = async (root) => {
	const rootPath = `./${root}`;
	if (!(await fs.pathExists(rootPath))) {
		return;
	}
	const entries = await fs.readdir(rootPath);
	for (let i = 0; i < entries.length; i++) {
		const folder = path.join(rootPath, entries[i]);
		const stat = await fs.stat(folder);
		if (!stat.isDirectory()) {
			continue;
		}
		try {
			await fs.rmdir(folder);
		} catch (e) {
			if (e.code !== 'ENOTEMPTY') {
				logger.Error(e);
			}
		}
	}
};

/**
 * If a pull extract contains a nested `modules/` folder, merge it into `./modules`
 * (project root), then delete the nested copy. Siteglide expects modules at `./modules`,
 * not under `marketplace_builder/modules`.
 *
 * @param {string} fromRoot - Relative directory that may contain `modules/` (e.g. marketplace_builder or .tmp/...).
 * Side effects: creates `./modules` if needed; copies module files into it (overwrites); deletes `${fromRoot}/modules`.
 * No-op if `${fromRoot}/modules` does not exist.
 */
const moveModulesToRoot = async (fromRoot) => {
	const modulesPath = `./${fromRoot}/modules`;
	if (!(await fs.pathExists(modulesPath))) {
		return;
	}
	logger.Info(`[pull] Moving ./${fromRoot}/modules → ./${dir.MODULES}`);
	await fs.ensureDir(`./${dir.MODULES}`);
	await fs.copy(modulesPath, `./${dir.MODULES}`, { overwrite: true });
	await fs.remove(modulesPath);
};

/**
 * Download the main site backup zip and convert it into local `marketplace_builder/`.
 * Calls Siteglide-API `/cli/backup` then `/cli/backupStatus/:id` (no module_name).
 *
 * @param {Gateway} gateway - Authenticated API client for the current environment.
 * Side effects: writes/overwrites `./marketplace_builder`; may merge into `./modules`;
 * updates `pullSpinner` text; downloads then deletes a temporary zip.
 */
const pullSiteZip = async (gateway) => {
	logger.Info('[pull] Step: downloading main site zip (no module_name)');
	const filename = `${dir.LEGACY_APP}.zip`;
	pullSpinner.text = 'Pulling site files';
	const pullTask = await gateway.pullZip();
	logger.Info(`[pull] Site backup started (id: ${pullTask.id})`);
	const readyTask = await waitForStatus(() => gateway.pullZipStatus(pullTask.id));
	logger.Info(`[pull] Site backup ready (status: ${readyTask.status}) — downloading zip`);
	await downloadFile(readyTask.zip_file.url, filename);
	logger.Info(`[pull] Unzipping site into ./${dir.LEGACY_APP} and converting app/ → marketplace_builder`);
	await unzip(filename, dir.LEGACY_APP);
	await copyChildren(`./${dir.LEGACY_APP}/app`, `./${dir.LEGACY_APP}`);
	await fs.remove(`./${filename}`);
	await moveModulesToRoot(dir.LEGACY_APP);
	if (await fs.pathExists(`./${dir.LEGACY_APP}/asset_manifest.json`)) {
		await fs.remove(`./${dir.LEGACY_APP}/asset_manifest.json`);
	}
	await fs.remove(`./${dir.LEGACY_APP}/app`);
	await cleanupEmptyDirs(dir.LEGACY_APP);
	logger.Info('[pull] Site files pull complete');
};

/**
 * Download one module's public-files backup and merge it into `./modules/<moduleName>/`.
 * Calls Siteglide-API `/cli/backup` with `module_name`, then polls `/cli/backupStatus/:id`.
 * Does not clear `marketplace_builder`.
 *
 * @param {Gateway} gateway - Authenticated API client for the current environment.
 * @param {string} moduleName - Installed module machine name to pull.
 * @param {number} index - 1-based position in the current pull queue (for logs).
 * @param {number} total - Total modules in the current pull queue (for logs).
 * Side effects: writes/overwrites files under `./modules`; updates `pullSpinner` text;
 * uses then deletes a temp zip and `.tmp/pull-<moduleName>` work directory.
 */
const pullModuleZip = async (gateway, moduleName, index, total) => {
	logger.Info(`[pull] Step: module ${index}/${total} — "${moduleName}"`);
	const filename = `${dir.MODULES}-${moduleName}.zip`;
	const workDir = path.join(dir.TMP, `pull-${moduleName}`);
	pullSpinner.text = `Pulling module: ${moduleName}`;
	const pullTask = await gateway.pullZip({ module_name: moduleName });
	logger.Info(`[pull] Module "${moduleName}" backup started (id: ${pullTask.id})`);
	const readyTask = await waitForStatus(() => gateway.pullZipStatus(pullTask.id));
	logger.Info(`[pull] Module "${moduleName}" backup ready (status: ${readyTask.status}) — downloading zip`);
	await downloadFile(readyTask.zip_file.url, filename);
	await fs.remove(workDir);
	await unzip(filename, workDir);
	await fs.remove(`./${filename}`);

	if (await fs.pathExists(`./${workDir}/app`)) {
		await copyChildren(`./${workDir}/app`, `./${workDir}`);
		await fs.remove(`./${workDir}/app`);
	}

	await moveModulesToRoot(workDir);

	// Some module zips nest files as <moduleName>/... instead of modules/<moduleName>/...
	const directModulePath = `./${workDir}/${moduleName}`;
	if (await fs.pathExists(directModulePath)) {
		logger.Info(`[pull] Module "${moduleName}" zip used direct layout; copying into ./${dir.MODULES}/${moduleName}`);
		await fs.ensureDir(`./${dir.MODULES}/${moduleName}`);
		await fs.copy(directModulePath, `./${dir.MODULES}/${moduleName}`, { overwrite: true });
	}

	if (await fs.pathExists(`./${workDir}`)) {
		await fs.remove(`./${workDir}`);
	}
	logger.Info(`[pull] Module "${moduleName}" pull complete`);
};

/**
 * Fetch the asset file list from Siteglide-API `/cli/pull` and download matching text/binary assets
 * by physical_file_path. Paths under `modules/` are written to `./modules/...`; everything else
 * goes under `./marketplace_builder/...` so this step does not recreate `marketplace_builder/modules`.
 *
 * @param {Gateway} gateway - Authenticated API client for the current environment.
 * Side effects: creates dirs and writes/overwrites asset files under `./marketplace_builder` or `./modules`;
 * updates `pullSpinner` text; downloads each asset from its remote_url.
 */
const pullAssets = async (gateway) => {
	logger.Info('[pull] Step: downloading assets via /cli/pull');
	pullSpinner.text = 'Pulling assets';
	const response = await gateway.pull();
	const asset_files = [];
	const assets = response.asset || [];
	logger.Info(`[pull] Asset list returned ${assets.length} file(s); filtering by extension`);
	const time = '?updated=' + new Date().getTime();
	await Promise.all(assets.map(async function (file) {
		const urlToTest = file.data.remote_url.toLowerCase();
		return new Promise(async function (resolve) {
			if (
				(urlToTest.indexOf('.css') > -1) ||
				(urlToTest.indexOf('.js') > -1) ||
				(urlToTest.indexOf('.scss') > -1) ||
				(urlToTest.indexOf('.sass') > -1) ||
				(urlToTest.indexOf('.less') > -1) ||
				(urlToTest.indexOf('.txt') > -1) ||
				(urlToTest.indexOf('.html') > -1) ||
				(urlToTest.indexOf('.svg') > -1) ||
				(urlToTest.indexOf('.map') > -1) ||
				(urlToTest.indexOf('.json') > -1) ||
				(urlToTest.indexOf('.htm') > -1)
			) {
				await getBinary(file.data.remote_url, time).then(body => {
					if (body !== 'error_missing_file') {
						file.data.body = body;
						asset_files.push(file);
					}
					resolve();
				});
			} else {
				resolve();
			}
		});
	}));
	let moduleAssetCount = 0;
	asset_files.forEach(file => {
		const physicalPath = file.data.physical_file_path.replace(/\\/g, '/');
		const isModuleAsset = physicalPath === dir.MODULES || physicalPath.indexOf(dir.MODULES + '/') === 0;
		const root = isModuleAsset ? dir.MODULES : dir.LEGACY_APP;
		const relativePath = isModuleAsset
			? physicalPath.slice(dir.MODULES.length).replace(/^\//, '')
			: physicalPath;
		if (isModuleAsset) {
			moduleAssetCount++;
		}
		if (!relativePath) {
			return;
		}
		const fullPath = path.join(root, relativePath);
		fs.mkdirSync(path.dirname(fullPath), { recursive: true });
		fs.writeFileSync(fullPath, file.data.body, logger.Error);
	});
	logger.Info(`[pull] Wrote ${asset_files.length} asset file(s) (${moduleAssetCount} under ./${dir.MODULES})`);
};

/**
 * Final local cleanup after site/module/asset pulls have finished.
 *
 * Side effects: removes leftover pull zips (`marketplace_builder.zip`, `modules-*.zip`),
 * removes `./.tmp` if present, moves any leftover `marketplace_builder/modules` into `./modules`
 * then deletes that nested folder, removes empty dirs under `marketplace_builder`;
 * updates `pullSpinner` text and writes tidying-up logs.
 */
const tidyUpAfterPull = async () => {
	logger.Info('[pull] Step: tidying up local files');
	pullSpinner.text = 'Tidying up...';

	const siteZip = `./${dir.LEGACY_APP}.zip`;
	if (await fs.pathExists(siteZip)) {
		await fs.remove(siteZip);
		logger.Info(`[pull] Removed leftover ${siteZip}`);
	}

	const cwdEntries = await fs.readdir('.');
	for (let i = 0; i < cwdEntries.length; i++) {
		const name = cwdEntries[i];
		if (name.indexOf(`${dir.MODULES}-`) === 0 && name.slice(-4) === '.zip') {
			await fs.remove(`./${name}`);
			logger.Info(`[pull] Removed leftover ./${name}`);
		}
	}

	if (await fs.pathExists(`./${dir.TMP}`)) {
		await fs.remove(`./${dir.TMP}`);
		logger.Info(`[pull] Removed ./${dir.TMP}`);
	}

	// Pull must not leave modules nested under marketplace_builder
	const nestedModules = `./${dir.LEGACY_APP}/modules`;
	if (await fs.pathExists(nestedModules)) {
		await moveModulesToRoot(dir.LEGACY_APP);
	}
	if (await fs.pathExists(nestedModules)) {
		await fs.remove(nestedModules);
		logger.Info(`[pull] Removed leftover ${nestedModules}`);
	}

	await cleanupEmptyDirs(dir.LEGACY_APP);
	logger.Info('[pull] Tidying up complete');
};

/**
 * Decide which installed modules to pull for this run.
 *
 * @param {string[]} installedModules - Module names returned by `/cli/list_modules`.
 * @param {string|undefined} moduleFilter - Optional `-m` value; when set, only that module is selected.
 * @returns {string[]|null} Modules to pull, or `null` if `moduleFilter` is set but not installed.
 * Side effects: none.
 */
const selectModules = (installedModules, moduleFilter) => {
	if (!moduleFilter) {
		return installedModules;
	}
	if (installedModules.indexOf(moduleFilter) === -1) {
		return null;
	}
	return [moduleFilter];
};

program
	.version(version, '-v, --version')
	.name('siteglide-cli pull')
	.usage('<env>')
	.description('Pull site files into marketplace_builder and module public files into modules/. Overwrites local files. By default pulls all installed modules; use -m to filter to one module.')
	.arguments('[environment]', 'Name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-i --ignore-assets', 'Do not download assets such as CSS, JS, JSON etc', false)
	.option('-m --module <module>', 'Optional module name filter. Without this flag, all installed modules are pulled.')
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const ignoreAssets = params.ignoreAssets;
		const moduleFilter = params.module;
		const authData = fetchAuthData(environment, program);
		const gateway = new Gateway(authData);

		return Confirm('Are you sure you would like to pull? This will overwrite your local files immediately! (Y/n)\n').then(async function (response) {
			if (response === 'Y') {
				try {
					pullSpinner.start();
					logger.Info('[pull] Confirmed — starting pull');
					if (moduleFilter) {
						logger.Info(`[pull] Module filter (-m): "${moduleFilter}"`);
					} else {
						logger.Info('[pull] No -m filter — will pull all installed modules');
					}
					if (ignoreAssets) {
						logger.Info('[pull] --ignore-assets set; asset download step will be skipped');
					}

					pullSpinner.text = 'Fetching installed modules';
					logger.Info('[pull] Step: listing installed modules via /cli/list_modules');
					const modulesResponse = await gateway.listModules();
					const installedModules = (modulesResponse && modulesResponse.data) ? modulesResponse.data : [];
					logger.Info(`[pull] list_modules returned ${installedModules.length} module(s)`);
					if (installedModules.length > 0) {
						installedModules.forEach((name, i) => {
							logger.Info(`\t${i + 1}. ${name}`, { hideTimestamp: true });
						});
					} else {
						logger.Info('[pull] Raw list_modules response keys: ' + Object.keys(modulesResponse || {}).join(', '));
					}

					const modulesToPull = selectModules(installedModules, moduleFilter);

					if (moduleFilter && modulesToPull === null) {
						pullSpinner.fail(`Module "${moduleFilter}" is not installed on this site`);
						logger.Error(`[pull] Filter "${moduleFilter}" not found in installed modules list above`);
						process.exit(1);
					}

					if (modulesToPull.length === 0) {
						logger.Info('[pull] No modules selected to pull');
					} else {
						logger.Info(`[pull] Will pull ${modulesToPull.length} module(s): ${modulesToPull.join(', ')}`);
					}

					await pullSiteZip(gateway);

					for (let i = 0; i < modulesToPull.length; i++) {
						await pullModuleZip(gateway, modulesToPull[i], i + 1, modulesToPull.length);
					}
					if (modulesToPull.length > 0) {
						logger.Info('[pull] All selected modules pulled');
					}

					if (!ignoreAssets) {
						await pullAssets(gateway);
					} else {
						logger.Info('[pull] Skipping assets step');
					}

					await tidyUpAfterPull();

					logger.Info('[pull] All steps finished');
					pullSpinner.succeed('Pulled files');
				} catch (e) {
					logger.Debug(e);
					pullSpinner.fail('Pull failed');
					logger.Error(e.message || e);
					process.exit(1);
				}
			} else {
				logger.Error('[Cancelled] Pull command not executed, your files have been left untouched.');
			}
		});
	});

program.parse(process.argv);
