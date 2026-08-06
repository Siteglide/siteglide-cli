const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { assertExclusiveSiteAppRoot } = require('../lib/migrateAppDirectory');

(async () => {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-cli-'));
	await fs.mkdir(path.join(tmp, 'app'));
	if (assertExclusiveSiteAppRoot(tmp) !== 'app') {
		throw new Error('expected app');
	}

	await fs.remove(path.join(tmp, 'app'));
	await fs.mkdir(path.join(tmp, 'marketplace_builder'));
	if (assertExclusiveSiteAppRoot(tmp) !== 'marketplace_builder') {
		throw new Error('expected marketplace_builder');
	}

	await fs.mkdir(path.join(tmp, 'app'));
	const script = `
		const { assertExclusiveSiteAppRoot } = require(${JSON.stringify(path.join(__dirname, '../lib/migrateAppDirectory'))});
		assertExclusiveSiteAppRoot(${JSON.stringify(tmp)});
		console.log('should-not-reach');
	`;
	const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
	if (r.status === 0) {
		throw new Error('expected exit when both folders exist');
	}
	if (!/source of truth/i.test(r.stderr + r.stdout)) {
		throw new Error('expected source-of-truth warning, got: ' + (r.stderr + r.stdout));
	}

	await fs.remove(tmp);
	console.log('assertExclusiveSiteAppRoot smoke ok');
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
