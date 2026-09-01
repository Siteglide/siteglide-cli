/**
 * Per-developer `.siteglide/user/ai-agent-preferences.json` — `pull_behaviour.include` /
 * `exclude` choose which IDE roots pull may create skill folders in. Local to the
 * current machine, unlike the shared module settings in `.siteglide/project/`.
 */
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

const AI_AGENT_PREFERENCES_DIR = path.join('.siteglide', 'user');
const AI_AGENT_PREFERENCES_FILE = 'ai-agent-preferences.json';
const AI_AGENT_PREFERENCES_RELATIVE_PATH = path.join(AI_AGENT_PREFERENCES_DIR, AI_AGENT_PREFERENCES_FILE);

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
	prepareAiAgentPreferences,
	resolveEnabledSkillAgents,
	isSkillAgentEnabled
};
