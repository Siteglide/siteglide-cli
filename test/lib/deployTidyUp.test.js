const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { removeDeployArchives, tidyUpAfterDeploy } = require('../../lib/deployTidyUp');

/**
 * Deploy left `.tmp/marketplace-release.zip` behind after every run (pull's tidy-up runs before
 * the archive is built in a merge-first deploy, and a plain deploy had no tidy-up at all). The
 * zip is untracked and several MB, so the next `git add -A` snapshot would commit it.
 */
describe('removeDeployArchives', () => {
	let cwd;

	const write = (rel, body = 'x') => {
		const abs = path.join(cwd, rel);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, body);
	};

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-deploy-tidy-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('removes both deploy archives and the then-empty .tmp directory', () => {
		write('.tmp/marketplace-release.zip');
		write('.tmp/assets.zip');

		const result = removeDeployArchives(cwd);

		assert.deepEqual(result, {
			removed: ['.tmp/marketplace-release.zip', '.tmp/assets.zip'],
			failed: [],
			removedTmpDir: true
		});
		assert.equal(fs.existsSync(path.join(cwd, '.tmp')), false);
	});

	it('leaves other scratch files and the .tmp directory alone', () => {
		write('.tmp/marketplace-release.zip');
		write('.tmp/exported.json');

		const result = removeDeployArchives(cwd);

		assert.deepEqual(result, {
			removed: ['.tmp/marketplace-release.zip'],
			failed: [],
			removedTmpDir: false
		});
		assert.equal(fs.existsSync(path.join(cwd, '.tmp', 'exported.json')), true);
	});

	it('is a no-op without a .tmp directory', () => {
		assert.deepEqual(removeDeployArchives(cwd), { removed: [], failed: [], removedTmpDir: false });
	});

	it('tidyUpAfterDeploy logs each removal at debug level and never throws', () => {
		write('.tmp/marketplace-release.zip');
		const debug = [];
		const warn = [];
		const logger = {
			Debug: (m) => debug.push(m),
			Warn: (m) => warn.push(m)
		};

		const result = tidyUpAfterDeploy({ cwd, logger });

		assert.deepEqual(result.removed, ['.tmp/marketplace-release.zip']);
		assert.deepEqual(debug, [
			'[deploy] Tidying up: removed ./.tmp/marketplace-release.zip',
			'[deploy] Tidying up: removed ./.tmp'
		]);
		assert.deepEqual(warn, []);
	});
});
