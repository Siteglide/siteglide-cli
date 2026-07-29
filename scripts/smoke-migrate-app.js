const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { migrateMarketplaceBuilderToApp } = require('../lib/migrateAppDirectory');

(async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-migrate-'));
	await fs.mkdir(path.join(root, 'marketplace_builder'));
	await fs.writeFile(path.join(root, 'marketplace_builder', 'x.txt'), 'ok');

	const result = await migrateMarketplaceBuilderToApp({ cwd: root, skipConfirm: true });
	assert.equal(result, 'renamed-fs');
	assert.equal(await fs.pathExists(path.join(root, 'app', 'x.txt')), true);
	assert.equal(await fs.pathExists(path.join(root, 'marketplace_builder')), false);

	const skip = await migrateMarketplaceBuilderToApp({ cwd: root, skipConfirm: true });
	assert.equal(skip, 'skipped-missing');

	await fs.remove(root);
	console.log('migrate app directory smoke ok');
})().catch((error) => {
	console.error(error);
	process.exit(1);
});
