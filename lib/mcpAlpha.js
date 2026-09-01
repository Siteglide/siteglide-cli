const fs = require('fs'),
	os = require('os'),
	path = require('path'),
	{ execFileSync, execFile } = require('child_process'),
	{ promisify } = require('util'),
	fetch = require('node-fetch'),
	semver = require('semver'),
	logger = require('./logger'),
	Confirm = require('./confirm'),
	{ runNpmSync } = require('./runNpm'),
	{ resolveGlobalMcpBin } = require('./resolveGlobalMcpBin'),
	{
		SERVER_NAME,
		ensureMcpRegistered,
		ensureMcpIdeRules,
		getRegistryTargets,
		filterTargetsForAgents
	} = require('./ai'),
	{ prepareAiAgentPreferences } = require('./aiAgentPreferences');

const cliPkg = require('../package.json');
const execFileAsync = promisify(execFile);

/** Max time to wait for global MCP version lookup after install. */
const RESOLVE_MCP_VERSION_TIMEOUT_MS = 5000;

/** Days before re-prompting after the user declines an MCP update. */
const MCP_UPDATE_REMINDER_DAYS = 7;

/** npm org scope for Siteglide packages (not the package name). */
const NPM_ORG_SCOPE = '@siteglide';
/** MCP package name within the @siteglide org. */
const MCP_PACKAGE_NAME = 'siteglide-mcp';
/** Full scoped npm package: org/package-name */
const DEFAULT_PACKAGE = `${NPM_ORG_SCOPE}/${MCP_PACKAGE_NAME}`;
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const DEFAULT_TAG = 'latest';

const REMINDERS_RELATIVE_PATH = path.join('.siteglide', 'IDE', 'reminders.json');
const MCP_UPDATE_DECLINED_KEY = 'siteglideMcpUpdateDeclinedAt';

const getRemindersFilePath = (rootPath) => path.join(rootPath, REMINDERS_RELATIVE_PATH);

const readReminders = (rootPath) => {
	const filePath = getRemindersFilePath(rootPath);
	if (!fs.existsSync(filePath)) {
		return {};
	}
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed;
		}
	} catch (error) {
		logger.Debug(`[pull] AI: Could not read ${REMINDERS_RELATIVE_PATH}: ${error.message}`);
	}
	return {};
};

const writeMcpUpdateDeclinedReminder = (rootPath) => {
	const filePath = getRemindersFilePath(rootPath);
	const reminders = readReminders(rootPath);
	reminders[MCP_UPDATE_DECLINED_KEY] = new Date().toISOString();
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(reminders, null, 2) + '\n');
};

/**
 * @param {string} rootPath
 * @param {number} [nowMs]
 * @returns {boolean}
 */
const shouldPromptMcpUpdate = (rootPath, nowMs = Date.now()) => {
	const reminders = readReminders(rootPath);
	const declinedAt = reminders[MCP_UPDATE_DECLINED_KEY];
	if (!declinedAt) {
		return true;
	}
	const declinedMs = Date.parse(declinedAt);
	if (Number.isNaN(declinedMs)) {
		return true;
	}
	const cooldownMs = MCP_UPDATE_REMINDER_DAYS * 24 * 60 * 60 * 1000;
	return nowMs - declinedMs >= cooldownMs;
};

const registryPackageUrl = (registry, packageName) => {
	const base = registry.endsWith('/') ? registry.slice(0, -1) : registry;
	return `${base}/${packageName.replace('/', '%2F')}`;
};

/**
 * @param {string} stdout
 * @param {string} packageName
 * @returns {string | null}
 */
const parseNpmListGlobalVersion = (stdout, packageName) => {
	try {
		const data = JSON.parse(stdout);
		const deps = data.dependencies;
		if (!deps || typeof deps !== 'object') {
			return null;
		}
		const entry = deps[packageName];
		if (entry && typeof entry.version === 'string') {
			return entry.version;
		}
		return null;
	} catch (error) {
		return null;
	}
};

/**
 * @returns {string | null}
 */
