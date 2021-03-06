const fs = require('fs'),
	shell = require('shelljs'),
	logger = require('./logger'),
	archiver = require('archiver');

const prepareDestination = (path) => {
	shell.mkdir('-p', '.tmp');
	shell.rm('-rf', path);
};
const prepareArchive = (path, verbose = true) => {
	prepareDestination(path);
	const output = fs.createWriteStream(path);
	const archive = archiver('zip', { zlib: { level: 6 }, store: true });

	output.on('close', () => {
		if(verbose) {
			const sizeInMB = archive.pointer() / 1024 / 1024;
			if(path==='./.tmp/assets.zip'){
				logger.Info(`Assets archive size: ${sizeInMB.toFixed(2)} MB`);
			}else{
				logger.Info(`Codebase archive size: ${sizeInMB.toFixed(2)} MB`);
			}
		}
	});
	archive.on('warning', err => {
		if (err.code === 'ENOENT') {
			logger.Error(err);
		} else throw err;
	});
	archive.on('error', err => {
		throw err;
	});
	archive.pipe(output);
	return archive;
};

module.exports = prepareArchive;
