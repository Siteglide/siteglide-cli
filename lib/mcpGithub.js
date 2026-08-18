const path = require('path');
const { execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');
const Confirm = require('./confirm');
const { chooseBranch } = require('./ask');

const execFileAsync = promisify(execFile);

const GITHUB_MCP_REPO = 'Siteglide/Siteglide-MCP';
const GITHUB_MCP_URL = 'https://github.com/Siteglide/Siteglide-MCP.git';
const GITHUB_PROBE_TIMEOUT_MS = 10000;

const isAffirmative = (answer) => /^y(es)?$/i.test(String(answer || '').trim());

/**
 * @param {string} output
 * @returns {string[]}
 */
const parseLsRemoteBranches = (output) => {
	const branches = [];
	const lines = String(output || '').split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) {
			continue;
		}
		const match = line.match(/refs\/heads\/(.+)$/);
		if (match && match[1]) {
			branches.push(match[1]);
		}
	}
	return branches.sort((a, b) => {
		return a.localeCompare(b);
	});
};

/**
 * @param {string} branch
 * @returns {string}
 */
const buildGithubInstallSpec = (branch) => {
	return `github:${GITHUB_MCP_REPO}#${branch}`;
};

/**
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ accessible: boolean, branches: string[] }>}
 */
const probeGithubMcpRepo = async (opts = {}) => {
	const timeoutMs = opts.timeoutMs || GITHUB_PROBE_TIMEOUT_MS;
	const runExecFile = opts.execFileAsync || execFileAsync;
	try {
		const { stdout } = await runExecFile(
			'git',
			['ls-remote', '--heads', GITHUB_MCP_URL],
			{
				timeout: timeoutMs,
				encoding: 'utf8',
				windowsHide: true,
				env: {
					...process.env,
					GIT_TERMINAL_PROMPT: '0'
				}
			}
		);
		const branches = parseLsRemoteBranches(stdout);
		if (branches.length === 0) {
			logger.Debug('[pull] GitHub MCP repo probe returned no branches');
			return {
				accessible: false,
				branches: []
			};
		}
		return {
			accessible: true,
			branches
		};
	} catch (error) {
		logger.Debug(`[pull] GitHub MCP repo probe failed: ${error.message}`);
		return {
			accessible: false,
			branches: []
		};
	}
};

/**
 * @param {string} branch
 * @param {string} cliRoot
 * @returns {boolean}
 */
const installMcpFromGithub = (branch, cliRoot) => {
	const spec = buildGithubInstallSpec(branch);
	try {
		execFileSync(
			process.platform === 'win32' ? 'npm.cmd' : 'npm',
			['install', spec, '--no-save'],
			{
				cwd: cliRoot,
				stdio: 'inherit',
				env: process.env
			}
		);
		return true;
	} catch (error) {
		logger.Warn(`[pull] MCP GitHub install failed: ${error.message}`, { exit: false });
		return false;
	}
};

/**
 * @param {{
 *   interactive?: boolean,
 *   cliRoot?: string,
 *   githubProbe?: { accessible: boolean, branches: string[] },
 *   logStepStart?: (step: string) => void,
 *   logStep?: (step: string, startedAt: number, detail?: string) => void
 * }} opts
 * @returns {Promise<{ attempted: boolean, installed: boolean, branch: string|null }>}
 */
const attemptGithubMcpInstall = async (opts = {}) => {
	const interactive = opts.interactive !== false;
	const githubProbe = opts.githubProbe || { accessible: false, branches: [] };
	const cliRoot = opts.cliRoot || path.resolve(__dirname, '..');
	const logStepStart = opts.logStepStart || (() => {});
	const logStep = opts.logStep || (() => {});

	if (!githubProbe.accessible) {
		return {
			attempted: false,
			installed: false,
			branch: null
		};
	}

	if (!interactive) {
		logger.Debug('[pull] MCP GitHub install skipped (non-interactive)');
		return {
			attempted: false,
			installed: false,
			branch: null
		};
	}

	logStepStart('waiting for GitHub MCP install confirmation');
	let stepStart = Date.now();
	const answer = await Confirm(
		`Attempt Siteglide MCP install from github.com/${GITHUB_MCP_REPO}? (y/N) `
	);
	logStep('GitHub install confirmation', stepStart, isAffirmative(answer) ? 'yes' : 'no');

	if (!isAffirmative(answer)) {
		logger.Info('[pull] Skipping Siteglide MCP GitHub install');
		return {
			attempted: true,
			installed: false,
			branch: null
		};
	}

	logStepStart('choose MCP branch');
	stepStart = Date.now();
	const branch = await chooseBranch(githubProbe.branches);
	logStep('choose MCP branch', stepStart, branch || 'none');

	if (!branch) {
		logger.Warn('[pull] No branch selected — MCP GitHub install skipped', { exit: false });
		return {
			attempted: true,
			installed: false,
			branch: null
		};
	}

	const spec = buildGithubInstallSpec(branch);
	logStepStart(`npm install ${spec}`);
	stepStart = Date.now();
	const installed = installMcpFromGithub(branch, cliRoot);
	logStep('npm install from GitHub', stepStart, installed ? branch : 'failed');

	return {
		attempted: true,
		installed,
		branch: installed ? branch : null
	};
};

module.exports = {
	GITHUB_MCP_REPO,
	GITHUB_MCP_URL,
	GITHUB_PROBE_TIMEOUT_MS,
	parseLsRemoteBranches,
	buildGithubInstallSpec,
	probeGithubMcpRepo,
	installMcpFromGithub,
	attemptGithubMcpInstall
};