const resolveGlobalMcpVersion = () => {
	try {
		const stdout = runNpmSync(['list', '-g', DEFAULT_PACKAGE, '--json', '--depth=0']);
		return parseNpmListGlobalVersion(stdout, DEFAULT_PACKAGE);
	} catch (error) {
		if (error.stdout) {
			const version = parseNpmListGlobalVersion(error.stdout, DEFAULT_PACKAGE);
			if (version) {
				return version;
			}
		}
		return null;
	}
};

/** @deprecated Use resolveGlobalMcpVersion — kept for existing tests/imports. */
const resolveInstalledMcpVersion = resolveGlobalMcpVersion;

/**
 * Same as resolveGlobalMcpVersion but in a child process so a hung
 * npm list cannot block pull indefinitely.
 *
 * @param {number} [timeoutMs]
 * @returns {Promise<{ version: string | null, timedOut: boolean }>}
 */
const resolveInstalledMcpVersionWithTimeout = async (
	timeoutMs = RESOLVE_MCP_VERSION_TIMEOUT_MS
) => {
	const payload = JSON.stringify({ packageName: DEFAULT_PACKAGE });
	const script = [
		'const { execFileSync } = require("child_process");',
		'const data = JSON.parse(process.argv[1]);',
		'const npm = process.platform === "win32" ? "npm.cmd" : "npm";',
		'const npmOpts = { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] };',
		'if (process.platform === "win32") { npmOpts.shell = true; }',
		'try {',
		'  const stdout = execFileSync(',
		'    npm,',
		'    ["list", "-g", data.packageName, "--json", "--depth=0"],',
		'    npmOpts',
		'  );',
		'  const parsed = JSON.parse(stdout);',
		'  const entry = parsed.dependencies && parsed.dependencies[data.packageName];',
		'  process.stdout.write(entry && entry.version ? entry.version : "");',
		'} catch (e) {',
		'  if (e.stdout) {',
		'    try {',
		'      const parsed = JSON.parse(e.stdout);',
		'      const entry = parsed.dependencies && parsed.dependencies[data.packageName];',
		'      if (entry && entry.version) {',
		'        process.stdout.write(entry.version);',
		'        process.exit(0);',
		'      }',
		'    } catch (ignored) {}',
		'  }',
		'  process.stdout.write("");',
		'}'
	].join('');

	try {
		const { stdout } = await execFileAsync(
			process.execPath,
			['-e', script, payload],
			{
				timeout: timeoutMs,
				encoding: 'utf8',
				windowsHide: true
			}
		);
		const version = String(stdout || '').trim();
		return {
			version: version || null,
			timedOut: false
		};
	} catch (error) {
		if (error.killed || error.code === 'ETIMEDOUT') {
			return {
				version: null,
				timedOut: true
			};
		}
		logger.Debug(`[pull] resolve global MCP version failed: ${error.message}`);
		return {
			version: null,
			timedOut: false
		};
	}
};

/**
 * @returns {Promise<{ tagVersion: string | null, versions: string[], distTags: Record<string, string> } | null>}
 */
const fetchPublishedMcpVersions = async (
	packageName = DEFAULT_PACKAGE,
	registry = DEFAULT_REGISTRY,
	tag = DEFAULT_TAG
) => {
	const url = registryPackageUrl(registry, packageName);
	try {
		const response = await fetch(url, {
			headers: {
				Accept: 'application/json'
			}
		});

		if (response.status === 404) {
			logger.Debug(`[pull] ${packageName} is not published on ${registry}`);
			return null;
		}

		if (!response.ok) {
			logger.Debug(`[pull] MCP registry lookup failed (${response.status}) for ${packageName}`);
			return null;
		}

		const data = await response.json();
		const versions = data.versions && typeof data.versions === 'object'
			? Object.keys(data.versions)
			: [];
		const distTags = data['dist-tags'] && typeof data['dist-tags'] === 'object'
			? data['dist-tags']
			: {};

		return {
			tagVersion: typeof distTags[tag] === 'string' ? distTags[tag] : null,
			versions,
			distTags
		};
	} catch (error) {
		logger.Debug(`[pull] MCP registry lookup error: ${error.message}`);
		return null;
	}
};

