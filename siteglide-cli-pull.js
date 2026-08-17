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
	Confirm = require('./lib/confirm'),
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
		selectModulesToPull
	} = require('./lib/pullIgnoredModules');

const pullSpinner = ora({ text: 'Pulling files', stream: process.stdout });

/** Project-root folder that receives merged agent files from modules. */
const AGENTS_ROOT = '.agents';

/** Default max concurrent module backup/download/extract jobs. */
const DEFAULT_MODULE_PULL_CONCURRENCY = 3;

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
			logger.Debug(`[pull] .agents: merging directory "${name}/" from module "${moduleName}"`);
			fileCount += await copyAgentsTree(srcPath, destPath, moduleName);
		} else {
			await makeWritable(destPath);
			await fs.copy(srcPath, destPath, { overwrite: true });
			await makeReadOnly(destPath);
			const displayPath = destPath.replace(/\\/g, '/').replace(/^\.\//, '');
			logger.Debug(`[pull] .agents: wrote ./${displayPath} (from module "${moduleName}")`);
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
			logger.Debug(`[pull] Module "${moduleName}" — no ${AGENTS_ROOT} directory found`);
			continue;
		}

		const srcStat = await fs.stat(agentsSrc);
		if (!srcStat.isDirectory()) {
			logger.Debug(`[pull] Module "${moduleName}" — ${AGENTS_ROOT} exists but is not a directory; skip`);
			continue;
		}

		logger.Info(`[pull] Module "${moduleName}" — found ${AGENTS_ROOT}; merging into ./${AGENTS_ROOT}`);
		const count = await copyAgentsTree(agentsSrc, `./${AGENTS_ROOT}`, moduleName);
		result.modulesWithAgents++;
		result.totalFiles += count;
		if (count > 0) {
			logger.Info(`[pull] Module "${moduleName}" — merged ${count} file(s) into ./${AGENTS_ROOT}`);
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
			logger.Debug(`[pull] Skipping default-ignored module "${moduleName}" from ./${fromRoot}/modules`);
			continue;
		}
		await fs.copy(srcPath, path.join(`./${dir.MODULES}`, moduleName), { overwrite: true });
	}
	await fs.remove(modulesPath);
};

/**
 * Download the main site backup zip and convert it into the local site root (`app/`).
 * Calls Siteglide-API `/cli/backup` then `/cli/backupStatus/:id` (no module_name).
 *
 * @param {Gateway} gateway - Authenticated API client for the current environment.
 * @param {string} [siteRoot] - Relative site folder (`app` or, rarely, `marketplace_builder`).
 * Side effects: writes/overwrites that folder; may merge into `./modules`;
 * updates `pullSpinner` text; downloads then deletes a temporary zip.
 */
const pullSiteZip = async (gateway, siteRoot = dir.APP, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	logger.Info(`[pull] Step: downloading main site zip → ${siteRoot}/`);
	const filename = `${siteRoot}.zip`;
	pullSpinner.text = 'Pulling site files';
	const pullTask = await gateway.pullZip();
	logger.Debug(`[pull] Site backup started (id: ${pullTask.id})`);
	const readyTask = await waitForStatus(() => gateway.pullZipStatus(pullTask.id));
	logger.Debug(`[pull] Site backup ready (status: ${readyTask.status}) — downloading zip`);
	await downloadFile(readyTask.zip_file.url, filename);
	await unzip(filename, siteRoot);
	await copyChildren(`./${siteRoot}/app`, `./${siteRoot}`);
	await fs.remove(`./${filename}`);
	await moveModulesToRoot(siteRoot, ignoredModules);
	if (await fs.pathExists(`./${siteRoot}/asset_manifest.json`)) {
		await fs.remove(`./${siteRoot}/asset_manifest.json`);
	}
	await fs.remove(`./${siteRoot}/app`);
	await cleanupEmptyDirs(siteRoot);
	logger.Info('[pull] Site files pulled');
};

