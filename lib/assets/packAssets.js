const archiver = require('archiver-promise'),
	fs = require('fs'),
	glob = require('glob'),
	shell = require('shelljs'),
	templates = require('../templates'),
	settings = require('../settings'),
	prepareArchive = require('../prepareArchive'),
	dir = require('../directories'),
	{ deployGlobOptions } = require('../deployGlob');

const getAppDirectory = () => dir.currentApp() || dir.LEGACY_APP;

const addModulesToArchive = archive => {
	if (!fs.existsSync(dir.MODULES)) {
		return;
	}

	const modules = glob.sync('*/', { cwd: dir.MODULES });
	for (let i = 0; i < modules.length; i++) {
		addModuleToArchive(modules[i].replace('/', ''), archive);
	}
};

const publicAssetsSameAsPrivate = (file, files) => {
	return file.startsWith('public/assets') && files.includes(file.replace(/public/, 'private'));
};

const addModuleToArchive = (module, archive, pattern = '?(public|private)/assets/**') => {
	const files = glob.sync(pattern, deployGlobOptions({ cwd: `${dir.MODULES}/${module}`, nodir: true }));
	for (const f of files) {
		if (publicAssetsSameAsPrivate(f, files)) continue;

		const path = `${dir.MODULES}/${module}/${f}`;
		const pathInArchive = path.replace(/(public|private)\/assets\//, '');
		archive.append(templates.fillInTemplateValues(path, settings.loadSettingsFileForModule(module)), { name: pathInArchive });
	}
};

const prepareDestination = (path) => {
	shell.mkdir('-p', '.tmp');
	shell.rm('-rf', path);
};

const packAssets = async path => {
	prepareDestination(path);
	const appDirectory = getAppDirectory();
	const assetsArchive = prepareArchive(path);
	archiver(path, { zlib: { level: 6 }});

	if (fs.existsSync(`${appDirectory}/assets`)) {
		assetsArchive.glob('**/**', deployGlobOptions({ cwd: `${appDirectory}/assets` }));
	}

	addModulesToArchive(assetsArchive);
	return assetsArchive.finalize();
};

module.exports = packAssets;
