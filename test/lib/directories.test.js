const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const dir = require('../../lib/directories');

test('getSiteRoot prefers marketplace_builder over app', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-site-root-'));

	try {
		await fs.mkdir(path.join(rootPath, dir.SITE_ROOT));
		await fs.mkdir(path.join(rootPath, dir.APP));
		expect(dir.getSiteRoot(rootPath)).toEqual(dir.SITE_ROOT);
	} finally {
		await fs.remove(rootPath);
	}
});

test('getSiteRoot uses app when marketplace_builder is missing', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-site-root-'));

	try {
		await fs.mkdir(path.join(rootPath, dir.APP));
		expect(dir.getSiteRoot(rootPath)).toEqual(dir.APP);
	} finally {
		await fs.remove(rootPath);
	}
});

test('defaultSiteRoot falls back to marketplace_builder', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-site-root-'));

	try {
		expect(dir.defaultSiteRoot(rootPath)).toEqual(dir.SITE_ROOT);
	} finally {
		await fs.remove(rootPath);
	}
});
