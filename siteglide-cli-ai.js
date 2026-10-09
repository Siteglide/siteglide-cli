#!/usr/bin/env node
process.noDeprecation = true;

const notifyCliUpdate = require('./lib/notifyCliUpdate');

notifyCliUpdate();

const program = require('commander');
const version = require('./package.json').version;
const logger = require('./lib/logger');
const { promptAndEnsureSourceOfTruthConfig } = require('./lib/sourceOfTruth');
const { promptAiAgentPreferencesIfNeeded, resolveEnabledSkillAgents } = require('./lib/aiAgentPreferences');
const { ensureMcpSetup } = require('./lib/mcpAlpha');

program
	.version(version, '-v, --version')
	.name('siteglide-cli ai')
	.usage('[options]')
	.description(
		'Set up Siteglide MCP in your IDE configs and choose project source-of-truth (.siteglide/project/sourceOfTruth.json). No site environment or pull required — use for version-control-first or module projects instead of siteglide-cli pull.'
	)
	.option('--non-interactive', 'Skip MCP install prompts (still registers IDE MCP when the package is installed)', false)
	.action(async (params) => {
		const rootPath = process.cwd();
		const interactive = !params.nonInteractive;

		const sourceOfTruth = await promptAndEnsureSourceOfTruthConfig(rootPath);
		if (sourceOfTruth.cancelled) {
			logger.Error('[Cancelled] AI setup not executed.');
			process.exit(1);
		}

		const agentPrefs = await promptAiAgentPreferencesIfNeeded(rootPath, {
			context: 'ai',
			logPrefix: '[ai]'
		});
		if (agentPrefs.cancelled) {
			logger.Error('[Cancelled] AI setup not executed — choose at least one AI agent or press Ctrl+C to cancel.');
			process.exit(1);
		}

		const enabledSkillAgents = agentPrefs.enabledSkillAgents
			|| resolveEnabledSkillAgents(agentPrefs.config);

		const result = await ensureMcpSetup({
			rootPath,
			enabledSkillAgents,
			logPrefix: '[ai]',
			interactive
		});

		if (result.skipped) {
			logger.Warn(`[ai] MCP setup skipped (${result.reason || 'unknown'}).`, { exit: false });
			process.exit(result.reason === 'mcp-not-installed' ? 1 : 0);
		}

		logger.Success('[ai] MCP setup finished.');
	});

program.parse(process.argv);
