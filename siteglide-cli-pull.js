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
	shell = require('shelljs'),
	path = require('path'),
	dir = require('./lib/directories');

const pullSpinner = ora({ text: 'Pulling files', stream: process.stdout });

/**
 * Remove empty directories left under a pull root after restructuring.
 *
 * @param {string} root - Relative directory to scan (e.g. marketplace_builder).
 * Side effects: deletes empty child directories under `./${root}`; logs non-ENOTEMPTY errors.
 */
const cleanupEmptyDirs = (root) => {
	const list = fs.readdirSync(`./${root}`).filter(folder => fs.statSync(path.join(`./${root}`, folder)).isDirectory());
	for (let i = 0; i < list.length; i++) {
		const folder = path.join(`./${root}`, list[i]);
		try {
			fs.rmdirSync(folder);
		} catch (e) {
			if (e.code !== 'ENOTEMPTY') {
				logger.Error(e);
			}
		}
	}
};

/**
 * If a pull extract contains a nested `modules/` folder, merge it into `./modules`.
 *
 * @param {string} fromRoot - Relative directory that may contain `modules/` (e.g. marketplace_builder or .tmp/...).
 * Side effects: creates `./modules` if needed; copies module files into it (overwrites); deletes `${fromRoot}/modules`.
 * No-op if `${fromRoot}/modules` does not exist.
 */
const moveModulesToRoot = (fromRoot) => {
	const modulesPath = `./${fromRoot}/modules`;
	if (fs.existsSync(modulesPath)) {
		fs.ensureDirSync(`./${dir.MODULES}`);
		shell.cp('-R', `${modulesPath}/*`, `./${dir.MODULES}/`);
		shell.rm('-r', modulesPath);
	}
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
	shell.cp('-R', `./${dir.LEGACY_APP}/app/*`, `./${dir.LEGACY_APP}`);
	shell.rm(`./${filename}`);
	moveModulesToRoot(dir.LEGACY_APP);
	if (fs.existsSync(`./${dir.LEGACY_APP}/asset_manifest.json`)) {
		shell.rm(`./${dir.LEGACY_APP}/asset_manifest.json`);
	}
	shell.rm('-r', `./${dir.LEGACY_APP}/app`);
	cleanupEmptyDirs(dir.LEGACY_APP);
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
	fs.removeSync(workDir);
	await unzip(filename, workDir);
	shell.rm(`./${filename}`);

	if (fs.existsSync(`./${workDir}/app`)) {
		shell.cp('-R', `./${workDir}/app/*`, `./${workDir}`);
		shell.rm('-r', `./${workDir}/app`);
	}

	moveModulesToRoot(workDir);

	// Some module zips nest files as <moduleName>/... instead of modules/<moduleName>/...
	const directModulePath = `./${workDir}/${moduleName}`;
	if (fs.existsSync(directModulePath)) {
		logger.Info(`[pull] Module "${moduleName}" zip used direct layout; copying into ./${dir.MODULES}/${moduleName}`);
		fs.ensureDirSync(`./${dir.MODULES}/${moduleName}`);
		shell.cp('-R', `${directModulePath}/*`, `./${dir.MODULES}/${moduleName}/`);
	}

	if (fs.existsSync(`./${workDir}`)) {
		shell.rm('-r', `./${workDir}`);
	}
	if (fs.existsSync(`./${dir.TMP}`) && fs.readdirSync(`./${dir.TMP}`).length === 0) {
		shell.rm('-r', `./${dir.TMP}`);
	}
	logger.Info(`[pull] Module "${moduleName}" pull complete`);
};

/**
 * Fetch the asset file list from Siteglide-API `/cli/pull` and download matching text/binary assets
 * into `marketplace_builder/` by physical_file_path.
 *
 * @param {Gateway} gateway - Authenticated API client for the current environment.
 * Side effects: creates dirs and writes/overwrites asset files under `./marketplace_builder`;
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
	asset_files.forEach(file => {
		let folderPath = file.data.physical_file_path.split('/');
		folderPath = dir.LEGACY_APP + '/' + folderPath.slice(0, folderPath.length - 1).join('/');
		fs.mkdirSync(folderPath, { recursive: true });
		fs.writeFileSync(dir.LEGACY_APP + '/' + file.data.physical_file_path, file.data.body, logger.Error);
	});
	logger.Info(`[pull] Wrote ${asset_files.length} asset file(s) into ./${dir.LEGACY_APP}`);
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

		Confirm('Are you sure you would like to pull? This will overwrite your local files immediately! (Y/n)\n').then(async function (response) {
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
