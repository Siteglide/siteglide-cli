const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {
	DEFAULT_SKILL_AGENTS,
	SKILL_AGENT_ROOTS,
	AI_AGENT_PREFERENCES_RELATIVE_PATH,
	ensureAiAgentPreferences,
	needsAiAgentPreferencePrompt,
	writeAiAgentPreferences,
	prepareAiAgentPreferences,
	resolveEnabledSkillAgents
} = require('../../lib/aiAgentPreferences');

const parentPreferencesPath = (parentDir) => {
	return path.join(parentDir, '.siteglide', 'user', 'ai-agent-preferences.json');
};

const makeProjectRoot = async () => {
	const parentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-ai-prefs-'));
	const rootPath = path.join(parentDir, 'project');
	await fs.mkdir(rootPath);
	return { parentDir, rootPath };
};

test('preferences live above the project root so they stay local to the developer', () => {
	expect(AI_AGENT_PREFERENCES_RELATIVE_PATH).toEqual('../.siteglide/user/ai-agent-preferences.json');
});

test('resolveEnabledSkillAgents keeps include and drops exclude', () => {
	expect(resolveEnabledSkillAgents({
		include: DEFAULT_SKILL_AGENTS,
		exclude: []
	})).toEqual(DEFAULT_SKILL_AGENTS);

	expect(resolveEnabledSkillAgents({
		include: DEFAULT_SKILL_AGENTS,
		exclude: ['Cursor']
	})).toEqual(DEFAULT_SKILL_AGENTS.filter((name) => {
		return name !== 'Cursor';
	}));
});

test('resolveEnabledSkillAgents lets exclude win when a name is in both lists', () => {
	expect(resolveEnabledSkillAgents({
		include: ['Cursor', 'Claude'],
		exclude: ['Cursor']
	})).toEqual(['Claude']);
});

test('SKILL_AGENT_ROOTS maps known agents and defaults include VSCode for MCP', () => {
	expect(SKILL_AGENT_ROOTS).toEqual({
		Cursor: '.cursor',
		'Github Copilot': '.github',
		Claude: '.claude',
		Windsurf: '.windsurf'
	});
	expect(DEFAULT_SKILL_AGENTS).toEqual([
		'Cursor',
		'Github Copilot',
		'Claude',
		'Windsurf',
		'VSCode'
	]);
});

test('ensureAiAgentPreferences creates the file when missing and does not overwrite', async () => {
	const { parentDir, rootPath } = await makeProjectRoot();
	const configPath = parentPreferencesPath(parentDir);

	try {
		const first = await ensureAiAgentPreferences(rootPath);
		expect(first.created).toEqual(true);
		const parsed = JSON.parse(await fs.readFile(configPath, 'utf8'));
		expect(parsed.pull_behaviour.include).toEqual(DEFAULT_SKILL_AGENTS);
		expect(parsed.pull_behaviour.exclude).toEqual([]);
		expect(parsed.pull_behaviour.usage).toEqual(
			'By default, pull will create folders in your project to support skills and MCP for multiple AI agents. You can move agents from include to exclude to stop those folders (and that agent\'s mcp.json) being created. The MCP package can still be installed globally.'
		);

		await fs.writeFile(configPath, '{"pull_behaviour":{"include":["Cursor"],"exclude":["Claude"]}}\n', 'utf8');
		const second = await ensureAiAgentPreferences(rootPath);
		expect(second.created).toEqual(false);
		expect(JSON.parse(await fs.readFile(configPath, 'utf8'))).toEqual({
			pull_behaviour: {
				include: ['Cursor'],
				exclude: ['Claude']
			}
		});
	} finally {
		await fs.remove(parentDir);
	}
});

test('needsAiAgentPreferencePrompt is true only when exclude is empty', () => {
	expect(needsAiAgentPreferencePrompt({ include: DEFAULT_SKILL_AGENTS, exclude: [] })).toEqual(true);
	expect(needsAiAgentPreferencePrompt({
		include: DEFAULT_SKILL_AGENTS,
		exclude: ['Windsurf']
	})).toEqual(false);
});

test('writeAiAgentPreferences updates include and exclude while preserving usage', async () => {
	const { parentDir, rootPath } = await makeProjectRoot();
	const configPath = parentPreferencesPath(parentDir);

	try {
		await ensureAiAgentPreferences(rootPath);
		await writeAiAgentPreferences(rootPath, {
			include: ['Cursor', 'VSCode'],
			exclude: ['Claude', 'Windsurf', 'Github Copilot']
		});
		const parsed = JSON.parse(await fs.readFile(configPath, 'utf8'));
		expect(parsed.pull_behaviour.include).toEqual(['Cursor', 'VSCode']);
		expect(parsed.pull_behaviour.exclude).toEqual(['Claude', 'Windsurf', 'Github Copilot']);
		expect(parsed.pull_behaviour.usage).toEqual(
			'By default, pull will create folders in your project to support skills and MCP for multiple AI agents. You can move agents from include to exclude to stop those folders (and that agent\'s mcp.json) being created. The MCP package can still be installed globally.'
		);
	} finally {
		await fs.remove(parentDir);
	}
});

test('prepareAiAgentPreferences enables every default agent on a first pull', async () => {
	const { parentDir, rootPath } = await makeProjectRoot();

	try {
		const prepared = await prepareAiAgentPreferences(rootPath);
		expect(prepared).toEqual({
			created: true,
			enabledSkillAgents: DEFAULT_SKILL_AGENTS
		});
	} finally {
		await fs.remove(parentDir);
	}
});

test('prepareAiAgentPreferences applies include and exclude from an existing file', async () => {
	const { parentDir, rootPath } = await makeProjectRoot();
	const configPath = parentPreferencesPath(parentDir);

	try {
		await fs.ensureDir(path.dirname(configPath));
		await fs.writeFile(configPath, JSON.stringify({
			pull_behaviour: {
				include: ['Cursor', 'Claude', 'Windsurf'],
				exclude: ['Claude']
			}
		}), 'utf8');

		const prepared = await prepareAiAgentPreferences(rootPath);
		expect(prepared).toEqual({
			created: false,
			enabledSkillAgents: ['Cursor', 'Windsurf']
		});
	} finally {
		await fs.remove(parentDir);
	}
});

test('migrates legacy project-level ai-agent-preferences.json on read', async () => {
	const { parentDir, rootPath } = await makeProjectRoot();
	const legacyPath = path.join(rootPath, '.siteglide', 'user', 'ai-agent-preferences.json');
	await fs.ensureDir(path.dirname(legacyPath));
	await fs.writeFile(legacyPath, JSON.stringify({
		pull_behaviour: {
			include: ['VSCode'],
			exclude: ['Cursor']
		}
	}), 'utf8');

	try {
		const config = await prepareAiAgentPreferences(rootPath);
		expect(config.enabledSkillAgents).toEqual(['VSCode']);
		expect(await fs.pathExists(legacyPath)).toEqual(false);
		expect(await fs.pathExists(parentPreferencesPath(parentDir))).toEqual(true);
	} finally {
		await fs.remove(parentDir);
	}
});
