/**
 * Resolve selective pull paths and mode flags from CLI args and env.
 */

const { validateSelectivePullPaths } = require('./validatePullPath');

/**
 * @param {object} params commander params
 * @returns {string[]}
 */
function pathsFromParams(params) {
	const fromFlag = params.path;
	if (!fromFlag) {
		return [];
	}
	if (Array.isArray(fromFlag)) {
		return fromFlag;
	}
	return [fromFlag];
}

/**
 * @param {object} [params]
 * @returns {{ paths: string[], mergeFirstFast: boolean, mergeFirstCompare: boolean, selectiveDisabled: boolean }}
 */
function parseSelectivePullOptions(params = {}) {
	const envPaths = process.env.SITEGLIDE_PULL_PATHS || '';
	const envList = envPaths
		.split(',')
		.map((p) => p.trim())
		.filter(Boolean);
	const paramPaths = pathsFromParams(params);
	const merged = paramPaths.length ? paramPaths : envList;
	const validation = validateSelectivePullPaths(merged);
	const mergeFirstFast = Boolean(
		params.mergeFirstFast
		|| process.env.SITEGLIDE_PULL_MERGE_FIRST_FAST === '1'
	);
	const mergeFirstCompare = Boolean(
		params.mergeFirstCompare
		|| process.env.SITEGLIDE_PULL_MERGE_FIRST_COMPARE === '1'
	);
	const selectiveDisabled = process.env.SITEGLIDE_PULL_SELECTIVE === '0';
	return {
		paths: validation.paths,
		rejected: validation.rejected,
		mergeFirstFast,
		mergeFirstCompare,
		selectiveDisabled
	};
}

module.exports = {
	pathsFromParams,
	parseSelectivePullOptions
};
