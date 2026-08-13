/**
 * Which installed modules to pull for a given CLI invocation.
 */

const SGM_SKIP_EXACT = new Set(['module_86', 'module_357']);

/**
 * Siteglide-managed modules that `--skip-sgm` omits from a default pull.
 * @param {string} name
 * @returns {boolean}
 */
function isSiteglideManagedModule(name) {
	if (!name || typeof name !== 'string') {
		return false;
	}
	return name.startsWith('siteglide_') || SGM_SKIP_EXACT.has(name);
}

/**
 * @param {string[]} installedModules
 * @param {{ moduleFilter?: string, skipSgm?: boolean }} opts
 * @returns {{ ok: true, modules: string[], skipped?: string[] } | { ok: false, error: string, code: 'not_installed' | 'contradictory' }}
 */
function selectModulesToPull(installedModules, opts = {}) {
	const moduleFilter = opts.moduleFilter;
	const skipSgm = Boolean(opts.skipSgm);
	const installed = installedModules || [];

	if (moduleFilter) {
		if (installed.indexOf(moduleFilter) === -1) {
			return {
				ok: false,
				code: 'not_installed',
				error: `Module "${moduleFilter}" is not installed on this site`
			};
		}
		if (skipSgm && isSiteglideManagedModule(moduleFilter)) {
			return {
				ok: false,
				code: 'contradictory',
				error:
					`Cannot pull module "${moduleFilter}" with --skip-sgm: that module is Siteglide-managed ` +
					'(siteglide_*, module_86, module_357). Omit --skip-sgm or choose a different module.'
			};
		}
		return { ok: true, modules: [moduleFilter] };
	}

	if (!skipSgm) {
		return { ok: true, modules: installed.slice() };
	}

	const modules = [];
	const skipped = [];
	for (let i = 0; i < installed.length; i++) {
		const name = installed[i];
		if (isSiteglideManagedModule(name)) {
			skipped.push(name);
		} else {
			modules.push(name);
		}
	}
	return { ok: true, modules, skipped };
}

module.exports = {
	SGM_SKIP_EXACT,
	isSiteglideManagedModule,
	selectModulesToPull
};