const pickLatestPublishedVersion = (published, tag = DEFAULT_TAG) => {
	if (!published) {
		return null;
	}
	if (published.tagVersion && semver.valid(published.tagVersion)) {
		return published.tagVersion;
	}
	return null;
};

/**
 * @returns {string | null}
 */
const getCompatibleMcpRange = () => {
	const range = cliPkg.siteglideMcp && cliPkg.siteglideMcp.compatibleRange;
	if (typeof range === 'string' && range.trim()) {
		return range.trim();
	}
	return null;
};

/**
 * @param {{ versions?: string[] } | null} published
 * @param {string | null} compatibleRange
 * @returns {string | null}
 */
const getMaxCompatibleMcpVersion = (published, compatibleRange) => {
	if (!published || !compatibleRange || !semver.validRange(compatibleRange)) {
		return null;
	}
	const candidates = (published.versions || []).filter((version) => semver.valid(version));
	return semver.maxSatisfying(candidates, compatibleRange) || null;
};

/**
 * Resolve the MCP version pull should offer/install, capped to CLI support.
 * Uses the highest published version satisfying compatibleRange (includes prereleases when
 * the range allows them, e.g. ^0.1.0-0).
 *
 * @param {{ tagVersion?: string | null, versions?: string[] } | null} published
 * @param {string | null} [compatibleRange]
 * @returns {string | null}
 */
const pickCompatibleInstallVersion = (published, compatibleRange = getCompatibleMcpRange()) => {
	if (!published) {
		return null;
	}

	if (!compatibleRange || !semver.validRange(compatibleRange)) {
		const npmLatest = pickLatestPublishedVersion(published);
		if (!npmLatest) {
			logger.Debug('[pull] MCP npm latest dist-tag missing or invalid — skipping install offer');
		}
		return npmLatest;
	}

	const installVersion = getMaxCompatibleMcpVersion(published, compatibleRange);
	if (!installVersion) {
		logger.Debug(`[pull] No compatible siteglide-mcp version found for CLI range ${compatibleRange}`);
	}
	return installVersion;
};

/**
 * @param {string | null} installedVersion
 * @param {string | null} compatibleRange
 * @param {{ versions?: string[] } | null} published
 */
const warnIfInstalledMcpExceedsRange = (installedVersion, compatibleRange, published) => {
	if (!installedVersion || !compatibleRange || !semver.validRange(compatibleRange)) {
		return;
	}
	if (!semver.valid(installedVersion)) {
		return;
	}
	if (semver.satisfies(installedVersion, compatibleRange)) {
		return;
	}

	const maxCompatible = getMaxCompatibleMcpVersion(published, compatibleRange);
	const downgradeHint = maxCompatible
		? `npm install -g ${DEFAULT_PACKAGE}@${maxCompatible}`
		: `update siteglide-cli to a release that supports your MCP version`;

	logger.Warn(
		`[pull] AI: siteglide-mcp ${installedVersion} is newer than this CLI supports (${compatibleRange}). ` +
			`Run ${downgradeHint}, or update siteglide-cli globally.`,
		{ exit: false }
	);
};

/**
 * True when a published npm version exists and the global install is missing or older.
 *
 * @param {string | null} installedVersion
 * @param {string | null} latestVersion
 * @returns {boolean}
 */
const needsMcpInstall = (installedVersion, latestVersion) => {
	if (!latestVersion || !semver.valid(latestVersion)) {
		return false;
	}
	if (!installedVersion) {
		return true;
	}
	if (semver.valid(installedVersion) && semver.gt(latestVersion, installedVersion)) {
		return true;
	}
	return false;
};

/**
 * @param {string} version
 * @returns {boolean}
 */
const installMcpPackageGlobally = (version) => {
	const spec = `${DEFAULT_PACKAGE}@${version}`;
	try {
		runNpmSync(['install', '-g', spec], {
			stdio: 'inherit',
			shell: true,
			env: process.env
		});
		return true;
	} catch (error) {
		logger.Warn(`[pull] AI: MCP global install failed: ${error.message}`, { exit: false });
		return false;
	}
};

