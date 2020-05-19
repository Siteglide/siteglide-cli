const ora = require("ora");
const compress_images = require("compress-images");
const bytes = require("bytes");
const fs = require('fs-extra');
const path = require('path');

const compressImage = () => {
	return new Promise((resolve, reject) => {
		compress_images('./marketplace_builder/assets/**/*.{jpg,JPG,jpeg,JPEG,png}', './marketplace_builder/assets-compressed/',
			{
				compress_force: false,
				statistic: true,
				autoupdate: true,
				pathLog: '.',
			},
			false,
			{
				jpg: {
					engine: 'mozjpeg',
					command: ['-quality', '60']
				}
			},
			{
				png: {
					engine: 'pngquant',
					command: ['--quality=20-50']
				}
			},
			{
				svg: {
					engine: false,
					command: false,
				}
			},
			{
				gif: {
					engine: false,
					command: false
				}
			},
			function(error, completed, statistic){
				if(error){
					console.log(`Could not compress "${error.input.replace('./marketplace_builder/','')}"`)
				}else{
					if(statistic){
						console.log(`Compressed "${statistic.input.replace('./marketplace_builder/','')}" and saved ${statistic.percent}% in file size. (From ${bytes(statistic.size_in)} to ${bytes(statistic.size_output)})`);
						fs.createReadStream(path.resolve(statistic.path_out_new)).pipe(fs.createWriteStream(path.resolve(statistic.input)));
					};
					if(completed==true){
						resolve(completed);
					}
				}
			})
		});
}


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
			}
		})
	});
}


module.exports = {
	run
};
