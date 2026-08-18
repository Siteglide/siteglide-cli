const fs = require('fs-extra');
const path = require('path');

/** Relative paths under a project root written by MCP registration / IDE rules. */
const MCP_IDE_ARTIFACT_RELATIVE_PATHS = [
	path.join('.cursor', 'mcp.json'),
	path.join('.cursor', 'rules', 'setup_siteglide_mcp.mdc'),
	'.mcp.json',
	path.join('.vscode', 'mcp.json'),
	path.join('.claude', 'siteglide-mcp.md'),
	path.join('.windsurf', 'rules', 'setup_siteglide_mcp.md'),
	path.join('.github', 'siteglide-mcp.md')
];

/**
 * @param {string} rootPath
 * @returns {string[]}
 */
const mcpIdeArtifactPaths = (rootPath) => MCP_IDE_ARTIFACT_RELATIVE_PATHS.map((relPath) => {
	return path.join(rootPath, relPath);
});

/**
 * Remove MCP IDE config/rules files from a project root (e.g. after tests).
 *
 * @param {string} rootPath
 */
const removeMcpIdeArtifacts = async (rootPath) => {
	for (let i = 0; i < MCP_IDE_ARTIFACT_RELATIVE_PATHS.length; i++) {
		await fs.remove(path.join(rootPath, MCP_IDE_ARTIFACT_RELATIVE_PATHS[i]));
	}
};

module.exports = {
	MCP_IDE_ARTIFACT_RELATIVE_PATHS,
	mcpIdeArtifactPaths,
	removeMcpIdeArtifacts
};
