const StreamZip = require('node-stream-zip'),
	fs = require('fs');

const unzip = (fileName, folderPath) => {
	return new Promise((resolve, reject) => {
		let zip = new StreamZip({
			file: fileName,
			storeEntries: true
		});

		zip.on('ready', () => {
			fs.mkdirSync(folderPath, {recursive: true});
			zip.extract(null, `./${folderPath}`, (err) => {
				zip.close();
				if(!err){
					resolve();
				}else{
					reject(err);
				}
			});
		});
	});
};

module.exports = unzip;