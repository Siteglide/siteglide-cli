const ora = require('ora');
const imagemin = require('imagemin');
const imageminMozJpeg = require('imagemin-mozjpeg');
const imageminPngquant = require('imagemin-pngquant');
const fs = require('fs-extra');
const path = require('path');

const compressImage = () => {
	return new Promise(async (resolve, reject) => {
		await imagemin(['./marketplace_builder/assets/**/*.{jpg,JPG,jpeg,JPEG,png}'], {
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
		.then(res => {
			for(var i=0;i<res.length;i++){
				fs.createReadStream(path.resolve(res[i].destinationPath)).pipe(fs.createWriteStream(path.resolve(res[i].sourcePath)));
			}
			if(res.length===0){
				resolve(false);
			}else{
				resolve(true);
			}
		})
		.catch(err => {
			resolve(false);
		});
	});
};

const run = () => {
	return new Promise(async (resolve, reject) => {
		await compressImage()
			.then(async res => {
				if(res){
					await fs.remove('./marketplace_builder/assets-compressed')
						.then(result => {
							ora().succeed('Images compressed');
							resolve();
						})
						.catch(error => {
							resolve();
						});
				}else{
					await fs.remove('./marketplace_builder/assets-compressed')
						.then(result => {
							ora().fail('Images not compressed');
							resolve();
						});
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
