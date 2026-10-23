/**
 * Append gitignore rules for AI agent folders/files that siteglide-cli pull creates locally.
 * Does not rewrite existing ignore lines — only appends entries that are not already effective.
 */

const fs = require('fs');
const path = require('path');
const { run } = require('./readiness');
const { getGitRepoRoot, readSiteglideIgnoreRuleSources } = require('./siteglideGitignore');
const { GITIGNORE_AGENTS_LINE } = require('../siteglidePaths');

const AGENT_IGNORE_COMMENT =
	'# Siteglide CLI AI agent folders (pulled skills and IDE discovery — ignore to avoid pull churn)';

/** Project-root directories pull may scaffold for an enabled skill agent (POSIX paths). */
const SKILL_AGENT_GITIGNORE_DIRS = {
	Cursor: '.cursor/',
	Claude: '.claude/',
	Windsurf: '.windsurf/',
	'Github Copilot': '.github/skills/'
};

/** Project files pull may write for MCP or IDE pointers (POSIX paths). */
const SKILL_AGENT_GITIGNORE_FILES = {
	Claude: ['.mcp.json'],
	VSCode: ['.vscode/mcp.json'],
	'Github Copilot': ['.github/copilot-instructions.md', '.github/siteglide-mcp.md']
};

/**
 * @param {string} entry
 * @returns {string}
 */
function escapeGitignoreEntryForRegex(entry) {
	return entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} content
 * @param {string} entry
 * @returns {boolean}
 */
function gitignoreAlreadyListsEntry(content, entry) {
	/** @type {string[]} */
	const variants = [entry];
	if (entry.endsWith('/')) {
		variants.push(entry.replace(/\/+$/, ''));
	} else if (!entry.includes('*')) {
		variants.push(`${entry}/`);
	}

	for (let i = 0; i < variants.length; i++) {
		const escaped = escapeGitignoreEntryForRegex(variants[i]);
		const pattern = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*(?:#.*)?(?:\\n|$)`);
		if (pattern.test(content)) {
			return true;
		}
	}

	return false;
}

/**
 * @param {string} repoRoot
 * @param {string} entry
 * @returns {string[]}
 */
function ignoreProbePathsForEntry(entry) {
	if (entry.endsWith('/')) {
		const trimmed = entry.replace(/\/+$/, '');
		return [entry, trimmed, `${trimmed}/example`];
	}
	return [entry];
}

/**
 * @param {string} repoRoot
 * @param {string} entry
 * @returns {boolean}
 */
function isAgentEntryIgnoreConfigured(repoRoot, entry) {
	for (const probe of ignoreProbePathsForEntry(entry)) {
		const res = run('git', ['check-ignore', '-q', '--no-index', '--', probe], { cwd: repoRoot });
		if (res.ok) {
			return true;
		}
	}

	for (const content of readSiteglideIgnoreRuleSources(repoRoot)) {
		if (gitignoreAlreadyListsEntry(content, entry)) {
			return true;
		}
	}

	return false;
}

/**
 * @param {{ enabledSkillAgents?: string[], includeAgentsRoot?: boolean }} [opts]
 * @returns {string[]}
 */
function resolveAgentGitignoreEntries(opts = {}) {
	/** @type {string[]} */
	const entries = [];
	const seen = {};

	const push = (entry) => {
		if (!entry || seen[entry]) {
			return;
		}
		seen[entry] = true;
		entries.push(entry);
	};

	if (opts.includeAgentsRoot) {
		push(GITIGNORE_AGENTS_LINE);
	}

	const enabled = Array.isArray(opts.enabledSkillAgents) ? opts.enabledSkillAgents : [];
	for (let i = 0; i < enabled.length; i++) {
		const agentName = enabled[i];
		const dirEntry = SKILL_AGENT_GITIGNORE_DIRS[agentName];
		if (dirEntry) {
			push(dirEntry);
		}
		const fileEntries = SKILL_AGENT_GITIGNORE_FILES[agentName];
		if (fileEntries) {
			for (let f = 0; f < fileEntries.length; f++) {
				push(fileEntries[f]);
			}
		}
	}

	return entries;
}

/**
 * @param {string} [cwd]
 * @param {string[]} entries
 * @returns {{ ok: boolean, path?: string, alreadyPresent?: boolean, added?: string[], error?: string }}
 */
function appendAgentGitignoreEntries(cwd = process.cwd(), entries = []) {
	const root = getGitRepoRoot(cwd);
	if (!root) {
		return { ok: false, error: 'not a git repository' };
	}

	const missing = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (!isAgentEntryIgnoreConfigured(root, entry)) {
			missing.push(entry);
		}
	}

	if (missing.length === 0) {
		return {
			ok: true,
			path: path.join(root, '.gitignore'),
			alreadyPresent: true,
			added: []
		};
	}

	const gitignorePath = path.join(root, '.gitignore');
	let content = '';
	if (fs.existsSync(gitignorePath)) {
		content = fs.readFileSync(gitignorePath, 'utf8');
	}

	if (content.length > 0 && !content.endsWith('\n')) {
		content += '\n';
	}

	const hasComment = content.includes(AGENT_IGNORE_COMMENT);
	if (!hasComment) {
		content += `\n${AGENT_IGNORE_COMMENT}\n`;
	}

	for (let i = 0; i < missing.length; i++) {
		content += `${missing[i]}\n`;
	}

	fs.writeFileSync(gitignorePath, content, 'utf8');
	return { ok: true, path: gitignorePath, added: missing };
}

/**
 * After pull creates or updates agent artifacts, append any missing gitignore entries (no prompt).
 *
 * @param {{ cwd?: string, logger?: object, enabledSkillAgents?: string[], includeAgentsRoot?: boolean }} [opts]
 * @returns {{ ok: boolean, skipped?: string, alreadyPresent?: boolean, path?: string, added?: string[] }}
 */
function ensureAgentPathsGitignored(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const logger = opts.logger || require('../logger');
	const root = getGitRepoRoot(cwd);
	if (!root) {
		return { ok: true, skipped: 'no_repo' };
	}

	const entries = resolveAgentGitignoreEntries({
		enabledSkillAgents: opts.enabledSkillAgents,
		includeAgentsRoot: opts.includeAgentsRoot
	});

	if (entries.length === 0) {
		return { ok: true, skipped: 'nothing_to_ignore' };
	}

	const result = appendAgentGitignoreEntries(cwd, entries);
	if (!result.ok) {
		logger.Warn(`[pull] Could not update .gitignore for AI agent folders: ${result.error || 'unknown error'}`, {
			exit: false
		});
		return result;
	}

	if (result.alreadyPresent) {
		return { ok: true, alreadyPresent: true, path: result.path, added: [] };
	}

	if (result.added && result.added.length > 0) {
		logger.Success(`[pull] Added AI agent path(s) to .gitignore: ${result.added.join(', ')}`);
	}

	return { ok: true, path: result.path, added: result.added };
}

module.exports = {
	AGENT_IGNORE_COMMENT,
	SKILL_AGENT_GITIGNORE_DIRS,
	SKILL_AGENT_GITIGNORE_FILES,
	gitignoreAlreadyListsEntry,
	isAgentEntryIgnoreConfigured,
	resolveAgentGitignoreEntries,
	appendAgentGitignoreEntries,
	ensureAgentPathsGitignored
};
