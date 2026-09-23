/**
 * Per-developer `.siteglide/user/ai-agent-preferences.json` — `pull_behaviour.include` /
 * `exclude` choose which IDE roots pull may create skill folders in. Local to the
 * current machine, unlike the shared module settings in `.siteglide/project/`.
 */
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');
const { userSegments } = require('./siteglidePaths');

const AI_AGENT_PREFERENCES_RELATIVE_PATH = path.join(...userSegments('ai-agent-preferences.json'));

const DEFAULT_SKILL_AGENTS = [
	'Cursor',
	'Github Copilot',
	'Claude',
	'Windsurf',
	'VSCode'
];

/** Agent display names in the preferences file → project-root folder for skills. */
const SKILL_AGENT_ROOTS = {
	Cursor: '.cursor',
	'Github Copilot': '.github',
	Claude: '.claude',
	Windsurf: '.windsurf'
};

const defaultAiAgentBehaviour = () => {
	return {
		usage: 'By default, pull will create folders in your project to support skills and MCP for multiple AI agents. You can move agents from include to exclude to stop those folders (and that agent\'s mcp.json) being created. The MCP package can still be installed globally.',
		include: DEFAULT_SKILL_AGENTS.slice(),
		exclude: []
	};
};

const defaultAiAgentPreferencesDocument = () => {
	return {
		pull_behaviour: defaultAiAgentBehaviour()
	};
};

const normalizeAgentName = (value) => {
	if (typeof value !== 'string') {
		return '';
	}
	return value.trim();
};

const normalizeAgentList = (value) => {
	if (!Array.isArray(value)) {
		return [];
	}
	const seen = {};
	const normalized = [];
	for (let i = 0; i < value.length; i++) {
		const name = normalizeAgentName(value[i]);
		if (!name || seen[name]) {
			continue;
		}
		seen[name] = true;
		normalized.push(name);
	}
	return normalized;
};

const parseAiAgentBehaviour = (parsed) => {
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return null;
	}
	const pullBehaviour = parsed.pull_behaviour;
	if (!pullBehaviour || typeof pullBehaviour !== 'object' || Array.isArray(pullBehaviour)) {
		return null;
	}
	return {
		include: normalizeAgentList(pullBehaviour.include),
		exclude: normalizeAgentList(pullBehaviour.exclude)
	};
};

const resolveAiAgentPreferencesPath = (rootPath = process.cwd()) => {
	return path.join(rootPath, AI_AGENT_PREFERENCES_RELATIVE_PATH);
};

/**
 * Agents to scaffold: in include and not in exclude. Exclude wins.
 *
 * @param {{ include?: unknown, exclude?: unknown }} [config]
 * @returns {string[]}
 */
const resolveEnabledSkillAgents = (config = {}) => {
	const include = normalizeAgentList(config.include);
	const exclude = normalizeAgentList(config.exclude);
	const enabled = [];
	for (let i = 0; i < include.length; i++) {
		const name = include[i];
		if (exclude.indexOf(name) === -1) {
			enabled.push(name);
		}
	}
	return enabled;
};

const isSkillAgentEnabled = (agentName, enabledAgents) => {
	return enabledAgents.indexOf(agentName) !== -1;
};

/** Create the preferences file when missing. Never overwrites an existing file. */
const ensureAiAgentPreferences = async (rootPath = process.cwd()) => {
	const configPath = resolveAiAgentPreferencesPath(rootPath);
	if (await fs.pathExists(configPath)) {
		return { configPath, created: false };
	}
	await fs.ensureDir(path.dirname(configPath));
	await fs.writeFile(
		configPath,
		`${JSON.stringify(defaultAiAgentPreferencesDocument(), null, '\t')}\n`,
		'utf8'
	);
	return { configPath, created: true };
};

const readAiAgentPreferences = async (rootPath = process.cwd()) => {
	const configPath = resolveAiAgentPreferencesPath(rootPath);
	if (!(await fs.pathExists(configPath))) {
		return { include: DEFAULT_SKILL_AGENTS.slice(), exclude: [] };
	}
	try {
		const parsed = JSON.parse(await fs.readFile(configPath, 'utf8'));
		const pullBehaviour = parseAiAgentBehaviour(parsed);
		if (!pullBehaviour) {
			logger.Warn(`[pull] ${AI_AGENT_PREFERENCES_RELATIVE_PATH} must contain a pull_behaviour object; scaffolding all default agents`, { exit: false });
			return { include: DEFAULT_SKILL_AGENTS.slice(), exclude: [] };
		}
		return pullBehaviour;
	} catch (error) {
		logger.Warn(`[pull] ${AI_AGENT_PREFERENCES_RELATIVE_PATH} is invalid JSON (${error.message}); scaffolding all default agents`, { exit: false });
		return { include: DEFAULT_SKILL_AGENTS.slice(), exclude: [] };
	}
};

