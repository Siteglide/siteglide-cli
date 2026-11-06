// Put/POST to presigned CDN URLs: Content-Type is from `getAssetContentType` (npm `mime`); keep that package current.

const fs = require('fs'),
	path = require('path'),
	logger = require('./logger'),
	{ getAssetContentType } = require('./assetContentType');

const uploadError = (status, reason) =>
	Object.assign(
		new Error(`Upload failed with status ${status}${reason ? `: ${reason}` : ''}`),
		{ statusCode: status }
	);

const s3Reason = (body) => {
	if (typeof body !== 'string') {
		return null;
	}

	const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1];
	const message = body.match(/<Message>([^<]+)<\/Message>/)?.[1];

	return [code, message].filter(Boolean).join(': ') || null;
};

const throwUploadFailed = async (response) => {
	const body = await response.text();
	throw uploadError(response.status, s3Reason(body));
};

const uploadFile = async (fileName, s3Url) => {
	const stats = fs.statSync(fileName);
	const fileBuffer = fs.readFileSync(fileName);
	const contentType = await getAssetContentType(fileName);

	const headers = {
		'Content-Length': stats['size'].toString()
	};
	if (contentType != null) {
		headers['Content-Type'] = contentType;
	}

	const response = await fetch(s3Url, {
		method: 'PUT',
		headers,
		body: fileBuffer
	});

	if (!response.ok) {
		await throwUploadFailed(response);
	}

	return s3Url;
};

const uploadFileFormData = async (filePath, data) => {
	const formData = new FormData();

	Object.entries(data.fields).forEach(([k, v]) => {
		formData.append(k, v);
	});

	const fileBuffer = fs.readFileSync(filePath);
	const contentType = await getAssetContentType(filePath);

	// TEMPORARY: MIME debugging for sync direct CDN uploads — remove when done.
	logger.Debug(
		`[Sync CDN] MIME for ${path.basename(filePath)}: ${contentType === null || contentType === undefined ? 'null' : contentType}`
	);

	if (!data.fields['Content-Type']) {
		formData.append('Content-Type', contentType);
	}

	const fileName = path.basename(filePath);
	formData.append('file', new File([fileBuffer], fileName, { type: contentType }));

	const response = await fetch(data.url, {
		method: 'POST',
		body: formData
	});

	if (!response.ok) {
		await throwUploadFailed(response);
	}

	return true;
};

module.exports = {
	uploadError,
	uploadFile,
	uploadFileFormData,
	s3Reason
};
