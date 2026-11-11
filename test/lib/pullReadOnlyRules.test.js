const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const ignore = require('ignore');
const {
	RESERVED_FILES_RELATIVE_PATH,
	parsePullReadOnlyRuleLines,
	loadPullReadOnlyMatcher,
	loadReservedFilesRulesForPull,
	resetPullReadOnlySession,
	pathMatchesPullReadOnlyRules,
	toPosixProjectRelative,
	resolveReservedFilesPath,
	readReservedFilesRules
} = require('../../lib/pull/readOnlyRules');
const {
	applyPullReadOnlyAfterPull,
	clearPullReadOnlyHintsForGit
} = require('../../lib/pull/applyPullReadOnly');
const { writeFileSyncForPullOverwrite } = require('../../lib/pull/pullOverwrite');

describe('parsePullReadOnlyRuleLines', () => {
	it('skips blanks and comments', () => {
		assert.deepEqual(parsePullReadOnlyRuleLines('# comment\n\nmodules/foo/**\n# tail'), ['modules/foo/**']);
	});
});

describe('pull read-only matchers', () => {
	it('no rules when reserved_files.liquid is absent', async () => {
		const ig = await loadPullReadOnlyMatcher(os.tmpdir());
		assert.equal(pathMatchesPullReadOnlyRules(ig, 'modules/core/public/views/x.liquid'), false);
	});

	it('uses remote rules from session when local file is absent', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-reserved-remote-'));
		resetPullReadOnlySession();
		const gateway = {
			graph: async () => {
				return {
					data: {
						result: {
							items: [
								{
									physical_file_path: RESERVED_FILES_RELATIVE_PATH,
									body: 'modules/**\n'
								}
							]
						}
					}
				};
			}
		};
		await loadReservedFilesRulesForPull(rootPath, { gateway, phase: 'pre_pull' });
		const ig = await loadPullReadOnlyMatcher(rootPath);
		assert.equal(pathMatchesPullReadOnlyRules(ig, 'modules/core/public/views/x.liquid'), true);
	});

	it('loads patterns from siteglide_system reserved_files.liquid', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-reserved-'));
		const rulesPath = resolveReservedFilesPath(rootPath);
		await fs.ensureDir(path.dirname(rulesPath));
		await fs.writeFile(
			rulesPath,
			'# self\nmodules/siteglide_system/public/lib/reserved_files.liquid\nmodules/**\n',
			'utf8'
		);
		const ig = await loadPullReadOnlyMatcher(rootPath);
		assert.equal(pathMatchesPullReadOnlyRules(ig, 'modules/custom/x.liquid'), true);
		assert.equal(pathMatchesPullReadOnlyRules(ig, RESERVED_FILES_RELATIVE_PATH), true);
		assert.equal(pathMatchesPullReadOnlyRules(ig, 'marketplace_builder/views/x.liquid'), false);
	});

	it('user negation in reserved list', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-reserved-neg-'));
		const rulesPath = resolveReservedFilesPath(rootPath);
		await fs.ensureDir(path.dirname(rulesPath));
		await fs.writeFile(
			rulesPath,
			'marketplace_builder/vendor/**\n!marketplace_builder/vendor/editable.txt\n',
			'utf8'
		);
		const rules = await readReservedFilesRules(rootPath);
		const ig = ignore().add(rules);
		assert.equal(pathMatchesPullReadOnlyRules(ig, 'marketplace_builder/vendor/locked.txt'), true);
		assert.equal(pathMatchesPullReadOnlyRules(ig, 'marketplace_builder/vendor/editable.txt'), false);
	});

	it('toPosixProjectRelative normalizes Windows paths', () => {
		const root = 'C:\\project';
		const file = path.join(root, 'modules', 'a', 'b.liquid');
		assert.equal(toPosixProjectRelative(file, root), 'modules/a/b.liquid');
	});
});

describe('pull overwrite wins over read-only hint', () => {
	it('writeFileSyncForPullOverwrite replaces a read-only file', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-pull-ro-write-'));
		const filePath = path.join(rootPath, 'modules', 'custom', 'public', 'x.txt');
		await fs.ensureDir(path.dirname(filePath));
		await fs.writeFile(filePath, 'old', 'utf8');
		await fs.chmod(filePath, (await fs.stat(filePath)).mode & ~0o222);

		writeFileSyncForPullOverwrite(filePath, 'new', (fp, body) => {
			fs.writeFileSync(fp, body, 'utf8');
		});
		assert.equal(await fs.readFile(filePath, 'utf8'), 'new');
	});
});

describe('clearPullReadOnlyHintsForGit', () => {
	it('clears hints on paths git needs to mutate', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-pull-ro-git-'));
		const rulesPath = resolveReservedFilesPath(rootPath);
		await fs.ensureDir(path.dirname(rulesPath));
		await fs.writeFile(rulesPath, 'modules/**\n', 'utf8');
		const moduleFile = path.join(rootPath, 'modules', 'custom', 'x.txt');
		await fs.ensureDir(path.dirname(moduleFile));
		await fs.writeFile(moduleFile, 'x', 'utf8');
		await applyPullReadOnlyAfterPull(rootPath, {});

		const { cleared } = await clearPullReadOnlyHintsForGit(rootPath);
		assert.equal(cleared, 2);
		assert.notEqual((await fs.stat(moduleFile)).mode & 0o200, 0);
	});
});

describe('applyPullReadOnlyAfterPull', () => {
	it('marks matching files including reserved_files.liquid', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-pull-ro-mark-'));
		const rulesPath = resolveReservedFilesPath(rootPath);
		await fs.ensureDir(path.dirname(rulesPath));
		await fs.writeFile(
			rulesPath,
			`modules/siteglide_system/public/lib/reserved_files.liquid\nmodules/custom/**\n`,
			'utf8'
		);
		const moduleFile = path.join(rootPath, 'modules', 'custom', 'public', 'x.txt');
		await fs.ensureDir(path.dirname(moduleFile));
		await fs.writeFile(moduleFile, 'hello', 'utf8');
		await fs.chmod(moduleFile, 0o666);

		const { marked } = await applyPullReadOnlyAfterPull(rootPath, {});
		assert.equal(marked, 2);

		const reservedMode = (await fs.stat(rulesPath)).mode & 0o222;
		assert.equal(reservedMode, 0);
	});
});
