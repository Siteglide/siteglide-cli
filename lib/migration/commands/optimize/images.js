const ora = require('ora');
const sharp = require('sharp');
const fs = require('fs-extra');
const logger = require('../../../logger');
const path = require('path');
const shell = require('shelljs');
const dir = require('../../../directories');

const spinner = ora();

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
const compressImageFile = async (filePath) => {
	const ext = path.extname(filePath).toLowerCase();
	const tempPath = `${filePath}.sharp-tmp`;

	if (ext === '.jpg' || ext === '.jpeg') {
		await sharp(filePath).jpeg({ quality: 80 }).toFile(tempPath);
	} else if (ext === '.png') {
		await sharp(filePath).png({ quality: 80, compressionLevel: 9 }).toFile(tempPath);
	} else {
		return false;
	}

	await fs.move(tempPath, filePath, { overwrite: true });
	return true;
};

const compressImage = async () => {
	const siteRoot = dir.defaultSiteRoot();
	const assetsDir = path.join(process.cwd(), siteRoot, 'assets');
	const compressedDir = path.join(process.cwd(), siteRoot, 'assets-compressed');

	return new Promise(async (resolve) => {
		const files = getAllFiles(assetsDir);

		if (files.length === 0) {
			resolve(true);
			return;
		}

		for (var i = 0; i < files.length; i++) {
			if (path.extname(files[i]).match(/.(jpg|JPG|jpeg|JPEG|png|PNG)$/i) !== null) {
				files.splice(i, 1);
			}
		}

		if (files.length === 0) {
			resolve(true);
			return;
		}

		spinner.start();
		for (var j = 0; j < files.length; j++) {
			spinner.text = `Compressing image ${j + 1} of ${files.length}`;
			try {
				await compressImageFile(files[j]);
				if (j + 1 === files.length) {
					if (fs.existsSync(compressedDir)) {
						shell.rm('-r', compressedDir);
					}
					resolve(true);
				}
			} catch (err) {
				logger.Debug(err);
				if (fs.existsSync(compressedDir)) {
					shell.rm('-r', compressedDir);
				}
				resolve(false);
				return;
			}
		}
	});
};

const getAllFiles = function(dirPath, arrayOfFiles) {
	if (fs.existsSync(dirPath)) {
	  files = fs.readdirSync(dirPath);
	  arrayOfFiles = arrayOfFiles || [];
	  files.forEach(function(file) {
	    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
	      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
	    } else {
	      arrayOfFiles.push(path.join(dirPath, "/", file));
	    }
	  });
	  return arrayOfFiles;
	} else {
		return [];
	}
};

const run = () => {
	return new Promise(async (resolve) => {
		await compressImage()
			.then(async (res) => {
				if (res) {
					spinner.succeed('Images compressed');
					resolve();
				} else {
					spinner.fail('Images not compressed');
					resolve();
				}
			})
			.catch(() => {
				resolve();
			});
	});
};


module.exports = {
	run
};
