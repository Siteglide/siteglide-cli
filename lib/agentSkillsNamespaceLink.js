const fs = require('fs-extra');
const path = require('path');

/** Siteglide-owned namespace under each agent's skills directory and under `.agents/skills/`. */
const SITEGLIDE_SKILLS_NAMESPACE = 'siteglide';

/**
 * Older pulls symlinked the entire agent skills dir to `.agents/skills`, which prevents
 * adding project skills alongside Siteglide's. Replace that with a real skills root.
 *
 * @param {string} agentSkillsDir - e.g. `.cursor/skills`
 * @param {string} agentsSkillsRoot - e.g. `.agents/skills`
 */
const migrateFullSkillsTreeSymlinkIfPresent = async (agentSkillsDir, agentsSkillsRoot) => {
	const linkAbs = path.resolve(agentSkillsDir);
	const legacyTargetAbs = path.resolve(agentsSkillsRoot);
	if (!(await fs.pathExists(linkAbs))) {
		return;
	}
	const linkStat = await fs.lstat(linkAbs);
	if (!linkStat.isSymbolicLink()) {
		return;
	}
	let currentTarget = await fs.readlink(linkAbs);
	if (!path.isAbsolute(currentTarget)) {
		currentTarget = path.resolve(path.dirname(linkAbs), currentTarget);
	}
	if (path.resolve(currentTarget) !== legacyTargetAbs) {
		return;
	}
	await fs.remove(linkAbs);
	await fs.ensureDir(linkAbs);
};

/**
 * Ensure `agentSkillsDir/siteglide` is a symlink/junction to `.agents/skills/siteglide`.
 * The parent `agentSkillsDir` stays a normal directory so developers can add their own skills.
 *
 * @param {object} [options]
 * @param {string} [options.agentSkillsDir] - e.g. `.cursor/skills`
 * @param {string} [options.agentsSkillsRoot='.agents/skills']
 * @param {(message: string) => void} [options.debugLog]
 */
const ensureSiteglideSkillsNamespaceLink = async (options = {}) => {
	const agentSkillsDir = options.agentSkillsDir || '.cursor/skills';
	const agentsSkillsRoot = options.agentsSkillsRoot || '.agents/skills';
	const debugLog = options.debugLog || (() => {});

	const linkPath = path.join(agentSkillsDir, SITEGLIDE_SKILLS_NAMESPACE);
	const targetPath = path.join(agentsSkillsRoot, SITEGLIDE_SKILLS_NAMESPACE);
	const linkAbs = path.resolve(linkPath);
	const targetAbs = path.resolve(targetPath);
	const agentSkillsAbs = path.resolve(agentSkillsDir);

	debugLog(`[pull] Ensuring Siteglide skills link: ${linkPath} → ${targetPath}`);

	await fs.ensureDir(path.dirname(agentSkillsAbs));
	await migrateFullSkillsTreeSymlinkIfPresent(agentSkillsDir, agentsSkillsRoot);
	await fs.ensureDir(agentSkillsAbs);
	await fs.ensureDir(targetAbs);

	if (await fs.pathExists(linkAbs)) {
		const linkStat = await fs.lstat(linkAbs);
		if (linkStat.isSymbolicLink()) {
			let currentTarget = await fs.readlink(linkAbs);
			if (!path.isAbsolute(currentTarget)) {
				currentTarget = path.resolve(path.dirname(linkAbs), currentTarget);
			}
			if (path.resolve(currentTarget) === targetAbs) {
				debugLog(`[pull] Siteglide skills link already correct: ${linkPath}`);
				return;
			}
			debugLog(`[pull] Replacing outdated Siteglide skills link at ${linkPath}`);
			await fs.remove(linkAbs);
		} else {
			debugLog(`[pull] Replacing existing path at ${linkPath} with link to ${targetPath}`);
			await fs.remove(linkAbs);
		}
	}

	const linkType = process.platform === 'win32' ? 'junction' : 'dir';
	const linkTarget = process.platform === 'win32'
		? targetAbs
		: path.relative(path.dirname(linkAbs), targetAbs) || '.';
	await fs.symlink(linkTarget, linkAbs, linkType);
	debugLog(`[pull] Created ${linkType} ${linkPath} → ${targetPath}`);
};

module.exports = {
	SITEGLIDE_SKILLS_NAMESPACE,
	ensureSiteglideSkillsNamespaceLink,
	migrateFullSkillsTreeSymlinkIfPresent
};