/**
 * Download one module's public-files backup and merge it into `./modules/<moduleName>/`.
 * Calls Siteglide-API `/cli/backup` with `module_name`, then polls `/cli/backupStatus/:id`.
 * Does not clear `marketplace_builder`.
 *
 * @param {Gateway} gateway - Authenticated API client for the current environment.
 * @param {string} moduleName - Installed module machine name to pull.
 * Side effects: writes/overwrites files under `./modules`; updates `pullSpinner` text;
 * uses then deletes a temp zip and `.tmp/pull-<moduleName>` work directory.
 */
const pullModuleZip = async (gateway, moduleName, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	logger.Info(`[pull] Starting module ${moduleName}`);
	const filename = `${dir.MODULES}-${moduleName}.zip`;
	const workDir = path.join(dir.TMP, `pull-${moduleName}`);
	const pullTask = await gateway.pullZip({ module_name: moduleName });
	logger.Debug(`[pull] Module "${moduleName}" backup started (id: ${pullTask.id})`);
	const readyTask = await waitForStatus(() => gateway.pullZipStatus(pullTask.id));
	logger.Debug(`[pull] Module "${moduleName}" backup ready (status: ${readyTask.status}) — downloading zip`);
	await downloadFile(readyTask.zip_file.url, filename);
	await fs.remove(workDir);
	await unzip(filename, workDir);
	await fs.remove(`./${filename}`);

	if (await fs.pathExists(`./${workDir}/app`)) {
		await copyChildren(`./${workDir}/app`, `./${workDir}`);
		await fs.remove(`./${workDir}/app`);
	}

	await moveModulesToRoot(workDir, ignoredModules);

	// Some module zips nest files as <moduleName>/... instead of modules/<moduleName>/...
	const directModulePath = `./${workDir}/${moduleName}`;
	if (await fs.pathExists(directModulePath)) {
		logger.Debug(`[pull] Module "${moduleName}" zip used direct layout; copying into ./${dir.MODULES}/${moduleName}`);
		await fs.ensureDir(`./${dir.MODULES}/${moduleName}`);
		await fs.copy(directModulePath, `./${dir.MODULES}/${moduleName}`, { overwrite: true });
	}

	if (await fs.pathExists(`./${workDir}`)) {
		await fs.remove(`./${workDir}`);
	}
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
		logger.Info(`[pull] Module "${moduleName}" done (${completed}/${total})`);
		pullSpinner.text = `Pulling modules (${completed}/${total} done, up to ${limit} at a time)`;
	});

	logger.Info(`[pull] Pulled ${total} module(s)`);
};

/**
 * Fetch the asset file list from Siteglide-API `/cli/pull` and download matching text/binary assets
 * by physical_file_path. Paths under `modules/` are written to `./modules/...`; everything else
 * goes under the site root (`app/` or `marketplace_builder/`) so this step does not recreate nested modules.
 *
 * @param {Gateway} gateway - Authenticated API client for the current environment.
 * @param {string} [siteRoot] - Relative site folder for non-module assets.
 * Side effects: creates dirs and writes/overwrites asset files under the site root or `./modules`;
 * updates `pullSpinner` text; downloads each asset from its remote_url.
 */
const pullAssets = async (gateway, siteRoot = dir.APP, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
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
				logger.Debug(`[pull] Skipping asset for default-ignored module "${moduleName}": ${physicalPath}`);
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
	logger.Info(`[pull] Assets: wrote ${wroteCount} file(s) (${moduleAssetCount} under modules)`);
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

	const siteZips = [`./${dir.APP}.zip`, `./${dir.LEGACY_APP}.zip`];
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
	const appRoots = [dir.APP, dir.LEGACY_APP];
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
	logger.Info('[pull] Tidying up complete');
};

