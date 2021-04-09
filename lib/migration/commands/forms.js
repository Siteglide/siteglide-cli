const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const saveFile = require('../lib/utils/save-file');

const run = async(emailAddress) => {
	const init = spawn(
		'npx',
		['degit', 'siteglide/migration-form', '--force'],
		{
			cwd: path.resolve('.'),
			shell: true
		}
	);

	init.on('close', function(code) {
		if (code !== 0) {
			console.error(`[Error] Form conversion failed.  Please see this help document - https://developers.siteglide.com/migrate-manual-form-setup`);
		}else{
			var data = fs.readFileSync(path.resolve('./modules/simpleform/public/notifications/email_notifications/form.liquid')).toString();
			data = data.replace('admin.email@example.com',emailAddress);
			saveFile.run({
				filePath: './modules/simpleform/public/notifications/email_notifications/form.liquid',
				fileContent: data
			});
		}
	});
};

module.exports = {
	run
};
