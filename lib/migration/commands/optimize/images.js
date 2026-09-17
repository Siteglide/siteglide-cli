const ora = require('ora');
const sharp = require('sharp');
const fs = require('fs-extra');
const logger = require('../../../logger');
const path = require('path');
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

	const files = getAllFiles(assetsDir);
	const imageFiles = files.filter((file) => {
		return /\.(jpe?g|png)$/i.test(path.extname(file));
	});

	if (imageFiles.length === 0) {
		return true;
	}

	spinner.start();
	for (let i = 0; i < imageFiles.length; i++) {
		spinner.text = `Compressing image ${i + 1} of ${imageFiles.length}`;
		try {
			await compressImageFile(imageFiles[i]);
		} catch (err) {
			logger.Debug(err);
			spinner.fail('Images not compressed');
			return false;
		}
	}

	return true;
};

const getAllFiles = function(dirPath, arrayOfFiles) {
	if (fs.existsSync(dirPath)) {
		const files = fs.readdirSync(dirPath);
		arrayOfFiles = arrayOfFiles || [];
		files.forEach(function(file) {
			if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
				arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
			} else {
				arrayOfFiles.push(path.join(dirPath, file));
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