/** @deprecated Use installMcpPackageGlobally — kept for existing tests/imports. */
const installMcpPackage = installMcpPackageGlobally;

/**
 * Project-local IDE configs that should contain the Siteglide MCP server entry.
 * @param {string} rootPath
 * @param {string[]} [enabledSkillAgents]
 */
const getProjectMcpTargets = (rootPath, enabledSkillAgents) => {
	return filterTargetsForAgents(getRegistryTargets(rootPath), enabledSkillAgents).filter((target) => {
		return target.configPath.startsWith(rootPath);
	});
};

const readMcpConfigObject = (filePath) => {
	if (!fs.existsSync(filePath)) {
		return null;
	}
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed;
		}
	} catch (error) {
		return null;
	}
	return null;
};

/**
 * @param {string} [rootPath]
 * @param {string[]} [enabledSkillAgents]
 * @returns {{ configured: boolean, paths: string[], missing: string[] }}
 */
const getMcpConfigStatus = (rootPath = process.cwd(), enabledSkillAgents) => {
	const targets = getProjectMcpTargets(rootPath, enabledSkillAgents);
	const paths = [];
	const missing = [];

	for (let i = 0; i < targets.length; i++) {
		const target = targets[i];
		const config = readMcpConfigObject(target.configPath);
		if (!config) {
			missing.push(target.configPath);
			continue;
		}

		const servers = config[target.serversKey];
		if (servers && typeof servers === 'object' && !Array.isArray(servers) && servers[SERVER_NAME]) {
			paths.push(target.configPath);
		} else {
			missing.push(target.configPath);
		}
	}

	return {
		configured: paths.length > 0,
		paths,
		missing
	};
};

const buildMcpUpdatePrompt = (installedVersion, latestVersion) => {
	if (installedVersion) {
		return `@siteglide/siteglide-mcp ${latestVersion} is available (installed globally: ${installedVersion}). Install update globally? (Y/n) `;
	}
	return `@siteglide/siteglide-mcp ${latestVersion} is available on npm. Install globally? (Y/n) `;
};

/**
 * MCP setup on pull:
 * - Checks npm latest dist-tag, capped to CLI-compatible semver range
 * - Prompts to install/update globally when newer than the global install
 * - Re-prompts at most once every 7 days after the user declines
 * - Registers Siteglide MCP in IDE configs when the package is present
 *
 * @param {{ rootPath?: string, homedir?: string, interactive?: boolean, enabledSkillAgents?: string[] }} [opts]
 */
