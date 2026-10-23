const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {
	MODE_SITE,
	MODE_VERSION_CONTROL,
	SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH,
	defaultSourceOfTruthDocument,
	ensureSourceOfTruthConfig,
	promptAndEnsureSourceOfTruthConfig,
	writeSourceOfTruthDocument,
	readSourceOfTruthMode,
	resolveSkipRemoteCheck,
	assertVersionControlPullEnvironment
} = require('../../lib/sourceOfTruth');

test('ensureSourceOfTruthConfig creates sourceOfTruth.json when missing and does not overwrite existing file', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-source-of-truth-'));
	const configPath = path.join(rootPath, SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH);

	const first = await ensureSourceOfTruthConfig(rootPath);
	expect(first.created).toBe(true);
	expect(first.configPath).toBe(configPath);
	expect(JSON.parse(await fs.readFile(configPath, 'utf8'))).toEqual(defaultSourceOfTruthDocument());

	await fs.writeFile(configPath, JSON.stringify({ sourceOfTruth: MODE_VERSION_CONTROL, usage: 'custom' }), 'utf8');

	const second = await ensureSourceOfTruthConfig(rootPath);
	expect(second.created).toBe(false);
	expect(JSON.parse(await fs.readFile(configPath, 'utf8'))).toEqual({
		sourceOfTruth: MODE_VERSION_CONTROL,
		usage: 'custom'
	});
});

test('readSourceOfTruthMode returns site when file is missing', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-source-of-truth-read-'));
	await expect(readSourceOfTruthMode(rootPath)).resolves.toBe(MODE_SITE);
});

test('readSourceOfTruthMode reads site and versionControl', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-source-of-truth-modes-'));
	const configPath = path.join(rootPath, SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH);
	await fs.ensureDir(path.dirname(configPath));

	await fs.writeFile(configPath, JSON.stringify({ sourceOfTruth: MODE_VERSION_CONTROL }), 'utf8');
	await expect(readSourceOfTruthMode(rootPath)).resolves.toBe(MODE_VERSION_CONTROL);

	await fs.writeFile(configPath, JSON.stringify({ sourceOfTruth: MODE_SITE }), 'utf8');
	await expect(readSourceOfTruthMode(rootPath)).resolves.toBe(MODE_SITE);
});

test('readSourceOfTruthMode treats invalid sourceOfTruth as site', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-source-of-truth-invalid-'));
	const configPath = path.join(rootPath, SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH);
	await fs.ensureDir(path.dirname(configPath));
	await fs.writeFile(configPath, JSON.stringify({ sourceOfTruth: 'github' }), 'utf8');
	await expect(readSourceOfTruthMode(rootPath)).resolves.toBe(MODE_SITE);
});

test('promptAndEnsureSourceOfTruthConfig does not overwrite an existing file', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-sot-prompt-'));
	const configPath = path.join(rootPath, SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH);
	await fs.ensureDir(path.dirname(configPath));
	await fs.writeFile(
		configPath,
		JSON.stringify({ sourceOfTruth: MODE_VERSION_CONTROL, usage: 'keep' }),
		'utf8'
	);

	const result = await promptAndEnsureSourceOfTruthConfig(rootPath);
	expect(result).toEqual({ mode: MODE_VERSION_CONTROL, created: false });
	expect(JSON.parse(await fs.readFile(configPath, 'utf8')).usage).toBe('keep');
});

test('writeSourceOfTruthDocument persists versionControl mode', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-sot-write-'));
	await writeSourceOfTruthDocument(rootPath, MODE_VERSION_CONTROL);
	await expect(readSourceOfTruthMode(rootPath)).resolves.toBe(MODE_VERSION_CONTROL);
	const parsed = JSON.parse(
		await fs.readFile(path.join(rootPath, SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH), 'utf8')
	);
	expect(parsed.sourceOfTruth).toBe(MODE_VERSION_CONTROL);
	expect(parsed.usage).toMatch(/siteglide-cli ai/);
});

test('promptAndEnsureSourceOfTruthConfig non-interactive creates default site', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-sot-prompt-ni-'));
	const originalIsTTY = process.stdin.isTTY;
	delete process.env.CI;
	Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

	try {
		const result = await promptAndEnsureSourceOfTruthConfig(rootPath);
		expect(result).toEqual({ mode: MODE_SITE, created: true });
		await expect(readSourceOfTruthMode(rootPath)).resolves.toBe(MODE_SITE);
	} finally {
		Object.defineProperty(process.stdin, 'isTTY', {
			value: originalIsTTY,
			configurable: true
		});
	}
});

test('resolveSkipRemoteCheck truth table', () => {
	expect(resolveSkipRemoteCheck({ cliFlag: false, mode: MODE_SITE })).toBe(false);
	expect(resolveSkipRemoteCheck({ cliFlag: true, mode: MODE_SITE })).toBe(true);
	expect(resolveSkipRemoteCheck({ cliFlag: false, mode: MODE_VERSION_CONTROL })).toBe(true);
	expect(resolveSkipRemoteCheck({ cliFlag: true, mode: MODE_VERSION_CONTROL })).toBe(true);
});

describe('assertVersionControlPullEnvironment', () => {
	const originalAssumeYes = process.env.SITEGLIDE_PULL_ASSUME_YES;
	const originalCi = process.env.CI;
	const originalIsTTY = process.stdin.isTTY;

	afterEach(() => {
		if (originalAssumeYes === undefined) {
			delete process.env.SITEGLIDE_PULL_ASSUME_YES;
		} else {
			process.env.SITEGLIDE_PULL_ASSUME_YES = originalAssumeYes;
		}
		if (originalCi === undefined) {
			delete process.env.CI;
		} else {
			process.env.CI = originalCi;
		}
		Object.defineProperty(process.stdin, 'isTTY', {
			value: originalIsTTY,
			configurable: true
		});
	});

	test('site mode is always allowed', () => {
		expect(assertVersionControlPullEnvironment(MODE_SITE)).toEqual({ allowed: true });
	});

	test('versionControl refuses non-interactive pull without SITEGLIDE_PULL_ASSUME_YES', () => {
		delete process.env.SITEGLIDE_PULL_ASSUME_YES;
		delete process.env.CI;
		Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
		const result = assertVersionControlPullEnvironment(MODE_VERSION_CONTROL);
		expect(result.allowed).toBe(false);
		expect(result.message).toMatch(/Refusing pull/);
	});

	test('versionControl allows non-interactive pull when SITEGLIDE_PULL_ASSUME_YES=1', () => {
		process.env.SITEGLIDE_PULL_ASSUME_YES = '1';
		Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
		expect(assertVersionControlPullEnvironment(MODE_VERSION_CONTROL)).toEqual({ allowed: true });
	});
});
