/**
 * Compare full-pull vs selective-pull bytes; write .siteglide/user/selective-pull-compare artifact.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const logger = require('../logger');
const { userSegments, migrateLegacySiteglideLayout } = require('../siteglidePaths');
const { mapPathToResource } = require('../graphql/remoteMtimeQueries');
const version = require('../../package.json').version;

const SCHEMA_VERSION = 1;
const INLINE_DIFF_MAX = 32 * 1024;
const COMPARE_DIR_SEGMENTS = userSegments('selective-pull-compare');

/**
 * @param {string | Buffer} content
 * @returns {string}
 */
function sha256(content) {
	const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
	return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * @param {string} cwd
 * @returns {string}
 */
function pullCompareDir(cwd = process.cwd()) {
	migrateLegacySiteglideLayout(cwd);
	return path.join(cwd, ...COMPARE_DIR_SEGMENTS);
}

/**
 * @param {string} physicalPath
 * @returns {string}
 */
function pathSlug(physicalPath) {
	return physicalPath.replace(/\\/g, '/').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
}

/**
 * @param {string} aPath
 * @param {string} bPath
 * @returns {{ diffText: string, insertions: number, deletions: number, gitExitCode: number | null }}
 */
function unifiedDiffFiles(aPath, bPath) {
	const result = spawnSync('git', ['diff', '--no-index', '--no-color', aPath, bPath], {
		encoding: 'utf8',
		maxBuffer: 10 * 1024 * 1024
	});
	const diffText = (result.stdout || '') + (result.stderr || '');
	const numstat = spawnSync('git', ['diff', '--no-index', '--numstat', aPath, bPath], {
		encoding: 'utf8'
	});
	let insertions = 0;
	let deletions = 0;
	const line = (numstat.stdout || '').trim().split(/\s+/);
	if (line.length >= 2) {
		insertions = parseInt(line[0], 10) || 0;
		deletions = parseInt(line[1], 10) || 0;
	}
	const gitExitCode = result.status === null ? null : result.status;
	return { diffText, insertions, deletions, gitExitCode };
}

/**
 * @param {string} msg
 * @param {object} [data]
 */
function compareStepLog(msg, data) {
	if (data && Object.keys(data).length) {
		logger.Debug(`[compare] ${msg} ${JSON.stringify(data)}`);
	} else {
		logger.Debug(`[compare] ${msg}`);
	}
}

/**
 * @param {object} opts
 * @param {string} opts.environment
 * @param {string} opts.physicalPath
 * @param {string} opts.localRelativePath project-relative path to file on disk
 * @param {string | Buffer} opts.fullPullBytes
 * @param {string | Buffer} opts.selectivePullBytes
 * @param {string} [opts.cwd]
 * @returns {{ identical: boolean, reportPath: string }}
 */
function writeCompareReport(opts) {
	const cwd = opts.cwd || process.cwd();
	compareStepLog('writeCompareReport: start', {
		cwd,
		physicalPath: opts.physicalPath,
		localRelativePath: opts.localRelativePath
	});
	const dirPath = pullCompareDir(cwd);
	fs.mkdirSync(dirPath, { recursive: true });
	compareStepLog('writeCompareReport: output dir ready', { dirPath });

	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const base = `${opts.environment}-${stamp}-${pathSlug(opts.physicalPath)}`;
	const reportPath = path.join(dirPath, `${base}.json`);

	const fullLen = Buffer.isBuffer(opts.fullPullBytes)
		? opts.fullPullBytes.length
		: Buffer.byteLength(String(opts.fullPullBytes), 'utf8');
	const selectiveLen = Buffer.isBuffer(opts.selectivePullBytes)
		? opts.selectivePullBytes.length
		: Buffer.byteLength(String(opts.selectivePullBytes), 'utf8');
	const fullHash = sha256(opts.fullPullBytes);
	const selectiveHash = sha256(opts.selectivePullBytes);
	const identical = fullHash === selectiveHash;
	compareStepLog('writeCompareReport: byte summary', {
		fullBytes: fullLen,
		selectiveBytes: selectiveLen,
		identical,
		fullHash: fullHash.slice(0, 12),
		selectiveHash: selectiveHash.slice(0, 12)
	});

	const tmpDir = path.join(dirPath, '.tmp');
	fs.mkdirSync(tmpDir, { recursive: true });
	const aPath = path.join(tmpDir, `${base}-full`);
	const bPath = path.join(tmpDir, `${base}-selective`);
	fs.writeFileSync(aPath, opts.fullPullBytes);
	fs.writeFileSync(bPath, opts.selectivePullBytes);
	compareStepLog('writeCompareReport: running git diff --no-index', { aPath, bPath });
	const { diffText, insertions, deletions, gitExitCode } = unifiedDiffFiles(aPath, bPath);
	try {
		fs.unlinkSync(aPath);
		fs.unlinkSync(bPath);
	} catch {
		// ignore
	}
	compareStepLog('writeCompareReport: git diff done', {
		gitExitCode,
		diffChars: diffText.length,
		insertions,
		deletions
	});

	const mapped = mapPathToResource(opts.physicalPath);
	const report = {
		schemaVersion: SCHEMA_VERSION,
		environment: opts.environment,
		physicalPath: opts.physicalPath,
		localRelativePath: opts.localRelativePath,
		comparedAt: new Date().toISOString(),
		identical,
		diffStat: { insertions, deletions },
		fullPullContentSha256: fullHash,
		selectivePullContentSha256: selectiveHash,
		kind: mapped ? mapped.kind : null,
		cliVersion: version
	};

	let diffFilePath = '';
	if (!identical && diffText.length > 0) {
		diffFilePath = path.join(dirPath, `${base}.diff`);
		fs.writeFileSync(diffFilePath, diffText, 'utf8');
		report.diffFile = path.relative(cwd, diffFilePath).replace(/\\/g, '/');
		compareStepLog('writeCompareReport: wrote .diff file', { diffFilePath, diffChars: diffText.length });
	} else if (identical) {
		compareStepLog('writeCompareReport: no .diff file (full and selective bytes match)');
	} else {
		compareStepLog('writeCompareReport: no .diff file (git diff empty but hashes differ — check git on PATH)');
	}

	if (diffText.length <= INLINE_DIFF_MAX) {
		report.diff = diffText;
		report.diffTruncated = false;
		if (diffText.length > 0) {
			compareStepLog('writeCompareReport: diff also inlined in JSON', { diffChars: diffText.length });
		}
	} else {
		report.diffTruncated = true;
		compareStepLog('writeCompareReport: diff too large for JSON inline', {
			diffChars: diffText.length,
			inlineMax: INLINE_DIFF_MAX,
			diffFile: report.diffFile || null
		});
	}

	fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
	compareStepLog('writeCompareReport: wrote JSON report', { reportPath });

	const indexPath = path.join(dirPath, 'index.jsonl');
	fs.appendFileSync(
		indexPath,
		`${JSON.stringify({ comparedAt: report.comparedAt, physicalPath: opts.physicalPath, identical, report: path.relative(cwd, reportPath).replace(/\\/g, '/') })}\n`,
		'utf8'
	);
	compareStepLog('writeCompareReport: appended index.jsonl', { indexPath });

	if (identical) {
		logger.Success(`[compare] Full pull and selective pull match for ${opts.physicalPath}. Report: ${reportPath}`);
	} else {
		logger.Warn(
			`[compare] Format drift for ${opts.physicalPath} (+${insertions}/-${deletions} lines). Report: ${reportPath}${diffFilePath ? ` Diff: ${diffFilePath}` : ''}`,
			{ exit: false }
		);
	}

	return { identical, reportPath };
}

module.exports = {
	writeCompareReport,
	sha256,
	pullCompareDir,
	compareStepLog
};
