const fs = require('fs-extra');
const path = require('path');

/** Siteglide skill paths under `./.agents/` that become one flat Claude skill file. */
const SITEGLIDE_SKILL_MD = /^skills\/siteglide\/([^/]+)\/([^/]+)\/SKILL\.md$/;

/** Flat files siteglide-cli pull writes under `.claude/skills/` (safe to prune when stale). */
const MANAGED_FLAT_SKILL_PATTERN = /^siteglide_[^/]+_[^/]+\.SKILL\.md$/;

/**
 * @param {string} agentsRelativePath - Path under `.agents/` (e.g. `skills/siteglide/studio/build-page/SKILL.md`).
 * @returns {string|null} Flat filename for `.claude/skills/`, or null when not a Siteglide skill root.
 */
const claudeFlatSkillFileName = (agentsRelativePath) => {
	const normalized = String(agentsRelativePath).replace(/\\/g, '/');
	const match = normalized.match(SITEGLIDE_SKILL_MD);
	if (!match) {
		return null;
	}
	return `siteglide_${match[1]}_${match[2]}.SKILL.md`;
};

/**
 * Remove a skills discovery path if it is a symlink/junction so a real directory can be used.
 *
 * @param {string} linkPath - e.g. `.claude/skills`
 */
const removeSkillsDirLinkIfPresent = async (linkPath) => {
	const linkAbs = path.resolve(linkPath);
	if (!(await fs.pathExists(linkAbs))) {
		return;
	}
	const linkStat = await fs.lstat(linkAbs);
	if (linkStat.isSymbolicLink()) {
		await fs.remove(linkAbs);
	}
};

const makeWritableSync = (filePath) => {
	if (!fs.existsSync(filePath)) {
		return;
	}
	try {
		fs.chmodSync(filePath, fs.statSync(filePath).mode | 0o200);
	} catch (e) {
		// best effort
	}
};

const makeReadOnlySync = (filePath) => {
	try {
		fs.chmodSync(filePath, fs.statSync(filePath).mode & ~0o222);
	} catch (e) {
		// best effort
	}
};

/**
 * Recursively collect `SKILL.md` paths under `dir`, relative to `baseDir`.
 *
 * @param {string} dir
 * @param {string} baseDir
 * @returns {Promise<string[]>}
 */
const collectSkillMarkdownRelativePaths = async (dir, baseDir) => {
	if (!(await fs.pathExists(dir))) {
		return [];
	}
	const found = [];
	const entries = await fs.readdir(dir);
	for (let i = 0; i < entries.length; i++) {
		const fullPath = path.join(dir, entries[i]);
		const stats = await fs.lstat(fullPath);
		if (stats.isDirectory()) {
			const nested = await collectSkillMarkdownRelativePaths(fullPath, baseDir);
			for (let j = 0; j < nested.length; j++) {
				found.push(nested[j]);
			}
		} else if (stats.isFile() && entries[i] === 'SKILL.md') {
			found.push(path.relative(baseDir, fullPath).split(path.sep).join('/'));
		}
	}
	return found;
};

/**
 * Write Siteglide skills for Claude as flat `.SKILL.md` files (no nested namespace folders).
 *
 * @param {object} [options]
 * @param {string} [options.agentsRoot='.agents']
 * @param {string} [options.claudeSkillsDir='.claude/skills']
 * @param {(message: string) => void} [options.debugLog]
 * @returns {Promise<{ written: string[], removed: string[] }>}
 */
const syncClaudeFlatSkills = async (options = {}) => {
	const agentsRoot = options.agentsRoot || '.agents';
	const claudeSkillsDir = options.claudeSkillsDir || '.claude/skills';
	const debugLog = options.debugLog || (() => {});

	await removeSkillsDirLinkIfPresent(claudeSkillsDir);
	await fs.ensureDir(claudeSkillsDir);

	const agentsAbs = path.resolve(agentsRoot);
	const skillRelPaths = await collectSkillMarkdownRelativePaths(agentsAbs, agentsAbs);

	const desiredFlatNames = new Set();
	const written = [];

	for (let i = 0; i < skillRelPaths.length; i++) {
		const flatName = claudeFlatSkillFileName(skillRelPaths[i]);
		if (!flatName) {
			debugLog(`[pull] Skipping Claude flat skill (unexpected path): ${skillRelPaths[i]}`);
			continue;
		}
		desiredFlatNames.add(flatName);
		const srcPath = path.join(agentsAbs, skillRelPaths[i]);
		const destPath = path.join(claudeSkillsDir, flatName);
		const body = await fs.readFile(srcPath, 'utf8');
		makeWritableSync(destPath);
		await fs.writeFile(destPath, body, 'utf8');
		makeReadOnlySync(destPath);
		written.push(flatName);
		debugLog(`[pull] Claude skill ${flatName} ← ${skillRelPaths[i]}`);
	}

	const removed = [];
	const existing = await fs.readdir(claudeSkillsDir);
	for (let i = 0; i < existing.length; i++) {
		const name = existing[i];
		if (!MANAGED_FLAT_SKILL_PATTERN.test(name)) {
			continue;
		}
		if (desiredFlatNames.has(name)) {
			continue;
		}
		const stalePath = path.join(claudeSkillsDir, name);
		makeWritableSync(stalePath);
		await fs.remove(stalePath);
		removed.push(name);
		debugLog(`[pull] Removed stale Claude skill ${name}`);
	}

	return { written, removed };
};

module.exports = {
	claudeFlatSkillFileName,
	MANAGED_FLAT_SKILL_PATTERN,
	syncClaudeFlatSkills,
	removeSkillsDirLinkIfPresent
};
