const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../lib/git/readiness');
const { commitAllSafe, commitAllSafeAsync } = require('../../lib/git/commit');

/**
 * The CLI's own snapshot commits run `git add -A`. Two things must never ride along, whatever the
 * project's .gitignore says: `.siteglide-config` (secrets) and `.tmp/` (deploy archives — zips of
 * files that are already committed, left behind only when a deploy never reached its tidy-up).
 */
describe('commitAllSafe', () => {
	let cwd;

	const write = (rel, body = 'x') => {
		const abs = path.join(cwd, rel);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, body);
	};

	const tracked = () => run('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd }).stdout.split(/\r?\n/).filter(Boolean).sort();

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-commit-all-safe-'));
		assert.equal(run('git', ['init'], { cwd }).ok, true);
		run('git', ['config', 'user.email', 'test@example.com'], { cwd });
		run('git', ['config', 'user.name', 'Test User'], { cwd });
		write('marketplace_builder/views/pages/home.liquid');
		write('.siteglide-config', '{"staging":{"token":"secret"}}');
		write('.tmp/marketplace-release.zip', 'PK');
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('commits the source files but never .siteglide-config or .tmp/', () => {
		const res = commitAllSafe('snapshot', { cwd });

		assert.equal(res.ok, true, res.stderr || res.stdout);
		assert.deepEqual(tracked(), ['marketplace_builder/views/pages/home.liquid']);
		// Still on disk — excluded from the commit, not deleted.
		assert.equal(fs.existsSync(path.join(cwd, '.tmp', 'marketplace-release.zip')), true);
		assert.equal(fs.existsSync(path.join(cwd, '.siteglide-config')), true);
	});

	it('commitAllSafeAsync applies the same exclusions', async () => {
		const res = await commitAllSafeAsync('snapshot', { cwd });

		assert.equal(res.ok, true, res.stderr || res.stdout);
		assert.deepEqual(tracked(), ['marketplace_builder/views/pages/home.liquid']);
	});
});
