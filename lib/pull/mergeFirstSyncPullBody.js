/**
 * Merge-first sync pull body: full, selective (-fast), or compare (-compare).
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const dir = require('../directories');
const { pullPhysicalPaths } = require('./pullPhysicalPaths');
const { writeCompareReport, compareStepLog } = require('./comparePullFormats');
const { parseSelectivePullOptions } = require('./parseSelectivePullOptions');
const { resolveWriteTarget } = require('./writePulledPath');

/**
 * @param {string} msg
 * @param {object} [data]
 */
function mergeFirstPullStepLog(msg, data) {
	if (data && Object.keys(data).length) {
		logger.Debug(`[compare] merge-first pull: ${msg} ${JSON.stringify(data)}`);
	} else {
		logger.Debug(`[compare] merge-first pull: ${msg}`);
	}
}

/**
 * @param {object} ctx
 * @param {import('../proxy')} ctx.gateway
 * @param {string} ctx.environment
 * @param {object} ctx.params commander params
 * @param {() => Promise<void>} ctx.runFullMergeFirstSyncPull existing pullSiteZip + modules + assets
 * @param {string} [ctx.siteRoot]
 */
async function runMergeFirstSyncPullBody(ctx) {
	const opts = parseSelectivePullOptions(ctx.params);
	const useSelective = !opts.selectiveDisabled && (opts.mergeFirstFast || opts.mergeFirstCompare);
	const paths = opts.paths;

	mergeFirstPullStepLog('runMergeFirstSyncPullBody entered', {
		environment: ctx.environment,
		useSelective,
		mergeFirstFast: opts.mergeFirstFast,
		mergeFirstCompare: opts.mergeFirstCompare,
		selectiveDisabled: opts.selectiveDisabled,
		pathCount: paths.length,
		paths
	});

	if (opts.mergeFirstCompare && paths.length !== 1) {
		throw new Error('[pull] --merge-first-compare requires exactly one --path (or SITEGLIDE_PULL_PATHS with one entry).');
	}
	if (opts.rejected.length) {
		for (let i = 0; i < opts.rejected.length; i++) {
			const r = opts.rejected[i];
			logger.Warn(`[pull] Selective path rejected (${r.reason}): ${r.path}`, { exit: false });
		}
	}

	if (!useSelective || paths.length === 0) {
		mergeFirstPullStepLog('branch: full pull only (no selective/compare)', {
			reason: !useSelective ? 'selective not enabled' : 'no paths',
			mergeFirstCompare: opts.mergeFirstCompare
		});
		await ctx.runFullMergeFirstSyncPull();
		return { mode: 'sync_full_pull', paths: [] };
	}

	if (opts.mergeFirstCompare) {
		const physicalPath = paths[0];
		const siteRoot = ctx.siteRoot || dir.defaultSiteRoot();
		const target = resolveWriteTarget(physicalPath, siteRoot, ctx.ignoredModules);
		mergeFirstPullStepLog('branch: compare (full pull → snapshot → selective → compare)', {
			physicalPath,
			siteRoot,
			target: target
				? { root: target.root, relativePath: target.relativePath }
				: null
		});

		mergeFirstPullStepLog('step 1/4: starting full merge-first sync pull');
		await ctx.runFullMergeFirstSyncPull();
		mergeFirstPullStepLog('step 1/4: full pull finished');

		let fullBytes = Buffer.alloc(0);
		let fullDiskPath = '';
		if (target) {
			fullDiskPath = path.join(target.root, target.relativePath);
			if (fs.existsSync(fullDiskPath)) {
				fullBytes = fs.readFileSync(fullDiskPath);
			}
		}
		mergeFirstPullStepLog('step 2/4: snapshotted full-pull bytes from disk', {
			fullDiskPath: fullDiskPath || null,
			exists: fullDiskPath ? fs.existsSync(fullDiskPath) : false,
			byteLength: fullBytes.length
		});

		mergeFirstPullStepLog('step 3/4: starting selective pull (GraphQL) for same path');
		const selective = await pullPhysicalPaths(ctx.gateway, {
			paths,
			siteRoot,
			ignoredModules: ctx.ignoredModules
		});
		mergeFirstPullStepLog('step 3/4: selective pull finished', {
			ok: selective.ok,
			written: selective.written,
			failed: selective.failed,
			fallbackRecommended: selective.fallbackRecommended
		});
		if (!selective.ok) {
			logger.Warn('[pull] Selective pull after full pull had failures; see debug log.', { exit: false });
		}

		let selectiveBytes = fullBytes;
		if (target) {
			const afterPath = path.join(target.root, target.relativePath);
			if (fs.existsSync(afterPath)) {
				selectiveBytes = fs.readFileSync(afterPath);
			}
		}
		mergeFirstPullStepLog('step 4/4: read post-selective bytes from disk', {
			byteLength: selectiveBytes.length,
			sameLengthAsFull: selectiveBytes.length === fullBytes.length
		});

		const localRelative = target ? path.join(target.root, target.relativePath).replace(/\\/g, '/') : physicalPath;
		compareStepLog('merge-first pull: invoking writeCompareReport');
		writeCompareReport({
			environment: ctx.environment,
			physicalPath,
			localRelativePath: localRelative,
			fullPullBytes: fullBytes,
			selectivePullBytes: selectiveBytes,
			cwd: process.cwd()
		});
		return { mode: 'sync_selective_pull', paths, compare: true };
	}

	mergeFirstPullStepLog('branch: selective fast pull (no compare)');
	const selective = await pullPhysicalPaths(ctx.gateway, {
		paths,
		siteRoot: ctx.siteRoot || dir.defaultSiteRoot(),
		ignoredModules: ctx.ignoredModules
	});
	if (selective.fallbackRecommended) {
		logger.Warn('[pull] Selective pull incomplete — falling back to full merge-first sync pull.', { exit: false });
		await ctx.runFullMergeFirstSyncPull();
		return { mode: 'sync_full_pull', paths, fallback: true };
	}
	logger.Info(`[pull] Selective merge-first sync: wrote ${selective.written.length} file(s).`);
	return { mode: 'sync_selective_pull', paths };
}

module.exports = {
	runMergeFirstSyncPullBody
};
