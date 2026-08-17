const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {
	DEFAULT_PULL_IGNORED_MODULES,
	PULL_MODULES_CONFIG_RELATIVE_PATH,
	mergePullIgnoredModules,
	ensurePullModulesConfig,
	readPullModulesConfig,
	preparePullModulesConfig,
	isPullIgnoredModule,
	filterPullIgnoredModules,
	partitionPullIgnoredModules,
	resolvePullIgnoredModules,
	selectModulesToPull
} = require('../../lib/pullIgnoredModules');

const installed = ['module_357', 'user', 'siteglide_system', 'studio'];

test('mergePullIgnoredModules returns built-in list when include and exclude are empty', () => {
	expect(mergePullIgnoredModules({ include: [], exclude: [] })).toEqual(DEFAULT_PULL_IGNORED_MODULES);
});

test('mergePullIgnoredModules adds exclude entries without replacing built-ins', () => {
	expect(mergePullIgnoredModules({ exclude: ['custom_module'] })).toEqual([
		...DEFAULT_PULL_IGNORED_MODULES,
		'custom_module'
	]);
});

test('mergePullIgnoredModules removes include entries from the built-in list', () => {
	expect(mergePullIgnoredModules({ include: ['module_357', 'siteglide_system'] })).toEqual(
		DEFAULT_PULL_IGNORED_MODULES.filter((name) => {
			return name !== 'module_357' && name !== 'siteglide_system';
		})
	);
});

test('mergePullIgnoredModules lets include remove a name added by exclude', () => {
	expect(mergePullIgnoredModules({
		include: ['custom_module'],
		exclude: ['custom_module']
	})).toEqual(DEFAULT_PULL_IGNORED_MODULES);
});

test('ensurePullModulesConfig creates modules.json when missing and does not overwrite existing file', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-pull-modules-'));
	const configPath = path.join(rootPath, PULL_MODULES_CONFIG_RELATIVE_PATH);

	const first = await ensurePullModulesConfig(rootPath);
	expect(first.created).toEqual(true);
	expect(await fs.pathExists(configPath)).toEqual(true);

	const parsed = JSON.parse(await fs.readFile(configPath, 'utf8'));
	expect(parsed.pull_behaviour.include).toEqual([]);
	expect(parsed.pull_behaviour.exclude).toEqual([]);
	expect(typeof parsed.pull_behaviour.usage).toEqual('string');
	expect(parsed.pull_behaviour.usage).toContain('exclude');
	expect(parsed.pull_behaviour.usage).toContain('include');
	expect(parsed.pull_behaviour.usage).toContain('git');

	await fs.writeFile(configPath, '{"pull_behaviour":{"include":[],"exclude":["team_override"]}}\n', 'utf8');

	const second = await ensurePullModulesConfig(rootPath);
	expect(second.created).toEqual(false);
	expect(JSON.parse(await fs.readFile(configPath, 'utf8'))).toEqual({
		pull_behaviour: {
			include: [],
			exclude: ['team_override']
		}
	});

	await fs.remove(rootPath);
});

test('preparePullModulesConfig applies include and exclude from modules.json', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-pull-modules-config-'));
	const configPath = path.join(rootPath, PULL_MODULES_CONFIG_RELATIVE_PATH);
	await fs.ensureDir(path.dirname(configPath));
	await fs.writeFile(configPath, JSON.stringify({
		pull_behaviour: {
			include: ['module_357'],
			exclude: ['custom_module']
		}
	}, null, '\t') + '\n', 'utf8');

	const prepared = await preparePullModulesConfig(rootPath);
	expect(prepared.created).toEqual(false);
	expect(prepared.effectiveIgnoredModules).toEqual([
		...DEFAULT_PULL_IGNORED_MODULES.filter((name) => {
			return name !== 'module_357';
		}),
		'custom_module'
	]);

	const config = await readPullModulesConfig(rootPath);
	expect(config).toEqual({
		include: ['module_357'],
		exclude: ['custom_module']
	});

	await fs.remove(rootPath);
});

test('DEFAULT_PULL_IGNORED_MODULES lists expected Siteglide platform modules', () => {
	expect(DEFAULT_PULL_IGNORED_MODULES).toEqual([
		'module_86',
		'module_357',
		'siteglide_authors',
		'siteglide_blog',
		'siteglide_ecommerce',
		'siteglide_menu',
		'siteglide_secure_zones',
		'siteglide_system',
		'siteglide_events',
		'siteglide_media_downloads',
		'siteglide_design_system',
		'siteglide_email_marketing'
	]);
});

test('isPullIgnoredModule matches default ignored names', () => {
	expect(isPullIgnoredModule('module_357')).toEqual(true);
	expect(isPullIgnoredModule('user')).toEqual(false);
});

test('filterPullIgnoredModules removes default ignored modules', () => {
	expect(filterPullIgnoredModules(installed)).toEqual(['user', 'studio']);
});

test('partitionPullIgnoredModules splits selected and ignored lists', () => {
	expect(partitionPullIgnoredModules(installed)).toEqual({
		selected: ['user', 'studio'],
		ignored: ['module_357', 'siteglide_system']
	});
});

test('selectModulesToPull returns all non-ignored modules without -m', () => {
	expect(selectModulesToPull(installed)).toEqual(['user', 'studio']);
});

test('selectModulesToPull allows explicit -m for a default-ignored module', () => {
	expect(selectModulesToPull(installed, 'module_357')).toEqual(['module_357']);
});

test('selectModulesToPull returns null when -m module is not installed', () => {
	expect(selectModulesToPull(installed, 'missing')).toEqual(null);
});

test('resolvePullIgnoredModules drops the explicit -m target from the ignore list', () => {
	expect(resolvePullIgnoredModules('module_357')).toEqual([
		'module_86',
		'siteglide_authors',
		'siteglide_blog',
		'siteglide_ecommerce',
		'siteglide_menu',
		'siteglide_secure_zones',
		'siteglide_system',
		'siteglide_events',
		'siteglide_media_downloads',
		'siteglide_design_system',
		'siteglide_email_marketing'
	]);
	expect(resolvePullIgnoredModules(undefined)).toEqual(DEFAULT_PULL_IGNORED_MODULES);
});
