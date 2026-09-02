const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {
	NPM_ORG_SCOPE,
	MCP_PACKAGE_NAME,
	DEFAULT_PACKAGE,
	DEFAULT_TAG,
	MCP_UPDATE_REMINDER_DAYS,
	MCP_UPDATE_DECLINED_KEY,
	pickLatestPublishedVersion,
	pickCompatibleInstallVersion,
	getMaxCompatibleMcpVersion,
	getMcpConfigStatus,
	needsMcpInstall,
	shouldPromptMcpUpdate,
	writeMcpUpdateDeclinedReminder,
	resolveInstalledMcpVersion,
	resolveInstalledMcpVersionWithTimeout
} = require('../../lib/mcpAlpha');
const { SERVER_NAME } = require('../../lib/ai');

test('pickLatestPublishedVersion uses latest dist-tag only', () => {
	expect(pickLatestPublishedVersion({
		tagVersion: '0.1.2',
		versions: ['0.1.0', '0.1.2'],
		distTags: { latest: '0.1.2' }
	}, 'latest')).toEqual('0.1.2');

	expect(pickLatestPublishedVersion({
		tagVersion: null,
		versions: ['0.1.0', '0.1.2'],
		distTags: {}
	}, 'latest')).toEqual(null);

	expect(pickLatestPublishedVersion(null, 'latest')).toEqual(null);
});

test('pickCompatibleInstallVersion caps to compatible range when npm latest exceeds CLI support', () => {
	const published = {
		tagVersion: '0.2.0',
		versions: ['0.1.0', '0.1.1', '0.2.0'],
		distTags: { latest: '0.2.0' }
	};

	expect(pickCompatibleInstallVersion(published, '^0.1.0-0')).toEqual('0.1.1');
	expect(pickCompatibleInstallVersion(published, '^0.1.0-0')).not.toEqual('0.2.0');
});

test('pickCompatibleInstallVersion uses highest semver in range', () => {
	const published = {
		tagVersion: '0.1.2',
		versions: ['0.1.0', '0.1.1', '0.1.2'],
		distTags: { latest: '0.1.2' }
	};

	expect(pickCompatibleInstallVersion(published, '^0.1.0-0')).toEqual('0.1.2');
});

test('pickCompatibleInstallVersion offers alpha when it is the only version in range', () => {
	const published = {
		tagVersion: '0.1.0-alpha.0',
		versions: ['0.1.0-alpha.0'],
		distTags: { latest: '0.1.0-alpha.0' }
	};

	expect(pickCompatibleInstallVersion(published, '^0.1.0-0')).toEqual('0.1.0-alpha.0');
});

test('pickCompatibleInstallVersion prefers stable over alpha when both are in range', () => {
	const published = {
		tagVersion: '0.1.0-alpha.1',
		versions: ['0.1.0', '0.1.0-alpha.1'],
		distTags: { latest: '0.1.0-alpha.1' }
	};

	expect(pickCompatibleInstallVersion(published, '^0.1.0-0')).toEqual('0.1.0');
});

test('getMaxCompatibleMcpVersion returns highest version within range', () => {
	const published = {
		versions: ['0.1.0', '0.1.1', '0.2.0']
	};

	expect(getMaxCompatibleMcpVersion(published, '^0.1.0')).toEqual('0.1.1');
	expect(getMaxCompatibleMcpVersion(published, '^0.2.0')).toEqual('0.2.0');
});

test('DEFAULT_PACKAGE uses npm latest dist-tag', () => {
	expect(NPM_ORG_SCOPE).toEqual('@siteglide');
	expect(MCP_PACKAGE_NAME).toEqual('siteglide-mcp');
	expect(DEFAULT_PACKAGE).toEqual('@siteglide/siteglide-mcp');
	expect(DEFAULT_TAG).toEqual('latest');
});

test('getMcpConfigStatus reports configured when siteglide server exists', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-status-'));
	const cursorPath = path.join(rootPath, '.cursor', 'mcp.json');

	try {
		await fs.ensureDir(path.dirname(cursorPath));
		await fs.writeFile(cursorPath, JSON.stringify({
			mcpServers: {
				[SERVER_NAME]: { command: 'node', args: ['siteglide-cli-mcp.js'] }
			}
		}, null, 2));

		expect(getMcpConfigStatus(rootPath)).toEqual({
			configured: true,
			paths: [cursorPath],
			missing: [
				path.join(rootPath, '.mcp.json'),
				path.join(rootPath, '.vscode', 'mcp.json')
			]
		});
	} finally {
		await fs.remove(rootPath);
	}
});

test('needsMcpInstall when published version missing or already installed', () => {
	expect(needsMcpInstall(null, null)).toEqual(false);
	expect(needsMcpInstall('0.1.0-alpha.0', null)).toEqual(false);
	expect(needsMcpInstall(null, '0.1.1')).toEqual(true);
	expect(needsMcpInstall('0.1.0', '0.1.1')).toEqual(true);
	expect(needsMcpInstall('0.1.1', '0.1.1')).toEqual(false);
});

test('resolveInstalledMcpVersionWithTimeout returns installed version', async () => {
	const expectedVersion = resolveInstalledMcpVersion();
	expect(await resolveInstalledMcpVersionWithTimeout()).toEqual({
		version: expectedVersion,
		timedOut: false
	});
});

test('shouldPromptMcpUpdate respects 7-day reminder cooldown', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-reminder-'));

	try {
		expect(shouldPromptMcpUpdate(rootPath)).toEqual(true);

		writeMcpUpdateDeclinedReminder(rootPath);
		expect(shouldPromptMcpUpdate(rootPath)).toEqual(false);

		const remindersPath = path.join(rootPath, '.siteglide', 'user', 'reminders.json');
		const reminders = JSON.parse(await fs.readFile(remindersPath, 'utf8'));
		const declinedMs = Date.parse(reminders[MCP_UPDATE_DECLINED_KEY]);
		const afterCooldown = declinedMs + (MCP_UPDATE_REMINDER_DAYS * 24 * 60 * 60 * 1000) + 1000;
		expect(shouldPromptMcpUpdate(rootPath, afterCooldown)).toEqual(true);
	} finally {
		await fs.remove(rootPath);
	}
});
