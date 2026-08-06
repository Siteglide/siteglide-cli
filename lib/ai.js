const fs = require('fs'),
	os = require('os'),
	path = require('path'),
	logger = require('./logger');

/** Single MCP server id registered for all supported IDEs. */
const SERVER_NAME = 'siteglide';

/**
 * Absolute path to this package's MCP launcher script.
 * Prefer this over a bare `siteglide-cli-mcp` PATH lookup — Cursor/IDE MCP
 * spawns often lack nvm/npm global bin dirs on Windows.
 */
const resolveMcpScriptPath = () => path.resolve(__dirname, '..', 'siteglide-cli-mcp.js');

/**
 * MCP stdio launch entry using absolute node + script paths (PATH-independent).
 * @param {{ type?: string }} [extra]
 */
const buildMcpLaunchEntry = (extra = {}) => {
	const entry = {
		command: process.execPath,
		args: [resolveMcpScriptPath()]
	};
	if (extra.type) {
		entry.type = extra.type;
	}
	return entry;
};

/** Shared agent guidance (also mirrored into platform-specific rule wrappers). */
const MCP_AGENT_GUIDANCE = `This is a Siteglide project. Prefer Siteglide MCP tools for Siteglide work:
validate_code, siteglide_rules, siteglide_guide, envs_list, graphql_exec, liquid_exec, logs_fetch.

NEVER open, read, search, grep, or quote .siteglide-config (or CONFIG_FILE_PATH) — it contains secret tokens.
To list environments/sites, call the MCP tool envs_list only. For GraphQL/Liquid/logs, call the matching MCP ops tool with an environment name; those tools load credentials internally.

If those Siteglide MCP tools are not in your live tool catalog:
1. Ensure the IDE MCP config has server "siteglide" launched via node with absolute path to siteglide-cli-mcp.js (siteglide-cli pull writes this — do not rely on PATH / bare siteglide-cli-mcp).
2. Do not work around by reading .siteglide-config.
3. Ask the user to enable the Siteglide MCP server in IDE settings (e.g. Cursor Settings → Tools & MCP) and reload the window if tools are still missing.

Call siteglide_rules early when doing Siteglide work.
`;

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
		entry: buildMcpLaunchEntry()
	},
	{
		id: 'claude',
		label: 'Claude Code',
		configPath: path.join(rootPath, '.mcp.json'),
		serversKey: 'mcpServers',
		entry: buildMcpLaunchEntry()
	},
	{
		id: 'copilot',
		label: 'GitHub Copilot / VS Code',
		configPath: path.join(rootPath, '.vscode', 'mcp.json'),
		serversKey: 'servers',
		entry: buildMcpLaunchEntry({ type: 'stdio' })
	},
	{
		id: 'windsurf',
		label: 'Windsurf',
		configPath: path.join(homedir, '.codeium', 'windsurf', 'mcp_config.json'),
		serversKey: 'mcpServers',
		entry: buildMcpLaunchEntry()
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

const entriesEqual = (a, b) => {
	try {
		return JSON.stringify(a) === JSON.stringify(b);
	} catch (error) {
		return false;
	}
};

/**
 * Ensure `siteglide` is present and uses PATH-independent node + absolute script.
 * Updates bare `siteglide-cli-mcp` entries. Never touches other servers.
 * @returns {'added'|'updated'|'unchanged'|'error'}
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
	const desired = Object.assign({}, target.entry);
	const existing = servers[SERVER_NAME];

	if (existing && entriesEqual(existing, desired)) {
		return 'unchanged';
	}

	const hadExisting = Object.prototype.hasOwnProperty.call(servers, SERVER_NAME);
	servers[SERVER_NAME] = desired;
	fs.mkdirSync(path.dirname(target.configPath), { recursive: true });
	fs.writeFileSync(target.configPath, JSON.stringify(config, null, 2) + '\n');
	return hadExisting ? 'updated' : 'added';
};

/**
 * On pull: register/repair Siteglide MCP in Cursor, Claude, Copilot, and Windsurf.
 * Launch uses absolute node + siteglide-cli-mcp.js (no PATH dependency).
 *
 * @param {{ rootPath?: string, homedir?: string }} [opts]
 * @returns {{ added: string[], updated: string[], unchanged: string[], errors: string[] }}
 */
const ensureMcpRegistered = (opts = {}) => {
	const rootPath = opts.rootPath || process.cwd();
	const targets = getRegistryTargets(rootPath, opts.homedir || os.homedir());
	const added = [];
	const updated = [];
	const unchanged = [];
	const errors = [];

	logger.Debug(`[pull] MCP launch: ${process.execPath} ${resolveMcpScriptPath()}`);

	for (let i = 0; i < targets.length; i++) {
		const target = targets[i];
		try {
			const result = ensureServerInConfig(target);
			if (result === 'added') {
				added.push(target.label);
			} else if (result === 'updated') {
				updated.push(target.label);
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
	if (updated.length > 0) {
		logger.Info(`[pull] Updated Siteglide MCP launch path for: ${updated.join(', ')}`);
	}
	if (unchanged.length > 0) {
		logger.Debug(`[pull] Siteglide MCP already present for: ${unchanged.join(', ')}`);
	}
	if (errors.length > 0) {
		logger.Warn(`[pull] Skipped MCP registration (invalid existing config) for: ${errors.join(', ')}`, {
			exit: false
		});
	}
	if (added.length === 0 && updated.length === 0 && unchanged.length > 0 && errors.length === 0) {
		logger.Info('[pull] Siteglide MCP already registered for supported IDEs');
	}

	return { added, updated, unchanged, errors };
};

const writeTextFile = (filePath, contents) => {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, contents, 'utf8');
};

/**
 * Write always-on IDE rules so agents prefer Siteglide MCP and never read secrets.
 * Complements mcp.json registration (transport) with behavior guidance.
 *
 * @param {{ rootPath?: string }} [opts]
 */
const ensureMcpIdeRules = (opts = {}) => {
	const rootPath = opts.rootPath || process.cwd();
	const written = [];

	try {
		writeTextFile(
			path.join(rootPath, '.cursor', 'rules', 'setup_siteglide_mcp.mdc'),
			`---\nalwaysApply: true\n---\n${MCP_AGENT_GUIDANCE}`
		);
		written.push('Cursor');

		writeTextFile(
			path.join(rootPath, '.claude', 'siteglide-mcp.md'),
			`# Siteglide MCP\n\n${MCP_AGENT_GUIDANCE}`
		);
		written.push('Claude');

		writeTextFile(
			path.join(rootPath, '.windsurf', 'rules', 'setup_siteglide_mcp.md'),
			`---\ntrigger: always_on\n---\n${MCP_AGENT_GUIDANCE}`
		);
		written.push('Windsurf');

		writeTextFile(
			path.join(rootPath, '.github', 'siteglide-mcp.md'),
			`<!-- Managed by siteglide-cli pull — Siteglide MCP agent guidance -->\n${MCP_AGENT_GUIDANCE}`
		);
		written.push('Copilot');

		logger.Info(`[pull] Wrote Siteglide MCP agent rules for: ${written.join(', ')}`);
	} catch (error) {
		logger.Warn(`[pull] Could not write MCP IDE rules: ${error.message}`, { exit: false });
	}

	return { written };
};

module.exports = {
	SERVER_NAME,
	MCP_AGENT_GUIDANCE,
	buildMcpLaunchEntry,
	resolveMcpScriptPath,
	ensureMcpRegistered,
	ensureMcpIdeRules,
	getRegistryTargets
};
