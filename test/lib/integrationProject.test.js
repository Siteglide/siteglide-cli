const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	resolveIntegrationContext,
	isSiteglideProjectRoot
} = require('../helpers/integrationProject');

test('resolveIntegrationContext skips when project path does not exist', () => {
	const previous = process.env.SITEGLIDE_TEST_PROJECT;
	process.env.SITEGLIDE_TEST_PROJECT = path.join(os.tmpdir(), `sg-missing-${Date.now()}`);

	try {
		const result = resolveIntegrationContext();
		expect(result.ok).toEqual(false);
		if (!result.ok) {
			expect(result.skipReason).toMatch(/does not exist/);
		}
	} finally {
		if (previous === undefined) {
			delete process.env.SITEGLIDE_TEST_PROJECT;
		} else {
			process.env.SITEGLIDE_TEST_PROJECT = previous;
		}
	}
});

test('resolveIntegrationContext loads env from SITEGLIDE_TEST_PROJECT', () => {
	const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-int-'));
	const configPath = path.join(rootPath, '.siteglide-config');
	fs.mkdirSync(path.join(rootPath, 'marketplace_builder'));
	fs.writeFileSync(configPath, JSON.stringify({
		staging: {
			url: 'https://example.staging-siteglide.com/',
			email: 'admin@example.com',
			token: 'secret-token'
		}
	}));

	const previousProject = process.env.SITEGLIDE_TEST_PROJECT;
	const previousEnv = process.env.SITEGLIDE_TEST_ENV;
	process.env.SITEGLIDE_TEST_PROJECT = rootPath;
	process.env.SITEGLIDE_TEST_ENV = 'staging';

	try {
		const result = resolveIntegrationContext();
		expect(result).toEqual({
			ok: true,
			projectPath: rootPath,
			configPath,
			configRelative: '.siteglide-config',
			envName: 'staging',
			auth: {
				url: 'https://example.staging-siteglide.com/',
				email: 'admin@example.com',
				token: 'secret-token'
			},
			pullModule: undefined
		});
	} finally {
		if (previousProject === undefined) {
			delete process.env.SITEGLIDE_TEST_PROJECT;
		} else {
			process.env.SITEGLIDE_TEST_PROJECT = previousProject;
		}
		if (previousEnv === undefined) {
			delete process.env.SITEGLIDE_TEST_ENV;
		} else {
			process.env.SITEGLIDE_TEST_ENV = previousEnv;
		}
		fs.rmSync(rootPath, { recursive: true, force: true });
	}
});

test('isSiteglideProjectRoot detects marketplace_builder', () => {
	const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-int-'));
	fs.mkdirSync(path.join(rootPath, 'app'));

	try {
		expect(isSiteglideProjectRoot(rootPath)).toEqual(true);
	} finally {
		fs.rmSync(rootPath, { recursive: true, force: true });
	}
});
