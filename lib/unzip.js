const StreamZip = require('node-stream-zip'),
	fs = require('fs'),
	os = require('os');

const unzip = (fileName, folderPath) => {
	return new Promise((resolve, reject) => {
		let zip = new StreamZip({
			file: fileName,
			storeEntries: true
		});

		zip.on('ready', () => {
			fs.mkdirSync(folderPath, {recursive: true});
			if(os.platform() === 'win32'){
				for (const entry of Object.values(zip.entries())) {
					if(entry.name.includes('?')){
						entry.name = entry.name.replace(/[?]/g, '');
					}
				}
			}
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