#!/usr/bin/env node

const program = require('commander'),
	ora = require('ora'),
	fs = require('fs-extra'),
	logger = require('./lib/logger'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	version = require('./package.json').version,
	downloadFile = require('./lib/downloadFile'),
	waitForStatus = require('./lib/data/waitForStatus'),
	Gateway = require('./lib/proxy'),
	{ selectChoice, inputText, confirmYesNo } = require('./lib/prompts'),
	getBinary = require('./lib/assets/getBinary'),
	unzip = require('./lib/unzip'),
	path = require('path'),
	dir = require('./lib/directories'),
	{ ensureMcpOnPull } = require('./lib/mcpAlpha'),
	{
		resolveSiteAppRoot
	} = require('./lib/migrateAppDirectory'),
	{
		DEFAULT_PULL_IGNORED_MODULES,
		PULL_MODULES_CONFIG_RELATIVE_PATH,
		isPullIgnoredModule,
		preparePullModulesConfig,
		partitionPullIgnoredModules,
		resolvePullIgnoredModules,
		selectModulesToPull,
		formatModuleNameForLog,
		formatModuleListForLog
	} = require('./lib/pullIgnoredModules'),
	{ writePullBaseline } = require('./lib/pullBaseline'),
	{ ensureProjectPreferences } = require('./lib/projectPreferences'),
	{ clearConflictLog } = require('./lib/remoteCheckConflictLog'),
	{ getGitReadiness, logGitSetupHint, run: runGit } = require('./lib/git/readiness'),
	{ ensureSiteglideGitignored } = require('./lib/git/siteglideGitignore'),
	{ isWorkingTreeDirty } = require('./lib/git/workingTree'),
	{ commitAllSafe, hasStagedOrUnstagedChanges } = require('./lib/git/commit'),
	{ hasOpenGitConflicts } = require('./lib/git/conflictMarkers'),
	{ mergeFirstPull } = require('./lib/git/mergeFirst'),
	{ offerMergeConflictAiHelp, offerMergeFirstFailureHelp } = require('./lib/aiPrompts'),
	{ claimCommandLock, registerCommandLockCleanup, logCommandLockRefusal } = require('./lib/commandLock'),
	{ spawnNestedPull } = require('./lib/pull/spawnNestedPull');

const pullSpinner = ora({ text: 'Pulling files', stream: process.stdout });

/** Project-root folder that receives merged agent files from modules. */
const AGENTS_ROOT = '.agents';

/** Default max concurrent module backup/download/extract jobs. */
const DEFAULT_MODULE_PULL_CONCURRENCY = 5;

/**
 * Copy each child of `srcDir` into `destDir` (merge/overwrite).
 * Used instead of copying a folder into its parent, which fs-extra cannot do safely.
 *
 * @param {string} srcDir - Source directory whose children should be copied.
 * @param {string} destDir - Destination directory to receive those children.
 * Side effects: writes/overwrites files and folders under destDir.
 */
const copyChildren = async (srcDir, destDir) => {
	await fs.ensureDir(destDir);
	const children = await fs.readdir(srcDir);
	for (let i = 0; i < children.length; i++) {
		const name = children[i];
		await fs.copy(path.join(srcDir, name), path.join(destDir, name), { overwrite: true });
	}
};

/**
 * Clear the read-only / write-protect bit on a file so it can be overwritten on the next pull.
 * No-op for missing paths and directories. Failures are logged at Debug and ignored.
 *
 * @param {string} filePath - Absolute or relative path to a file.
 * Side effects: may chmod the file to add owner-write.
 */
const makeWritable = async (filePath) => {
	try {
		if (!(await fs.pathExists(filePath))) {
			return;
		}
		const stats = await fs.stat(filePath);
		if (stats.isDirectory()) {
			return;
		}
		await fs.chmod(filePath, stats.mode | 0o200);
	} catch (e) {
		logger.Debug(`[pull] Could not clear read-only on ${filePath}: ${e.message}`);
	}
};

/**
 * Mark a file read-only after merge (cross-platform hint that it came from a module).
 * Directories are left writable so later pulls can add/replace children.
 * Failures are logged at Debug and ignored.
 *
 * @param {string} filePath - Absolute or relative path to a file.
 * Side effects: may chmod the file to remove write bits.
 */
const makeReadOnly = async (filePath) => {
	try {
		const stats = await fs.stat(filePath);
		if (stats.isDirectory()) {
			return;
		}
		await fs.chmod(filePath, stats.mode & ~0o222);
	} catch (e) {
		logger.Debug(`[pull] Could not set read-only on ${filePath}: ${e.message}`);
	}
};

/**
 * Recursively merge `srcDir` into `destDir`. Existing destination files are made writable,
 * overwritten, then marked read-only again so the next pull can still replace them.
 *
 * @param {string} srcDir - Source `.agents` tree under a module.
 * @param {string} destDir - Destination project-root `.agents` directory.
 * @param {string} moduleName - Module name (for log messages).
 * @returns {Promise<number>} Number of files written.
 * Side effects: creates dirs; writes/overwrites files under destDir; may chmod files.
 */
const copyAgentsTree = async (srcDir, destDir, moduleName) => {
	await fs.ensureDir(destDir);
	const entries = await fs.readdir(srcDir);
	let fileCount = 0;
	for (let i = 0; i < entries.length; i++) {
		const name = entries[i];
		const srcPath = path.join(srcDir, name);
		const destPath = path.join(destDir, name);
		const stats = await fs.stat(srcPath);
		if (stats.isDirectory()) {
			logger.Debug(`[pull] .agents: merging directory "${name}/" from module "${formatModuleNameForLog(moduleName)}"`);
			fileCount += await copyAgentsTree(srcPath, destPath, moduleName);
		} else {
			await makeWritable(destPath);
			await fs.copy(srcPath, destPath, { overwrite: true });
			await makeReadOnly(destPath);
			const displayPath = destPath.replace(/\\/g, '/').replace(/^\.\//, '');
			logger.Debug(`[pull] .agents: wrote ./${displayPath} (from module "${formatModuleNameForLog(moduleName)}")`);
			fileCount++;
		}
	}
	return fileCount;
};

/**
 * For each pulled module, if `modules/<name>/public/assets/.agents/` exists, merge its
 * contents into the project-root `./.agents/` directory (overwrite on conflict).
 * When at least one `SKILL.md` is present under `./.agents`, also scaffolds IDE discovery
 * folders (Cursor, Claude, Windsurf, Copilot) pointing at the shared skills tree.
 *
 * @param {string[]} moduleNames - Module machine names that were pulled this run.
 * @returns {Promise<{modulesWithAgents: number, totalFiles: number, skillCount: number}>}
 * Side effects: may create `./.agents` and write/overwrite files under it; may create IDE
 * root folders/symlinks; updates pullSpinner text.
 */
const mergeModuleAgentsToRoot = async (moduleNames) => {
	logger.Info('[pull] Looking for AI agent skills relevant to your current modules');
	pullSpinner.text = `Merging ${AGENTS_ROOT} files`;

	const result = { modulesWithAgents: 0, totalFiles: 0, skillCount: 0 };

	if (!moduleNames || moduleNames.length === 0) {
		logger.Info('[pull] No skills found — skipping IDE folders');
		return result;
	}

	for (let i = 0; i < moduleNames.length; i++) {
		const moduleName = moduleNames[i];
		const agentsSrc = path.join('.', dir.MODULES, moduleName, 'public', 'assets', AGENTS_ROOT);
		const agentsSrcDisplay = agentsSrc.replace(/\\/g, '/');
		logger.Debug(`[pull] Checking for ${agentsSrcDisplay}`);

		if (!(await fs.pathExists(agentsSrc))) {
			logger.Debug(`[pull] Module "${formatModuleNameForLog(moduleName)}" — no ${AGENTS_ROOT} directory found`);
			continue;
		}

		const srcStat = await fs.stat(agentsSrc);
		if (!srcStat.isDirectory()) {
			logger.Debug(`[pull] Module "${formatModuleNameForLog(moduleName)}" — ${AGENTS_ROOT} exists but is not a directory; skip`);
			continue;
		}

		logger.Info(`[pull] Module "${formatModuleNameForLog(moduleName)}" — found ${AGENTS_ROOT}; merging into ./${AGENTS_ROOT}`);
		const count = await copyAgentsTree(agentsSrc, `./${AGENTS_ROOT}`, moduleName);
		result.modulesWithAgents++;
		result.totalFiles += count;
		if (count > 0) {
			logger.Info(`[pull] Module "${formatModuleNameForLog(moduleName)}" — merged ${count} file(s) into ./${AGENTS_ROOT}`);
		}
	}

	result.skillCount = await countSkillMarkdownFiles(`./${AGENTS_ROOT}`);

	if (result.totalFiles > 0) {
		logger.Info(
			`[pull] .agents: merged ${result.totalFiles} file(s) from ${result.modulesWithAgents} module(s) (${result.skillCount} skills)`
		);
	}

	if (result.skillCount > 0) {
		await ensureAgentIdeScaffolding();
	} else {
		logger.Info('[pull] No skills found — skipping IDE folders');
	}

	return result;
};

/**
 * Recursively count `SKILL.md` files under a directory (follows real dirs, not via symlink walk of link targets beyond lstat dirs).
 *
 * @param {string} rootDir - Directory to scan.
 * @returns {Promise<number>} Number of SKILL.md files found.
 * Side effects: none.
 */
const countSkillMarkdownFiles = async (rootDir) => {
	if (!(await fs.pathExists(rootDir))) {
		return 0;
	}
	let count = 0;
	const walk = async (current) => {
		const entries = await fs.readdir(current);
		for (let i = 0; i < entries.length; i++) {
			const fullPath = path.join(current, entries[i]);
			const stats = await fs.lstat(fullPath);
			if (stats.isDirectory()) {
				await walk(fullPath);
			} else if (stats.isFile() && entries[i] === 'SKILL.md') {
				count++;
			}
		}
	};
	await walk(rootDir);
	return count;
};

/**
 * Ensure `linkPath` is a directory symlink/junction pointing at `targetPath`
 * (source of truth under `.agents/skills`). Cross-platform: junction on Windows, dir symlink elsewhere.
 *
 * @param {string} linkPath - Relative path for the discovery folder (e.g. `.cursor/skills`).
 * @param {string} targetPath - Relative path to the shared skills tree (e.g. `.agents/skills`).
 * Side effects: may remove an existing link/dir at linkPath; creates parent dirs; creates symlink/junction.
 */
const ensureSkillsDirLink = async (linkPath, targetPath) => {
	const linkAbs = path.resolve(linkPath);
	const targetAbs = path.resolve(targetPath);

	logger.Debug(`[pull] Ensuring skills link: ${linkPath} → ${targetPath}`);
	await fs.ensureDir(path.dirname(linkAbs));
	await fs.ensureDir(targetAbs);

	if (await fs.pathExists(linkAbs)) {
		const linkStat = await fs.lstat(linkAbs);
		if (linkStat.isSymbolicLink()) {
			let currentTarget = await fs.readlink(linkAbs);
			if (!path.isAbsolute(currentTarget)) {
				currentTarget = path.resolve(path.dirname(linkAbs), currentTarget);
			}
			if (path.resolve(currentTarget) === targetAbs) {
				logger.Debug(`[pull] Skills link already correct: ${linkPath}`);
				return;
			}
			logger.Debug(`[pull] Replacing outdated skills link at ${linkPath}`);
			await fs.remove(linkAbs);
		} else {
			logger.Debug(`[pull] Replacing existing path at ${linkPath} with link to shared ${targetPath}`);
			await fs.remove(linkAbs);
		}
	}

	const linkType = process.platform === 'win32' ? 'junction' : 'dir';
	const linkTarget = process.platform === 'win32'
		? targetAbs
		: path.relative(path.dirname(linkAbs), targetAbs) || '.';
	await fs.symlink(linkTarget, linkAbs, linkType);
	logger.Debug(`[pull] Created ${linkType} ${linkPath} → ${targetPath}`);
};

/**
 * Write a managed text file (overwrite). Used for IDE pointer rules that tell agents
 * how to find `./.agents` when native discovery is missing.
 *
 * @param {string} filePath - Relative path to write.
 * @param {string} contents - File body.
 * Side effects: creates parent dirs; writes/overwrites the file; may chmod read-only after write.
 */
const writeManagedAgentFile = async (filePath, contents) => {
	await fs.ensureDir(path.dirname(filePath));
	await makeWritable(filePath);
	await fs.writeFile(filePath, contents, 'utf8');
	await makeReadOnly(filePath);
	logger.Debug(`[pull] Wrote ${filePath.replace(/\\/g, '/')}`);
};

/** Cursor always-on rule — mirrors Siteglide/Siteglide-AI-Skills `.cursor/rules/setup_siteglide_skills.mdc`. */
const CURSOR_SETUP_RULE = `---
alwaysApply: true
---
Check if you have access to Siteglide skills automatically. If not, immediately check the ./.agents directory for skills on startup and add matching skills in your .cursor/skills directory using symlinks.
Also follow ./.cursor/rules/setup_siteglide_mcp.mdc for Siteglide MCP (never read .siteglide-config; use envs_list).
`;

/** Claude project instructions — mirrors Siteglide/Siteglide-AI-Skills `.claude/CLAUDE.md`. */
const CLAUDE_SETUP_MD = `# Setup Siteglide Skills

Check if you have access to Siteglide skills automatically. If not, immediately check the ./.agents/skills/siteglide/ directory for skills on startup and use a single bash command to copy that to your ./.claude/skills/ directory. Then reload your plugins if needed (to import those new skills).

## Siteglide MCP

See ./.claude/siteglide-mcp.md. Prefer Siteglide MCP tools. NEVER read .siteglide-config — use envs_list for environment names.
`;

/** Windsurf always-on rule pointing at the shared `.agents` tree. */
const WINDSURF_SETUP_RULE = `---
trigger: always_on
---
Check if you have access to Siteglide skills automatically. If not, immediately check the ./.agents directory for skills on startup and add matching skills in your .windsurf/skills directory using symlinks (or rely on ./.windsurf/skills if it already links to ./.agents/skills).
Also follow ./.windsurf/rules/setup_siteglide_mcp.md for Siteglide MCP (never read .siteglide-config; use envs_list).
`;

/** Copilot custom instructions pointing at the shared `.agents` tree. */
const COPILOT_INSTRUCTIONS_MD = `<!-- Managed by siteglide-cli pull — source of truth is ./.agents/skills -->
If agent skills are not already available, use the skills under ./.agents/skills/ (also linked from ./.github/skills/). Prefer those over inventing Siteglide/platformOS workflows from memory.
Also see ./.github/siteglide-mcp.md: prefer Siteglide MCP tools; NEVER read .siteglide-config — use envs_list for environment names.
`;

/**
 * When skills exist under `./.agents`, create IDE root folders so Cursor, Claude, Windsurf,
 * and GitHub Copilot can discover them. Skills stay in `./.agents/skills` (source of truth);
 * platform folders get a symlink/junction to that tree plus a small pointer rule/instructions
 * file matching https://github.com/Siteglide/Siteglide-AI-Skills
 *
 * Side effects: creates `.cursor`, `.claude`, `.windsurf`, `.github` paths; writes managed
 * pointer files; creates/replaces skills directory links; updates pullSpinner text.
 */
const ensureAgentIdeScaffolding = async () => {
	pullSpinner.text = 'Setting up IDE skill folders';

	const skillsTarget = path.join(AGENTS_ROOT, 'skills');
	await fs.ensureDir(`./${skillsTarget}`);

	// Cursor — rule (as in Siteglide-AI-Skills) + skills link for native .cursor/skills discovery
	await writeManagedAgentFile(
		path.join('.cursor', 'rules', 'setup_siteglide_skills.mdc'),
		CURSOR_SETUP_RULE
	);
	await ensureSkillsDirLink(path.join('.cursor', 'skills'), skillsTarget);

	// Claude — CLAUDE.md pointer + skills link (Claude discovers .claude/skills)
	await writeManagedAgentFile(path.join('.claude', 'CLAUDE.md'), CLAUDE_SETUP_MD);
	await ensureSkillsDirLink(path.join('.claude', 'skills'), skillsTarget);

	// Windsurf — rule + skills link (Cascade discovers .windsurf/skills; also reads .agents/skills)
	await writeManagedAgentFile(
		path.join('.windsurf', 'rules', 'setup_siteglide_skills.md'),
		WINDSURF_SETUP_RULE
	);
	await ensureSkillsDirLink(path.join('.windsurf', 'skills'), skillsTarget);

	// Copilot — instructions under .github + skills link (.github/skills is Copilot's project path)
	await writeManagedAgentFile(
		path.join('.github', 'copilot-instructions.md'),
		COPILOT_INSTRUCTIONS_MD
	);
	await ensureSkillsDirLink(path.join('.github', 'skills'), skillsTarget);

	logger.Info('[pull] IDE folders ready (.cursor, .claude, .windsurf, .github → .agents/skills)');
};

/**
 * Remove empty directories left under a pull root after restructuring.
 *
 * @param {string} root - Relative directory to scan (e.g. marketplace_builder).
 * Side effects: deletes empty child directories under `./${root}`; logs non-ENOTEMPTY errors.
 */
const cleanupEmptyDirs = async (root) => {
	const rootPath = `./${root}`;
	if (!(await fs.pathExists(rootPath))) {
		return;
	}
	const entries = await fs.readdir(rootPath);
	for (let i = 0; i < entries.length; i++) {
		const folder = path.join(rootPath, entries[i]);
		const stat = await fs.stat(folder);
		if (!stat.isDirectory()) {
			continue;
		}
		try {
			await fs.rmdir(folder);
		} catch (e) {
			if (e.code !== 'ENOTEMPTY') {
				logger.Error(e);
			}
		}
	}
};

/**
 * If a pull extract contains a nested `modules/` folder, merge it into `./modules`
 * (project root), then delete the nested copy. Siteglide expects modules at `./modules`,
 * not under `marketplace_builder/modules`.
 *
 * @param {string} fromRoot - Relative directory that may contain `modules/` (e.g. marketplace_builder or .tmp/...).
 * Side effects: creates `./modules` if needed; copies module files into it (overwrites); deletes `${fromRoot}/modules`.
 * No-op if `${fromRoot}/modules` does not exist.
 */
const moveModulesToRoot = async (fromRoot, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	const modulesPath = `./${fromRoot}/modules`;
	if (!(await fs.pathExists(modulesPath))) {
		return;
	}
	logger.Debug(`[pull] Moving ./${fromRoot}/modules → ./${dir.MODULES}`);
	await fs.ensureDir(`./${dir.MODULES}`);
	const entries = await fs.readdir(modulesPath);
	for (let i = 0; i < entries.length; i++) {
		const moduleName = entries[i];
		const srcPath = path.join(modulesPath, moduleName);
		const stats = await fs.stat(srcPath);
		if (!stats.isDirectory()) {
			continue;
		}
		if (isPullIgnoredModule(moduleName, ignoredModules)) {
			logger.Debug(`[pull] Skipping default-ignored module "${formatModuleNameForLog(moduleName)}" from ./${fromRoot}/modules`);
			continue;
		}
		await fs.copy(srcPath, path.join(`./${dir.MODULES}`, moduleName), { overwrite: true });
	}
	await fs.remove(modulesPath);
};

/**
 * Start a site or module backup job on the remote instance.
 * @param {Gateway} gateway
 * @param {{ module_name?: string }} [formData]
 * @returns {Promise<{ id: string }>}
 */
const requestBackup = async (gateway, formData = {}) => {
	const pullTask = await gateway.pullZip(formData);
	const label = formData.module_name
		? `Module "${formatModuleNameForLog(formData.module_name)}"`
		: 'Site';
	logger.Debug(`[pull] ${label} backup started (id: ${pullTask.id})`);
	return pullTask;
};

/**
 * Poll until backup zip is ready to download.
 * @param {Gateway} gateway
 * @param {string} backupId
 * @returns {Promise<object>}
 */
const waitForBackupReady = async (gateway, backupId) => {
	return waitForStatus(() => gateway.pullZipStatus(backupId));
};

/**
 * @param {object} readyTask
 * @param {string} filename
 */
const downloadBackupZip = async (readyTask, filename) => {
	await downloadFile(readyTask.zip_file.url, filename);
};

/**
 * Write a downloaded site zip to the local site root.
 * @param {string} filename
 * @param {string} siteRoot
 * @param {string[]} [ignoredModules]
 */
const extractSiteZip = async (filename, siteRoot, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	await unzip(filename, siteRoot);
	await copyChildren(`./${siteRoot}/app`, `./${siteRoot}`);
	await fs.remove(`./${filename}`);
	await moveModulesToRoot(siteRoot, ignoredModules);
	if (await fs.pathExists(`./${siteRoot}/asset_manifest.json`)) {
		await fs.remove(`./${siteRoot}/asset_manifest.json`);
	}
	await fs.remove(`./${siteRoot}/app`);
	await cleanupEmptyDirs(siteRoot);
};

/**
 * Write a downloaded module zip into `./modules/<moduleName>/`.
 * @param {string} filename
 * @param {string} moduleName
 * @param {string[]} [ignoredModules]
 */
const extractModuleZip = async (filename, moduleName, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	const workDir = path.join(dir.TMP, `pull-${moduleName}`);
	await fs.remove(workDir);
	await unzip(filename, workDir);
	await fs.remove(`./${filename}`);

	if (await fs.pathExists(`./${workDir}/app`)) {
		await copyChildren(`./${workDir}/app`, `./${workDir}`);
		await fs.remove(`./${workDir}/app`);
	}

	await moveModulesToRoot(workDir, ignoredModules);

	const directModulePath = `./${workDir}/${moduleName}`;
	if (await fs.pathExists(directModulePath)) {
		logger.Debug(`[pull] Module "${formatModuleNameForLog(moduleName)}" zip used direct layout; copying into ./${dir.MODULES}/${moduleName}`);
		await fs.ensureDir(`./${dir.MODULES}/${moduleName}`);
		await fs.copy(directModulePath, `./${dir.MODULES}/${moduleName}`, { overwrite: true });
	}

	if (await fs.pathExists(`./${workDir}`)) {
		await fs.remove(`./${workDir}`);
	}
};

/**
 * Request backup, poll, and download a module zip without writing to `./modules/`.
 * @param {Gateway} gateway
 * @param {string} moduleName
 * @returns {Promise<{ moduleName: string, filename: string }>}
 */
const prefetchModuleBackup = async (gateway, moduleName) => {
	const filename = `${dir.MODULES}-${moduleName}.zip`;
	const pullTask = await requestBackup(gateway, { module_name: moduleName });
	const readyTask = await waitForBackupReady(gateway, pullTask.id);
	logger.Debug(`[pull] Module "${moduleName}" backup ready (status: ${readyTask.status}) — downloading zip`);
	await downloadBackupZip(readyTask, filename);
	return { moduleName, filename };
};

/**
 * Full site pull: backup through local site root extract.
 * @param {Gateway} gateway
 * @param {string} [siteRoot]
 */
const pullSiteZip = async (gateway, siteRoot = dir.SITE_ROOT, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	logger.Info(`[pull] Step: downloading main site zip → ${siteRoot}/`);
	const filename = `${siteRoot}.zip`;
	pullSpinner.text = 'Pulling site files';
	const pullTask = await requestBackup(gateway);
	const readyTask = await waitForBackupReady(gateway, pullTask.id);
	logger.Debug(`[pull] Site backup ready (status: ${readyTask.status}) — downloading zip`);
	await downloadBackupZip(readyTask, filename);
	await extractSiteZip(filename, siteRoot, ignoredModules);
	logger.Success('[pull] Site files pulled');
};

/**
 * Full module pull: backup through local `./modules/<name>/` extract.
 * @param {Gateway} gateway
 * @param {string} moduleName
 * @param {string[]} [ignoredModules]
 */
const pullModuleZip = async (gateway, moduleName, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	logger.Info(`[pull] Starting module ${formatModuleNameForLog(moduleName)}`);
	const prefetched = await prefetchModuleBackup(gateway, moduleName);
	await extractModuleZip(prefetched.filename, moduleName, ignoredModules);
};

/**
 * Run `iterator` over `items` with at most `limit` promises in flight.
 * Preserves result order. Fails fast if any iterator rejects.
 *
 * @template T, R
 * @param {T[]} items - Items to process.
 * @param {number} limit - Max concurrent iterators.
 * @param {(item: T, index: number) => Promise<R>} iterator - Async worker.
 * @returns {Promise<R[]>} Results in the same order as `items`.
 * Side effects: whatever `iterator` does.
 */
const mapLimit = async (items, limit, iterator) => {
	const results = new Array(items.length);
	let nextIndex = 0;
	const workerCount = Math.min(Math.max(1, limit), items.length);

	const workers = [];
	for (let w = 0; w < workerCount; w++) {
		workers.push((async () => {
			while (true) {
				const i = nextIndex;
				nextIndex += 1;
				if (i >= items.length) {
					return;
				}
				results[i] = await iterator(items[i], i);
			}
		})());
	}

	await Promise.all(workers);
	return results;
};

/**
 * Pull every selected module with capped concurrency (unique zip/work paths per module).
 *
 * @param {Gateway} gateway - Authenticated API client.
 * @param {string[]} modulesToPull - Module machine names to pull.
 * @param {number} concurrency - Max concurrent module pulls.
 * Side effects: same as `pullModuleZip` for each module; updates pullSpinner text.
 */
const pullModulesInParallel = async (gateway, modulesToPull, concurrency, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	const total = modulesToPull.length;
	if (total === 0) {
		return;
	}

	const limit = Math.max(1, concurrency);
	logger.Info(`[pull] Pulling ${total} module(s) (up to ${limit} at a time)`);
	pullSpinner.text = `Pulling modules (up to ${limit} at a time)`;

	let completed = 0;
	await mapLimit(modulesToPull, limit, async (moduleName) => {
		await pullModuleZip(gateway, moduleName, ignoredModules);
		completed += 1;
		logger.Success(`[pull] Module "${formatModuleNameForLog(moduleName)}" done (${completed}/${total})`);
		pullSpinner.text = `Pulling modules (${completed}/${total} done, up to ${limit} at a time)`;
	});

	logger.Success(`[pull] Pulled ${total} module(s)`);
};

/**
 * Overlap site backup with the first concurrency-sized module batch; gate module disk
 * writes until the site zip is fully extracted (avoids `./modules/` races).
 *
 * @param {Gateway} gateway
 * @param {string} siteRoot
 * @param {string[]} modulesToPull
 * @param {number} concurrency
 */
const pullSiteAndModules = async (gateway, siteRoot, modulesToPull, concurrency, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	const limit = Math.max(1, concurrency);
	const firstBatch = modulesToPull.slice(0, limit);
	const restModules = modulesToPull.slice(limit);
	const siteFilename = `${siteRoot}.zip`;

	if (firstBatch.length === 0) {
		await pullSiteZip(gateway, siteRoot, ignoredModules);
		return;
	}

	logger.Info(
		`[pull] Step: site zip → ${siteRoot}/ (prefetching ${firstBatch.length} module backup(s) in parallel)`
	);
	pullSpinner.text = 'Prefetching site and module backups';

	const siteTaskPromise = requestBackup(gateway);
	const moduleTaskPromises = firstBatch.map((moduleName) =>
		requestBackup(gateway, { module_name: moduleName })
	);
	const [sitePullTask, ...modulePullTasks] = await Promise.all([
		siteTaskPromise,
		...moduleTaskPromises
	]);

	pullSpinner.text = 'Downloading site and module backups';
	const siteDownloadPromise = waitForBackupReady(gateway, sitePullTask.id).then(async (readyTask) => {
		logger.Debug(`[pull] Site backup ready (status: ${readyTask.status}) — downloading zip`);
		await downloadBackupZip(readyTask, siteFilename);
		return siteFilename;
	});
	const moduleDownloadPromises = modulePullTasks.map((pullTask, index) => {
		const moduleName = firstBatch[index];
		const filename = `${dir.MODULES}-${moduleName}.zip`;
		return waitForBackupReady(gateway, pullTask.id).then(async (readyTask) => {
			logger.Debug(`[pull] Module "${moduleName}" backup ready (status: ${readyTask.status}) — downloading zip`);
			await downloadBackupZip(readyTask, filename);
			return { moduleName, filename };
		});
	});

	const [downloadedSiteZip, ...prefetchedModules] = await Promise.all([
		siteDownloadPromise,
		...moduleDownloadPromises
	]);

	pullSpinner.text = 'Writing site files';
	await extractSiteZip(downloadedSiteZip, siteRoot, ignoredModules);
	logger.Success('[pull] Site files pulled');

	if (prefetchedModules.length > 0) {
		let written = 0;
		const prefetchTotal = prefetchedModules.length;
		pullSpinner.text = `Writing prefetched modules (0/${prefetchTotal})`;
		for (let i = 0; i < prefetchedModules.length; i++) {
			const { moduleName, filename } = prefetchedModules[i];
			logger.Info(`[pull] Writing module ${formatModuleNameForLog(moduleName)}`);
			await extractModuleZip(filename, moduleName, ignoredModules);
			written += 1;
			logger.Success(`[pull] Module "${formatModuleNameForLog(moduleName)}" done (${written}/${prefetchTotal})`);
			pullSpinner.text = `Writing prefetched modules (${written}/${prefetchTotal})`;
		}
	}

	if (restModules.length > 0) {
		await pullModulesInParallel(gateway, restModules, limit, ignoredModules);
	} else if (modulesToPull.length > 0) {
		logger.Success(`[pull] Pulled ${modulesToPull.length} module(s)`);
	}
};

/**
 * Fetch the asset file list from Siteglide-API `/cli/pull` and download matching text/binary assets
 * by physical_file_path. Paths under `modules/` are written to `./modules/...`; everything else
 * goes under the site root (`marketplace_builder/` or existing `app/`) so this step does not recreate nested modules.
 *
 * @param {Gateway} gateway - Authenticated API client for the current environment.
 * @param {string} [siteRoot] - Relative site folder for non-module assets.
 * Side effects: creates dirs and writes/overwrites asset files under the site root or `./modules`;
 * updates `pullSpinner` text; downloads each asset from its remote_url.
 */
const pullAssets = async (gateway, siteRoot = dir.SITE_ROOT, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	pullSpinner.text = 'Pulling assets';
	const response = await gateway.pull();
	const asset_files = [];
	const assets = response.asset || [];
	logger.Debug(`[pull] Asset list returned ${assets.length} file(s); filtering by extension`);
	const time = '?updated=' + new Date().getTime();
	await Promise.all(assets.map(async function (file) {
		const urlToTest = file.data.remote_url.toLowerCase();
		return new Promise(async function (resolve) {
			if (
				(urlToTest.indexOf('.css') > -1) ||
				(urlToTest.indexOf('.js') > -1) ||
				(urlToTest.indexOf('.scss') > -1) ||
				(urlToTest.indexOf('.sass') > -1) ||
				(urlToTest.indexOf('.less') > -1) ||
				(urlToTest.indexOf('.txt') > -1) ||
				(urlToTest.indexOf('.html') > -1) ||
				(urlToTest.indexOf('.svg') > -1) ||
				(urlToTest.indexOf('.map') > -1) ||
				(urlToTest.indexOf('.json') > -1) ||
				(urlToTest.indexOf('.md') > -1) ||
				(urlToTest.indexOf('.htm') > -1)
			) {
				await getBinary(file.data.remote_url, time).then(body => {
					if (body !== 'error_missing_file') {
						file.data.body = body;
						asset_files.push(file);
					}
					resolve();
				});
			} else {
				resolve();
			}
		});
	}));
	let moduleAssetCount = 0;
	let wroteCount = 0;
	let skippedEmptyPath = 0;
	asset_files.forEach(file => {
		const physicalPath = file.data.physical_file_path.replace(/\\/g, '/');
		if (physicalPath.indexOf('//') > -1) {
			skippedEmptyPath++;
			logger.Info(`[pull] Skipping asset with empty folder in path: ${physicalPath}`);
			return;
		}
		const isModuleAsset = physicalPath === dir.MODULES || physicalPath.indexOf(dir.MODULES + '/') === 0;
		const root = isModuleAsset ? dir.MODULES : siteRoot;
		const relativePath = isModuleAsset
			? physicalPath.slice(dir.MODULES.length).replace(/^\//, '')
			: physicalPath;
		if (!relativePath) {
			return;
		}
		if (isModuleAsset) {
			const moduleName = relativePath.split('/')[0];
			if (isPullIgnoredModule(moduleName, ignoredModules)) {
				logger.Debug(`[pull] Skipping asset for default-ignored module "${formatModuleNameForLog(moduleName)}": ${physicalPath}`);
				return;
			}
			moduleAssetCount++;
		}
		const fullPath = path.join(root, relativePath);
		fs.mkdirSync(path.dirname(fullPath), { recursive: true });
		fs.writeFileSync(fullPath, file.data.body, logger.Error);
		wroteCount++;
	});
	if (skippedEmptyPath > 0) {
		logger.Info(`[pull] Assets: skipped ${skippedEmptyPath} file(s) with empty folder in path`);
	}
	logger.Success(`[pull] Assets: wrote ${wroteCount} file(s) (${moduleAssetCount} under modules)`);
};

/**
 * Final local cleanup after site/module/asset pulls have finished.
 *
 * Side effects: removes leftover pull zips (`app.zip`, `marketplace_builder.zip`, `modules-*.zip`),
 * removes `./.tmp` if present, moves any leftover `app/modules` into `./modules`
 * then deletes that nested folder, removes empty dirs under `app`;
 * updates `pullSpinner` text and writes tidying-up logs.
 */
const tidyUpAfterPull = async (ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	logger.Info('[pull] Step: tidying up local files');
	pullSpinner.text = 'Tidying up...';

	const siteZips = [`./${dir.SITE_ROOT}.zip`, `./${dir.APP}.zip`];
	for (let i = 0; i < siteZips.length; i++) {
		const siteZip = siteZips[i];
		if (await fs.pathExists(siteZip)) {
			await fs.remove(siteZip);
			logger.Debug(`[pull] Removed leftover ${siteZip}`);
		}
	}

	const cwdEntries = await fs.readdir('.');
	for (let i = 0; i < cwdEntries.length; i++) {
		const name = cwdEntries[i];
		if (name.indexOf(`${dir.MODULES}-`) === 0 && name.slice(-4) === '.zip') {
			await fs.remove(`./${name}`);
			logger.Debug(`[pull] Removed leftover ./${name}`);
		}
	}

	if (await fs.pathExists(`./${dir.TMP}`)) {
		await fs.remove(`./${dir.TMP}`);
		logger.Debug(`[pull] Removed ./${dir.TMP}`);
	}

	// Pull must not leave modules nested under app (or leftover marketplace_builder)
	const appRoots = [dir.SITE_ROOT, dir.APP];
	for (let i = 0; i < appRoots.length; i++) {
		const appRoot = appRoots[i];
		const nestedModules = `./${appRoot}/modules`;
		if (await fs.pathExists(nestedModules)) {
			await moveModulesToRoot(appRoot, ignoredModules);
		}
		if (await fs.pathExists(nestedModules)) {
			await fs.remove(nestedModules);
			logger.Debug(`[pull] Removed leftover ${nestedModules}`);
		}
		if (await fs.pathExists(`./${appRoot}`)) {
			await cleanupEmptyDirs(appRoot);
		}
	}
	logger.Success('[pull] Tidying up complete');
};

program
	.version(version, '-v, --version')
	.name('siteglide-cli pull')
	.usage('<env>')
	.description('Pull site files into the existing site root (app/ or marketplace_builder/) and module public files into modules/. Does not rename marketplace_builder/ ↔ app/. Merges each module\'s public/assets/.agents into ./.agents (overwrite). When skills are present, scaffolds IDE discovery folders linked to ./.agents/skills. Registers Siteglide MCP in IDE configs if missing. Site and first module batch prefetch in parallel (see --concurrency). Overwrites local files. By default skips built-in Siteglide platform modules; customize via .siteglide/cli-settings/modules.json (pull_behaviour.include/exclude). Use -m to pull one module including ignored ones.')
	.arguments('[environment]', 'Name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-i --ignore-assets', 'Do not download assets such as CSS, JS, JSON etc', false)
	.option('-m --module <module>', 'Optional module name filter. Without this flag, non-ignored installed modules are pulled.')
	.option(
		'--merge-first-sync',
		'Internal: lightweight pull for sync merge-first (site, modules, assets only)',
		false
	)
	.option(
		'--concurrency <number>',
		`Max concurrent module pulls (default: ${DEFAULT_MODULE_PULL_CONCURRENCY}, or CONCURRENCY env)`,
		(value) => {
			const parsed = parseInt(value, 10);
			if (isNaN(parsed) || parsed < 1) {
				throw new Error('--concurrency must be a positive integer');
			}
			return parsed;
		}
	)
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;

		const lock = claimCommandLock('pull', { environment });
		if (!lock.ok) {
			logCommandLockRefusal(lock);
		}
		if (!lock.nested) {
			registerCommandLockCleanup();
		}

		const ignoreAssets = params.ignoreAssets;
		const moduleFilter = params.module;
		const envConcurrency = parseInt(process.env.CONCURRENCY, 10);
		const modulePullConcurrency = params.concurrency
			|| (envConcurrency > 0 ? envConcurrency : DEFAULT_MODULE_PULL_CONCURRENCY);
		const authData = fetchAuthData(environment, program);
		const gateway = new Gateway(authData);
		const assumeYes = process.env.SITEGLIDE_PULL_ASSUME_YES === '1';
		const mergeFirstSync = params.mergeFirstSync || process.env.SITEGLIDE_PULL_MERGE_FIRST_SYNC === '1';

		const runMergeFirstPull = async (wipMessage) => {
			logger.Info('[pull] Merge: committing local work if needed, pulling on a temporary branch, then merging back.');
			const result = await mergeFirstPull({
				environment,
				wipMessage,
				pullFn: async () => {
					await spawnNestedPull({
						environment,
						configFile: params.configFile,
						ignoreAssets: params.ignoreAssets,
						module: params.module,
						concurrency: params.concurrency,
						skipCommitBaseline: true
					});
				}
			});
			if (!result.ok) {
				logger.Error(`[pull] Merge failed: ${result.error}`);
				await offerMergeFirstFailureHelp(result, {
					environment,
					command: 'pull'
				});
				process.exit(1);
			}
			const conflicts = hasOpenGitConflicts();
			if (conflicts.open) {
				await offerMergeConflictAiHelp({
					environment,
					command: 'pull',
					warnMessage:
						'[pull] Merge started. Ask AI + MCP to resolve conflict markers if any, finish the merge commit, then continue.'
				});
			} else {
				logger.Success('[pull] Merge completed with no conflict markers.');
			}
			process.exit(0);
		};

		/**
		 * After a successful pull: write lastPulledAt, and when appropriate record
		 * lastPullCommit (auto-commit dirty tree so a SHA always exists).
		 */
		const recordPullBaseline = () => {
			const skipCommitBaseline = process.env.SITEGLIDE_PULL_SKIP_COMMIT_BASELINE === '1';
			const isPartialModulePull = Boolean(moduleFilter);

			if (skipCommitBaseline || isPartialModulePull) {
				// Timestamp only — preserve existing lastPullCommit (do not set from temp/partial tree).
				writePullBaseline(environment);
				return;
			}

			const gitReady = getGitReadiness();
			if (!gitReady.repoInitialized) {
				writePullBaseline(environment);
				return;
			}

			if (hasStagedOrUnstagedChanges()) {
				const shortDate = new Date().toISOString().slice(0, 10);
				const defaultMsg = `Snapshot after pulling from ${environment} environment ${shortDate}`;
				const committed = commitAllSafe(defaultMsg);
				if (!committed.ok && !/nothing to commit/i.test(`${committed.stdout} ${committed.stderr}`)) {
					logger.Warn(`[pull] Could not auto-commit pull snapshot: ${committed.stderr || committed.stdout}`, { exit: false });
					writePullBaseline(environment);
					return;
				}
				logger.Info('[pull] Auto-committed pull snapshot for merge-first baseline');
			} else {
				logger.Success('[pull] Working tree is clean — files on the site exactly matched your local files. Nothing to commit.');
			}

			const head = runGit('git', ['rev-parse', 'HEAD']);
			if (head.ok && head.stdout) {
				writePullBaseline(environment, { lastPullCommit: head.stdout });
			} else {
				writePullBaseline(environment);
			}
		};

		const startPull = async function () {
			let git = { repoInitialized: false };
			try {
				git = getGitReadiness();
				if (git.repoInitialized) {
					const open = hasOpenGitConflicts();
					if (open.open) {
						logger.Error(`[pull] Refusing pull while ${open.reason}. Ask AI + MCP to help resolve conflict markers first.`);
						process.exit(1);
					}
					if (!mergeFirstSync) {
						await ensureSiteglideGitignored();
					}
					if (!mergeFirstSync && isWorkingTreeDirty()) {
						if (!process.stdin.isTTY || process.env.CI) {
							logger.Error('[pull] Working tree is dirty. Commit your work, then pull again (non-interactive).');
							process.exit(1);
						}
						const chalk = require('chalk');
						const message = chalk.yellow.bold('Commit your working tree before pulling.') +
							' How shall we proceed?';
						const ans = await selectChoice(message, [
							{
								name: 'Commit, pull and merge',
								value: 'merge',
								description:
									'Commit changes now, pull on a new branch, then merge back. Conflicts stay in files for manual or AI resolution.'
							},
							{
								name: 'Commit and pull',
								value: 'commit_pull',
								description:
									'Commit your current work first (so it is recoverable from history), then continue with a normal pull.'
							},
							{
								name: 'Cancel pull',
								value: 'cancel'
							}
						]);
						if (!ans || ans === 'cancel') {
							logger.Error('[Cancelled] Pull not executed — commit your working tree first, then pull again.');
							process.exit(1);
						}
						const shortDate = new Date().toISOString().slice(0, 10);
						const defaultBeforeMsg = `Snapshot before pulling from ${environment} environment ${shortDate}`;
						const msg = await inputText('Commit message for your current work', { default: defaultBeforeMsg });
						if (msg == null) {
							logger.Error('[Cancelled] Pull not executed — commit your working tree first, then pull again.');
							process.exit(1);
						}
						const wipMessage = msg.trim() || defaultBeforeMsg;
						if (ans === 'merge') {
							await runMergeFirstPull(wipMessage);
						}
						const committed = commitAllSafe(wipMessage);
						if (!committed.ok && !/nothing to commit/i.test(`${committed.stdout} ${committed.stderr}`)) {
							logger.Error(`[pull] Commit failed: ${committed.stderr || committed.stdout}`);
							process.exit(1);
						}
						logger.Info('[pull] Committed current work — continuing with a normal pull.');
						// Fall through to the normal pull path (working tree should now be clean).
					}
				}

				const siteRoot = await resolveSiteAppRoot();
				logger.Info(`[pull] Site files root: ${siteRoot}/`);

				pullSpinner.start();
				if (moduleFilter) {
					logger.Info(`[pull] Module filter (-m): "${formatModuleNameForLog(moduleFilter)}"`);
				}
				if (ignoreAssets) {
					logger.Info('[pull] --ignore-assets set; asset download step will be skipped');
				}

				pullSpinner.text = 'Fetching installed modules';
				const { created: pullModulesConfigCreated, effectiveIgnoredModules } = await preparePullModulesConfig(process.cwd());
				if (pullModulesConfigCreated) {
					logger.Info(`[pull] Created ./${PULL_MODULES_CONFIG_RELATIVE_PATH} — edit pull_behaviour include/exclude to customize skipped modules (commit to git so the team stays in sync)`);
				}
				const modulesResponse = await gateway.listModules();
				const installedModules = (modulesResponse && modulesResponse.data) ? modulesResponse.data : [];
				logger.Debug(`[pull] list_modules returned ${installedModules.length} module(s)`);
				if (installedModules.length > 0) {
					installedModules.forEach((name, i) => {
						logger.Debug(`\t${i + 1}. ${formatModuleNameForLog(name)}`, { hideTimestamp: true });
					});
				} else {
					logger.Debug('[pull] Raw list_modules response keys: ' + Object.keys(modulesResponse || {}).join(', '));
				}

				const ignoredModules = resolvePullIgnoredModules(moduleFilter, effectiveIgnoredModules);
				const moduleSelection = partitionPullIgnoredModules(installedModules, effectiveIgnoredModules);
				const modulesToPull = selectModulesToPull(installedModules, moduleFilter, effectiveIgnoredModules);

				if (moduleFilter && modulesToPull === null) {
					pullSpinner.fail(`Module "${formatModuleNameForLog(moduleFilter)}" is not installed on this site`);
					logger.Error(`[pull] Filter "${formatModuleNameForLog(moduleFilter)}" not found in installed modules`);
					process.exit(1);
				}

				if (!moduleFilter && moduleSelection.ignored.length > 0) {
					logger.Info(`[pull] Skipping ${moduleSelection.ignored.length} default-ignored module(s): ${formatModuleListForLog(moduleSelection.ignored).join(', ')}`);
				}

				if (modulesToPull.length === 0) {
					logger.Info('[pull] No modules selected to pull');
				} else {
					logger.Info(`[pull] Will pull ${modulesToPull.length} module(s): ${formatModuleListForLog(modulesToPull).join(', ')}`);
				}

				await pullSiteAndModules(gateway, siteRoot, modulesToPull, modulePullConcurrency, ignoredModules);

				if (!ignoreAssets) {
					await pullAssets(gateway, siteRoot, ignoredModules);
				} else {
					logger.Info('[pull] Skipping assets step');
				}

				if (!mergeFirstSync) {
					await mergeModuleAgentsToRoot(modulesToPull);

					pullSpinner.stop();
					await ensureMcpOnPull();
				} else {
					logger.Debug('[pull] Merge-first sync mode: skipping MCP and .agents scaffolding');
				}

				await tidyUpAfterPull(ignoredModules);

				// Record lastPulledAt (+ lastPullCommit when git + full pull), clear conflict logs.
				recordPullBaseline();
				if (!mergeFirstSync) {
					clearConflictLog(environment);
					ensureProjectPreferences();
				}

				logger.Success('[pull] All steps finished');
				pullSpinner.succeed('Pulled files');
			} catch (e) {
				logger.Debug(e);
				pullSpinner.fail('Pull failed');
				logger.Error(e.message || e);
				process.exit(1);
			}
		};

		if (assumeYes) {
			return startPull();
		}

		return (async () => {
			const git = getGitReadiness();

			// Tip before any confirm when git is not set up.
			if (!git.repoInitialized) {
				await logGitSetupHint(git);
			}

			// Dirty tree: skip the generic overwrite confirm; go straight to merge/cancel.
			if (git.repoInitialized && isWorkingTreeDirty()) {
				await startPull();
				return;
			}

			if (git.repoInitialized) {
				const answer = await selectChoice(
					'Are you sure you would like to pull? This will overwrite your local files immediately. ' +
					'However, your work is completely committed to git, meaning you can always check the history or revert later.',
					[
						{
							name: 'Merge',
							value: 'merge',
							description:
								'Pull changes to a new branch and then merge that branch with this one. Conflicts stay in files for manual or AI resolution.'
						},
						{
							name: 'Continue with the pull as normal',
							value: 'continue'
						},
						{
							name: 'Cancel pull',
							value: 'cancel'
						}
					]
				);
				if (!answer || answer === 'cancel') {
					logger.Error('[Cancelled] Pull command not executed, your files have been left untouched.');
					return;
				}
				if (answer === 'merge') {
					await runMergeFirstPull();
					return;
				}
				await startPull();
				return;
			}

			const response = await confirmYesNo(
				'Are you sure you would like to pull? This will overwrite your local files immediately!'
			);
			if (response) {
				await startPull();
			} else {
				logger.Error('[Cancelled] Pull command not executed, your files have been left untouched.');
			}
		})();
	});

program.parse(process.argv);
