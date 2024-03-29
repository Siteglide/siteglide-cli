const ora = require('ora');
const imagemin = require('imagemin');
const imageminMozJpeg = require('imagemin-mozjpeg');
const imageminPngquant = require('imagemin-pngquant');
const fs = require('fs-extra');
const logger = require('../../../logger');
const path = require('path');
const shell = require('shelljs');

const spinner = ora();

const compressImage = async() => {
	return new Promise(async (resolve, reject) => {
		const files = getAllFiles(`${process.cwd()}/marketplace_builder/assets`)

		if(files.length===0) {
			resolve(true)
		}

		for(var i=0;i<files.length;i++){
			if(path.extname(files[i]).match(/.(jpg|JPG|jpeg|JPEG|png|PNG)$/i)!==null){
				files.splice(i,1);
			}
		}

		spinner.start();
		for(var i=0;i<files.length;i++){
			spinner.text = `Compressing image ${i+1} of ${files.length}`;
			await imagemin([files[i]], {
				destination: './marketplace_builder/assets-compressed',
				plugins: [
					imageminMozJpeg({
						quality: 80
					}),
					imageminPngquant({
						quality: [0.6, 0.8]
					})
				]
			})
			.then( res => {
				if(res.length===1){
					let readStream = fs.createReadStream(path.resolve(res[0].destinationPath));
					let writeStream = fs.createWriteStream(path.resolve(res[0].sourcePath));
					readStream.on('open', function () {
						readStream.pipe(writeStream);
					});
					readStream.on('error', function(err) {
						logger.Debug(err)
					});
					fs.unlink(path.resolve(res[0].destinationPath));
					if(i+1===files.length){
						if (fs.existsSync(`./marketplace_builder/assets-compressed`)) {
							shell.rm('-r',`./marketplace_builder/assets-compressed`);
						}
						resolve(true);
					}
				}else{
					if(i+1===files.length){
						if (fs.existsSync(`./marketplace_builder/assets-compressed`)) {
							shell.rm('-r',`./marketplace_builder/assets-compressed`);
						}
						resolve(true);
					}
				}
			})
			.catch( err => {
				if (fs.existsSync(`./marketplace_builder/assets-compressed`)) {
					shell.rm('-r',`./marketplace_builder/assets-compressed`);
				}
				resolve(false);
			});
		};
	});
};

const getAllFiles = function(dirPath, arrayOfFiles) {
	if (fs.existsSync(dirPath)) {
	  files = fs.readdirSync(dirPath)
	  arrayOfFiles = arrayOfFiles || []
	  files.forEach(function(file) {
	    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
	      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles)
	    } else {
	      arrayOfFiles.push(path.join(dirPath, "/", file))
	    }
	  })
	  return arrayOfFiles
	}else{
		return []
	}
}

const run = () => {
	return new Promise(async (resolve, reject) => {
		await compressImage()
			.then(async res => {
				if(res){
					spinner.succeed('Images compressed');
					resolve();
				}else{
					spinner.fail('Images not compressed');
					resolve();
				}
			})
			.catch(error => {
				resolve();
			});
	});
};


module.exports = {
	run
};
