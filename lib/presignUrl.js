const fs = require('fs'),
	url = require('url'),
	request = require('request-promise'),
	fetchAuthData = require('./settings').fetchSettings,
	mime = require('mime-types');

const Portal = require('./portal');
const deployServiceUrl = () => process.env.DEPLOY_SERVICE_URL || `${process.env.SITEGLIDE_URL}api/private/urls`;

const presignUrl = async(s3FileName, fileName, gateway) => {
	const serviceUrl = `${deployServiceUrl()}/presign-url`;
	const params = {
		fileName: s3FileName,
		contentLength: fs.statSync(fileName)['size'],
		contentType: mime.lookup(fileName)
	}
	const hostname = url.parse(process.env.SITEGLIDE_URL).hostname;
	const host = Portal.HOST;

	let presignDeploy = await gateway.presign({serviceUrl,params,hostname,host}).then(response => {
		return { uploadUrl: response.url, accessUrl: url.parse(response.accessUrl).href };
	});
	return presignDeploy;
};

const presignDirectory = async(path,gateway) => {
	const serviceUrl = `${deployServiceUrl()}/presign-directory`;
	const params = { directory: path };

	const hostname = url.parse(process.env.SITEGLIDE_URL).hostname;
	const host = Portal.HOST;

	let presignData = await gateway.presign({serviceUrl,params,hostname,host}).then(response => {
		return response;
	});

	return presignData;
};

module.exports = {
	presignUrl: presignUrl,
	presignDirectory: presignDirectory
};
