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
			fs.mkdirSync(folderPath, { recursive: true });

			//if Windows need to check for invalid characters
			if(os.platform()==='win32'){
				let entries = zip.entries();
				Object.keys(entries).forEach(key => {
					//If a file has invalid character, rename the file name, and update entry key
					if(key.match(/[<>:"|?*]/g)){
						console.log(`Warning: Due to invalid characters in physical_file_path, the following file could not be pulled and was skipped - ${key}`);
						delete entries[key];
					}
				});
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