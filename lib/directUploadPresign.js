const { sanitizeSecrets } = require('./sanitize');

/**
 * @param {unknown} errorValue
 * @returns {string}
 */
function formatPresignErrorDetail(errorValue) {
	if (
		errorValue === undefined
		|| errorValue === null
	) {
		return '';
	}
	if (typeof errorValue === 'string') {
		return errorValue;
	}
	return JSON.stringify(sanitizeSecrets(errorValue), null, 2);
}

/**
 * Safe presign shape for debug logs (policy values omitted; errors expanded).
 * @param {unknown} data
 * @returns {object}
 */
function summarizeDirectUploadPresign(data) {
	if (
		!data
		|| typeof data !== 'object'
	) {
		return { kind: data === null ? 'null' : typeof data };
	}
	const fields = data.fields;
	const summary = {
		topLevelKeys: Object.keys(data),
		hasUrl: Object.prototype.hasOwnProperty.call(data, 'url'),
		hasUploadUrl: Object.prototype.hasOwnProperty.call(data, 'uploadUrl'),
		hasAccessUrl: Object.prototype.hasOwnProperty.call(data, 'accessUrl'),
		hasFields: Boolean(fields),
		fieldKeys: fields && typeof fields === 'object' ? Object.keys(fields) : null,
		hasFieldsKey: Boolean(fields && typeof fields.key === 'string')
	};
	if (Object.prototype.hasOwnProperty.call(data, 'error')) {
		summary.errorDetail = formatPresignErrorDetail(data.error);
	}
	return summary;
}

/**
 * @param {unknown} data
 * @returns {string | null} user-facing message when presign cannot be used for direct upload
 */
function directUploadPresignFailureMessage(data) {
	if (
		!data
		|| typeof data !== 'object'
	) {
		return 'Asset presign failed: empty response from presign-directory.';
	}
	if (
		data.error !== undefined
		&& data.error !== null
		&& data.error !== ''
	) {
		const detail = formatPresignErrorDetail(data.error);
		return detail
			? `Asset presign failed:\n${detail}`
			: 'Asset presign failed: upstream returned an error with no detail.';
	}
	if (
		!data.fields
		|| typeof data.fields.key !== 'string'
	) {
		return `Asset presign failed: response missing S3 upload fields (top-level keys: ${Object.keys(data).join(', ')}).`;
	}
	if (!data.url) {
		return 'Asset presign failed: response missing upload url.';
	}
	return null;
}

module.exports = {
	formatPresignErrorDetail,
	summarizeDirectUploadPresign,
	directUploadPresignFailureMessage
};
