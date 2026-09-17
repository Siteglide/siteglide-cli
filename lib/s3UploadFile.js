const fs = require('fs'),
	path = require('path'),
	mime = require('mime-types');

const uploadError = status =>
	Object.assign(new Error(`Upload failed with status ${status}`), { statusCode: status });

const uploadFile = async (fileName, s3Url) => {
	const stats = fs.statSync(fileName);
	const fileBuffer = fs.readFileSync(fileName);
	const contentType = mime.lookup(fileName);

	const response = await fetch(s3Url, {
		method: 'PUT',
		headers: {
			'Content-Length': stats['size'].toString(),
			'Content-Type': contentType || 'application/octet-stream'
		},
		body: fileBuffer
	});

	if (!response.ok) {
		throw uploadError(response.status);
	}

	return s3Url;
};

const uploadFileFormData = async (filePath, data) => {
	const formData = new FormData();

	Object.entries(data.fields).forEach(([k, v]) => {
		formData.append(k, v);
	});

	const fileBuffer = fs.readFileSync(filePath);
	const contentType = mime.lookup(filePath) || 'application/octet-stream';

	if (!data.fields['Content-Type']) {
		formData.append('Content-Type', contentType);
	}

	const fileName = path.basename(filePath);
	formData.append('file', new Blob([fileBuffer]), fileName);

	const response = await fetch(data.url, {
		method: 'POST',
		body: formData
	});

	if (!response.ok) {
		throw uploadError(response.status);
	}

	return true;
};

module.exports = {
	uploadFile: uploadFile,
	uploadFileFormData: uploadFileFormData
};
