const fs = require('fs'),
	os = require('os'),
	path = require('path'),
	logger = require('./logger');

/** Single MCP server id registered for all supported IDEs. */
const SERVER_NAME = 'siteglide';

const STDIO_ENTRY = { command: 'siteglide-cli-mcp' };
const VSCODE_ENTRY = { type: 'stdio', command: 'siteglide-cli-mcp' };

/**
 * IDE MCP registry targets. Project-local where supported; Windsurf uses its
 * user-level config (no reliable project-level MCP file).
 * @param {string} [rootPath]
 * @param {string} [homedir] - Override home for Windsurf path (tests).
 */
const getRegistryTargets = (rootPath = process.cwd(), homedir = os.homedir()) => [
	{
		id: 'cursor',
		label: 'Cursor',
		configPath: path.join(rootPath, '.cursor', 'mcp.json'),
		serversKey: 'mcpServers',
		entry: STDIO_ENTRY
	},
	{
		id: 'claude',
		label: 'Claude Code',
		configPath: path.join(rootPath, '.mcp.json'),
		serversKey: 'mcpServers',
		entry: STDIO_ENTRY
	},
	{
		id: 'copilot',
		label: 'GitHub Copilot / VS Code',
		configPath: path.join(rootPath, '.vscode', 'mcp.json'),
		serversKey: 'servers',
		entry: VSCODE_ENTRY
	},
	{
		id: 'windsurf',
		label: 'Windsurf',
		configPath: path.join(homedir, '.codeium', 'windsurf', 'mcp_config.json'),
		serversKey: 'mcpServers',
		entry: STDIO_ENTRY
	}
];

const readJsonObject = (filePath) => {
	if (!fs.existsSync(filePath)) {
		return {};
	}
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed;
		}
		logger.Warn(
			`[pull] MCP config ${filePath} is not a JSON object — leaving it unchanged`,
			{ exit: false }
		);
		return null;
	} catch (error) {
		logger.Warn(
			`[pull] MCP config ${filePath} is invalid JSON (${error.message}) — leaving it unchanged`,
			{ exit: false }
		);
		return null;
	}
};

/**
 * Ensure `siteglide` is present in one registry file without touching other keys.
 * @returns {'added'|'skipped'|'unchanged'|'error'}
 */
const ensureServerInConfig = (target) => {
	const config = readJsonObject(target.configPath);
	if (config === null) {
		return 'error';
	}

	if (!config[target.serversKey] || typeof config[target.serversKey] !== 'object' || Array.isArray(config[target.serversKey])) {
		config[target.serversKey] = {};
	}

	const servers = config[target.serversKey];
	if (Object.prototype.hasOwnProperty.call(servers, SERVER_NAME)) {
		return 'unchanged';
	}

	servers[SERVER_NAME] = Object.assign({}, target.entry);
	fs.mkdirSync(path.dirname(target.configPath), { recursive: true });
	fs.writeFileSync(target.configPath, JSON.stringify(config, null, 2) + '\n');
	return 'added';
};

/**
 * On pull: register Siteglide MCP in Cursor, Claude, Copilot, and Windsurf if missing.
 * Never overwrites other servers or an existing `siteglide` entry.
 *
 * @param {{ rootPath?: string, homedir?: string }} [opts]
 * @returns {{ added: string[], unchanged: string[], errors: string[] }}
 */
const ensureMcpRegistered = (opts = {}) => {
	const rootPath = opts.rootPath || process.cwd();
	const targets = getRegistryTargets(rootPath, opts.homedir || os.homedir());
	const added = [];
	const unchanged = [];
	const errors = [];

	for (let i = 0; i < targets.length; i++) {
		const target = targets[i];
		try {
			const result = ensureServerInConfig(target);
			if (result === 'added') {
				added.push(target.label);
			} else if (result === 'unchanged') {
				unchanged.push(target.label);
			} else if (result === 'error') {
				errors.push(target.label);
			}
		} catch (error) {
			errors.push(target.label);
			logger.Warn(`[pull] Could not update ${target.label} MCP config: ${error.message}`, {
				exit: false
			});
		}
	}

	if (added.length > 0) {
		logger.Info(`[pull] Registered Siteglide MCP for: ${added.join(', ')}`);
	}
	if (unchanged.length > 0) {
		logger.Debug(`[pull] Siteglide MCP already present for: ${unchanged.join(', ')}`);
	}
	if (errors.length > 0) {
		logger.Warn(`[pull] Skipped MCP registration (invalid existing config) for: ${errors.join(', ')}`, {
			exit: false
		});
	}
	if (added.length === 0 && unchanged.length > 0 && errors.length === 0) {
		logger.Info('[pull] Siteglide MCP already registered for supported IDEs');
	}

	return { added, unchanged, errors };
};

module.exports = {
	SERVER_NAME,
	STDIO_ENTRY,
	ensureMcpRegistered,
	getRegistryTargets
};
