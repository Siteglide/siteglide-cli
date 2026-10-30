const fs = require('fs-extra');
const os = require('os');
const path = require('path');

test('platformos-check runs against a minimal app liquid file', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-check-'));
	const pagePath = path.join(rootPath, 'app', 'views', 'pages', 'hello.liquid');

	try {
		await fs.ensureDir(path.dirname(pagePath));
		await fs.writeFile(pagePath, '{{ "hello" }}');
		const platformosCheck = require('@platformos/platformos-check-node');
		const result = await platformosCheck.appCheckRun(rootPath);
		expect(Array.isArray(result.offenses)).toEqual(true);
		expect(result.app.size).toBeGreaterThan(0);
	} finally {
		await fs.remove(rootPath);
	}
});
