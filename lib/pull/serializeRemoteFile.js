/**
 * Build on-disk file bytes from a GraphQL admin record (frontmatter + body).
 * Frontmatter is data-driven: emit --- only when the record has fields to serialize.
 */

const yaml = require('js-yaml');

const PAGE_FM_ORDER = [
	'layout',
	'max_deep_level',
	'metadata',
	'redirect_code',
	'redirect_to',
	'redirect_url',
	'searchable'
];

const FORM_FM_ORDER = [
	'authorization_policies',
	'fields',
	'name',
	'redirect_to',
	'resource',
	'resource_owner'
];

const EMAIL_FM_ORDER = [
	'from',
	'layout',
	'metadata',
	'name',
	'reply_to',
	'subject',
	'to',
	'trigger_condition',
	'unique_args'
];

const SCHEMA_FM_ORDER = [
	'name',
	'properties'
];

/**
 * @param {object} record
 * @param {string} key
 * @returns {boolean}
 */
function shouldIncludeFrontmatterField(record, key) {
	if (!(key in record)) {
		return false;
	}
	const value = record[key];
	if (value === null || value === undefined) {
		return false;
	}
	if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
		return false;
	}
	return true;
}

/**
 * @param {object} record
 * @param {string[]} order
 * @returns {object}
 */
function pickOrderedFrontmatter(record, order) {
	const fm = {};
	for (let i = 0; i < order.length; i++) {
		const key = order[i];
		if (shouldIncludeFrontmatterField(record, key)) {
			fm[key] = record[key];
		}
	}
	return fm;
}

/**
 * @param {object} fm
 * @returns {boolean}
 */
function hasFrontmatterObject(fm) {
	return Object.keys(fm).length > 0;
}

/**
 * @param {object} fm
 * @returns {string}
 */
function dumpFrontmatter(fm) {
	return yaml.dump(fm, {
		lineWidth: -1,
		noRefs: true,
		sortKeys: false
	}).replace(/\r\n/g, '\n');
}

/**
 * @param {string} kind
 * @param {object} record
 * @returns {{ frontmatter: object, bodyField: string }}
 */
function buildFrontmatterForKind(kind, record) {
	if (kind === 'page') {
		return { frontmatter: pickOrderedFrontmatter(record, PAGE_FM_ORDER), bodyField: 'content' };
	}
	if (kind === 'form') {
		return { frontmatter: pickOrderedFrontmatter(record, FORM_FM_ORDER), bodyField: 'body' };
	}
	if (kind === 'email') {
		return { frontmatter: pickOrderedFrontmatter(record, EMAIL_FM_ORDER), bodyField: 'body' };
	}
	if (kind === 'schema') {
		return { frontmatter: pickOrderedFrontmatter(record, SCHEMA_FM_ORDER), bodyField: 'body' };
	}
	if (kind === 'partial' || kind === 'layout') {
		const fm = {};
		if (shouldIncludeFrontmatterField(record, 'metadata')) {
			fm.metadata = record.metadata;
		}
		return { frontmatter: fm, bodyField: 'body' };
	}
	if (kind === 'asset') {
		return { frontmatter: {}, bodyField: 'body' };
	}
	return { frontmatter: {}, bodyField: 'body' };
}

/**
 * @param {{ kind: string, record: object }} opts
 * @returns {string | null}
 */
function serializeRemoteFile(opts) {
	const { kind, record } = opts;
	if (!record || typeof record !== 'object') {
		return null;
	}
	const { frontmatter, bodyField } = buildFrontmatterForKind(kind, record);
	const body = record[bodyField];
	const bodyText = body != null ? String(body) : '';

	if (!hasFrontmatterObject(frontmatter)) {
		return bodyText;
	}

	const fmYaml = dumpFrontmatter(frontmatter);
	return `---\n${fmYaml}---\n${bodyText}`;
}

module.exports = {
	serializeRemoteFile,
	pickOrderedFrontmatter,
	hasFrontmatterObject,
	PAGE_FM_ORDER,
	FORM_FM_ORDER
};