const ensureMcpOnPull = async (opts = {}) => {
	const rootPath = opts.rootPath || process.cwd();
	const homedir = opts.homedir || os.homedir();
	const interactive = opts.interactive !== false;
	const compatibleRange = getCompatibleMcpRange();
	const enabledSkillAgents = Array.isArray(opts.enabledSkillAgents)
		? opts.enabledSkillAgents
		: (await prepareAiAgentPreferences(rootPath)).enabledSkillAgents;

	logger.Debug('[pull] AI: Starting MCP check');

	let installedVersion = resolveGlobalMcpVersion();

	const published = await fetchPublishedMcpVersions();
	const latestVersion = pickCompatibleInstallVersion(published, compatibleRange);
	const npmLatest = pickLatestPublishedVersion(published, DEFAULT_TAG);

	warnIfInstalledMcpExceedsRange(installedVersion, compatibleRange, published);

	if (latestVersion && needsMcpInstall(installedVersion, latestVersion)) {
		if (interactive && shouldPromptMcpUpdate(rootPath)) {
			const answer = await Confirm(buildMcpUpdatePrompt(installedVersion, latestVersion));
			if (answer === 'Y') {
				if (installMcpPackageGlobally(latestVersion)) {
					installedVersion = resolveGlobalMcpVersion() || latestVersion;
					logger.Info(`[pull] AI: siteglide-mcp ${installedVersion} installed globally`);
				} else {
					logger.Info('[pull] AI: siteglide-mcp global install failed');
				}
			} else {
				writeMcpUpdateDeclinedReminder(rootPath);
				logger.Info('[pull] AI: Skipping siteglide-mcp install');
			}
		} else if (!interactive) {
			logger.Debug('[pull] AI: Skipping siteglide-mcp install (non-interactive)');
		} else {
			logger.Debug(`[pull] AI: siteglide-mcp update available (${latestVersion}) — reminder suppressed until ${MCP_UPDATE_REMINDER_DAYS} days after last decline`);
		}
	} else if (latestVersion && installedVersion) {
		logger.Debug(`[pull] siteglide-mcp ${installedVersion} is up to date (install target: ${latestVersion}${npmLatest && npmLatest !== latestVersion ? `, npm latest: ${npmLatest}` : ''})`);
	}

	const versionBeforeReResolve = installedVersion;
	const reResolved = await resolveInstalledMcpVersionWithTimeout();
	if (reResolved.timedOut) {
		if (versionBeforeReResolve) {
			installedVersion = versionBeforeReResolve;
			logger.Debug('[pull] Siteglide MCP version re-check timed out — using previously resolved version');
		} else {
			logger.Warn(
				`[pull] AI: Siteglide MCP version check timed out after ${RESOLVE_MCP_VERSION_TIMEOUT_MS / 1000}s — skipping MCP setup`,
				{ exit: false }
			);
			return {
				skipped: true,
				reason: 're-resolve-timeout',
				installedVersion: null,
				latestVersion
			};
		}
	} else {
		installedVersion = reResolved.version || versionBeforeReResolve;
	}

	if (!installedVersion) {
		logger.Warn('[pull] AI: siteglide-mcp is unavailable — IDE registration skipped', { exit: false });
		return {
			skipped: true,
			reason: 'mcp-not-installed',
			installedVersion,
			latestVersion
		};
	}

	const mcpBin = resolveGlobalMcpBin();
	if (mcpBin) {
		logger.Debug(`[pull] MCP bin: ${mcpBin}`);
	} else {
		logger.Warn(
			'[pull] AI: siteglide-mcp is installed but the launch binary could not be resolved — IDE MCP may fail until npm global paths align',
			{ exit: false }
		);
	}

	const registration = ensureMcpRegistered({ rootPath, homedir, enabledSkillAgents });

	ensureMcpIdeRules({ rootPath, enabledSkillAgents });

	const afterConfig = getMcpConfigStatus(rootPath, enabledSkillAgents);

	if (afterConfig.configured) {
		logger.Debug(`[pull] AI: siteglide-mcp configured (${installedVersion})`);
	} else if (afterConfig.missing.length > 0) {
		logger.Warn(`[pull] AI: siteglide-mcp registration incomplete for: ${afterConfig.missing.join(', ')}`, { exit: false });
	}

	return {
		skipped: false,
		installedVersion,
		latestVersion,
		configStatus: afterConfig,
		registration
	};
};

module.exports = {
	NPM_ORG_SCOPE,
	MCP_PACKAGE_NAME,
	DEFAULT_PACKAGE,
	DEFAULT_REGISTRY,
	DEFAULT_TAG,
	MCP_UPDATE_REMINDER_DAYS,
	MCP_UPDATE_DECLINED_KEY,
	REMINDERS_RELATIVE_PATH,
	RESOLVE_MCP_VERSION_TIMEOUT_MS,
	resolveGlobalMcpVersion,
	resolveInstalledMcpVersion,
	resolveInstalledMcpVersionWithTimeout,
	fetchPublishedMcpVersions,
	pickLatestPublishedVersion,
	getCompatibleMcpRange,
	getMaxCompatibleMcpVersion,
	pickCompatibleInstallVersion,
	warnIfInstalledMcpExceedsRange,
	getMcpConfigStatus,
	installMcpPackageGlobally,
	installMcpPackage,
	needsMcpInstall,
	shouldPromptMcpUpdate,
	writeMcpUpdateDeclinedReminder,
	readReminders,
	ensureMcpOnPull
};
