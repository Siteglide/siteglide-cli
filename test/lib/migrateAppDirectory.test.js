const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const dir = require('../../lib/directories');
const { resolveSiteAppRoot, assertExclusiveSiteAppRoot } = require('../../lib/migrateAppDirectory');

test('resolveSiteAppRoot prefers marketplace_builder when present', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-app-root-'));

	try {
		await fs.mkdir(path.join(rootPath, dir.SITE_ROOT));
		await fs.mkdir(path.join(rootPath, dir.APP));
		expect(await resolveSiteAppRoot(rootPath)).toEqual(dir.SITE_ROOT);
	} finally {
		await fs.remove(rootPath);
	}
});

test('resolveSiteAppRoot uses app when marketplace_builder is missing', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-app-root-'));

	try {
		await fs.mkdir(path.join(rootPath, dir.APP));
		expect(await resolveSiteAppRoot(rootPath)).toEqual(dir.APP);
	} finally {
		await fs.remove(rootPath);
	}
});

test('resolveSiteAppRoot defaults to marketplace_builder when neither exists', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-app-root-'));

	try {
		expect(await resolveSiteAppRoot(rootPath)).toEqual(dir.SITE_ROOT);
	} finally {
		await fs.remove(rootPath);
	}
});

test('assertExclusiveSiteAppRoot returns root when only one site root exists', () => {
	const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-app-root-'));

	try {
		fs.mkdirSync(path.join(rootPath, dir.APP));
		expect(assertExclusiveSiteAppRoot(rootPath)).toEqual(dir.APP);
	} finally {
		fs.removeSync(rootPath);
	}
});