/**
 * True when pull should ask which AI agents to scaffold (first-time / unset exclude list).
 * @param {{ include?: unknown, exclude?: unknown }} config
 * @returns {boolean}
 */
const needsAiAgentPreferencePrompt = (config = {}) => {
	return normalizeAgentList(config.exclude).length === 0;
};

/**
 * @param {string} [rootPath]
 * @param {{ include: string[], exclude: string[] }} pullBehaviour
 */
const writeAiAgentPreferences = async (rootPath = process.cwd(), pullBehaviour) => {
	const configPath = resolveAiAgentPreferencesPath(rootPath);
	await ensureAiAgentPreferences(rootPath);
	let document = defaultAiAgentPreferencesDocument();
	if (await fs.pathExists(configPath)) {
		try {
			const parsed = JSON.parse(await fs.readFile(configPath, 'utf8'));
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				document = parsed;
			}
		} catch (error) {
			logger.Debug(`[pull] AI: Could not read ${AI_AGENT_PREFERENCES_RELATIVE_PATH} before write: ${error.message}`);
		}
	}
	const include = normalizeAgentList(pullBehaviour.include);
	const exclude = normalizeAgentList(pullBehaviour.exclude);
	document.pull_behaviour = Object.assign({}, document.pull_behaviour || defaultAiAgentBehaviour(), {
		include,
		exclude
	});
	if (!document.pull_behaviour.usage) {
		document.pull_behaviour.usage = defaultAiAgentBehaviour().usage;
	}
	await fs.ensureDir(path.dirname(configPath));
	await fs.writeFile(configPath, `${JSON.stringify(document, null, '\t')}\n`, 'utf8');
};

/**
 * When exclude is still empty, prompt for enabled agents and persist include/exclude.
 * @param {string} [rootPath]
 * @returns {Promise<{ cancelled: boolean, prompted: boolean, config: { include: string[], exclude: string[] } }>}
 */
const promptAiAgentPreferencesIfNeeded = async (rootPath = process.cwd()) => {
	const { created } = await ensureAiAgentPreferences(rootPath);
	let config = await readAiAgentPreferences(rootPath);

	if (!needsAiAgentPreferencePrompt(config)) {
		return { cancelled: false, prompted: false, config };
	}

	if (!process.stdin.isTTY || process.env.CI) {
		return { cancelled: false, prompted: false, config };
	}

	const { selectCheckbox } = require('./prompts');
	const enabledDefault = resolveEnabledSkillAgents(config);
	const choices = DEFAULT_SKILL_AGENTS.map((name) => {
		return {
			name,
			value: name,
			checked: enabledDefault.indexOf(name) !== -1
		};
	});

	let selected = null;
	while (selected === null || selected.length === 0) {
		const answer = await selectCheckbox(
			'Which AI agents should pull set up skills and MCP for?',
			choices,
			{ required: false }
		);
		if (answer === null) {
			return { cancelled: true, prompted: false, config };
		}
		if (answer.length === 0) {
			logger.Warn('[pull] Select at least one AI agent.', { exit: false });
			continue;
		}
		selected = answer;
	}

	const include = DEFAULT_SKILL_AGENTS.filter((name) => {
		return selected.indexOf(name) !== -1;
	});
	const exclude = DEFAULT_SKILL_AGENTS.filter((name) => {
		return selected.indexOf(name) === -1;
	});
	await writeAiAgentPreferences(rootPath, { include, exclude });
	config = { include, exclude };
	logger.Info(`[pull] AI agents enabled for this machine: ${include.join(', ')}`);
	if (created) {
		logger.Info(
			`[pull] Saved ./${AI_AGENT_PREFERENCES_RELATIVE_PATH} — edit include/exclude anytime to change which agents pull scaffolds.`
		);
	}
	return { cancelled: false, prompted: true, config };
};

const prepareAiAgentPreferences = async (rootPath = process.cwd()) => {
	const { created } = await ensureAiAgentPreferences(rootPath);
	const config = await readAiAgentPreferences(rootPath);
	const enabledSkillAgents = resolveEnabledSkillAgents(config);
	logger.Debug(`[pull] AI: Skill folders enabled for: ${enabledSkillAgents.join(', ') || 'none'}`);
	return { created, enabledSkillAgents };
};

module.exports = {
	DEFAULT_SKILL_AGENTS,
	SKILL_AGENT_ROOTS,
	AI_AGENT_PREFERENCES_RELATIVE_PATH,
	defaultAiAgentPreferencesDocument,
	ensureAiAgentPreferences,
	readAiAgentPreferences,
	writeAiAgentPreferences,
	needsAiAgentPreferencePrompt,
	promptAiAgentPreferencesIfNeeded,
	prepareAiAgentPreferences,
	resolveEnabledSkillAgents,
	isSkillAgentEnabled
};