program
	.version(version, '-v, --version')
	.name('siteglide-cli pull')
	.usage('<env>')
	.description('Pull site files into the existing site root (app/ or marketplace_builder/) and module public files into modules/. Does not rename marketplace_builder/ ↔ app/. Merges each module\'s public/assets/.agents into ./.agents (overwrite). When skills are present, scaffolds IDE discovery folders linked to ./.agents/skills. Registers Siteglide MCP in IDE configs if missing. Modules pull in parallel (see --concurrency). Overwrites local files. By default skips built-in Siteglide platform modules; customize via .siteglide/cli-settings/modules.json (pull_behaviour.include/exclude). Use -m to pull one module including ignored ones.')
	.arguments('[environment]', 'Name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-i --ignore-assets', 'Do not download assets such as CSS, JS, JSON etc', false)
	.option('-m --module <module>', 'Optional module name filter. Without this flag, all installed modules are pulled.')
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
		const ignoreAssets = params.ignoreAssets;
		const moduleFilter = params.module;
		const envConcurrency = parseInt(process.env.CONCURRENCY, 10);
		const modulePullConcurrency = params.concurrency
			|| (envConcurrency > 0 ? envConcurrency : DEFAULT_MODULE_PULL_CONCURRENCY);
		const authData = fetchAuthData(environment, program);
		const gateway = new Gateway(authData);

		return Confirm('Are you sure you would like to pull? This will overwrite your local files immediately! (Y/n)\n').then(async function (response) {
			if (response === 'Y') {
				try {
					const siteRoot = await resolveSiteAppRoot();
					logger.Info(`[pull] Site files root: ${siteRoot}/`);

					pullSpinner.start();
					if (moduleFilter) {
						logger.Info(`[pull] Module filter (-m): "${moduleFilter}"`);
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
							logger.Debug(`\t${i + 1}. ${name}`, { hideTimestamp: true });
						});
					} else {
						logger.Debug('[pull] Raw list_modules response keys: ' + Object.keys(modulesResponse || {}).join(', '));
					}

					const ignoredModules = resolvePullIgnoredModules(moduleFilter, effectiveIgnoredModules);
					const moduleSelection = partitionPullIgnoredModules(installedModules, effectiveIgnoredModules);
					const modulesToPull = selectModulesToPull(installedModules, moduleFilter, effectiveIgnoredModules);

					if (moduleFilter && modulesToPull === null) {
						pullSpinner.fail(`Module "${moduleFilter}" is not installed on this site`);
						logger.Error(`[pull] Filter "${moduleFilter}" not found in installed modules`);
						process.exit(1);
					}

					if (!moduleFilter && moduleSelection.ignored.length > 0) {
						logger.Info(`[pull] Skipping ${moduleSelection.ignored.length} default-ignored module(s): ${moduleSelection.ignored.join(', ')}`);
					}

					if (modulesToPull.length === 0) {
						logger.Info('[pull] No modules selected to pull');
					} else {
						logger.Info(`[pull] Will pull ${modulesToPull.length} module(s): ${modulesToPull.join(', ')}`);
					}

					await pullSiteZip(gateway, siteRoot, ignoredModules);

					await pullModulesInParallel(gateway, modulesToPull, modulePullConcurrency, ignoredModules);

					if (!ignoreAssets) {
						await pullAssets(gateway, siteRoot, ignoredModules);
					} else {
						logger.Info('[pull] Skipping assets step');
					}

					// After module zips (and assets that may land under modules/) are on disk
					await mergeModuleAgentsToRoot(modulesToPull);

					pullSpinner.text = 'Checking Siteglide MCP (alpha)';
					await ensureMcpOnPull();

					await tidyUpAfterPull(ignoredModules);

					logger.Info('[pull] All steps finished');
					pullSpinner.succeed('Pulled files');
				} catch (e) {
					logger.Debug(e);
					pullSpinner.fail('Pull failed');
					logger.Error(e.message || e);
					process.exit(1);
				}
			} else {
				logger.Error('[Cancelled] Pull command not executed, your files have been left untouched.');
			}
		});
	});

program.parse(process.argv);
