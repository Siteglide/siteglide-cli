/**
 * Probe whether git is usable for Siteglide CLI / MCP wizards.
 * Never reads .siteglide-config. Remotes and gh auth are informational / optional.
 */

const { spawnSync } = require('child_process');

/**
 * Run a git (or gh) command; return stdout trim + status.
 * @param {string} bin
 * @param {string[]} args
 * @param {{ cwd?: string }} [opts]
 */
function run(bin, args, opts = {}) {
	const res = spawnSync(bin, args, {
		cwd: opts.cwd || process.cwd(),
		encoding: 'utf8',
		windowsHide: true
	});
	return {
		ok: res.status === 0,
		status: res.status,
		stdout: (res.stdout || '').trim(),
		stderr: (res.stderr || '').trim()
	};
}

/**
 * @param {{ cwd?: string }} [opts]
 * @returns {{
 *   installed: boolean,
 *   identityConfigured: boolean,
 *   repoInitialized: boolean,
 *   remotes: string[],
 *   ghAuthenticated: boolean,
 *   missing: string[],
 *   version?: string,
 *   userName?: string,
 *   userEmail?: string
 * }}
 */
function getGitReadiness(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const missing = [];

	const ver = run('git', ['--version'], { cwd });
	const installed = ver.ok;
	if (!installed) {
		missing.push('installed');
	}

	const name = installed ? run('git', ['config', 'user.name'], { cwd }) : { ok: false, stdout: '' };
	const email = installed ? run('git', ['config', 'user.email'], { cwd }) : { ok: false, stdout: '' };
	const identityConfigured = !!(name.stdout && email.stdout);
	if (installed && !identityConfigured) {
		missing.push('identity');
	}

	const inside = installed
		? run('git', ['rev-parse', '--is-inside-work-tree'], { cwd })
		: { ok: false, stdout: '' };
	const repoInitialized = inside.ok && inside.stdout === 'true';
	if (installed && !repoInitialized) {
		missing.push('repoInitialized');
	}

	let remotes = [];
	if (repoInitialized) {
		const remoteOut = run('git', ['remote', '-v'], { cwd });
		if (remoteOut.ok && remoteOut.stdout) {
			remotes = [...new Set(
				remoteOut.stdout
					.split(/\r?\n/)
					.map((line) => line.split(/\s+/)[0])
					.filter(Boolean)
			)];
		}
	}

	const gh = run('gh', ['auth', 'status'], { cwd });
	const ghAuthenticated = gh.ok;

	return {
		installed,
		identityConfigured,
		repoInitialized,
		remotes,
		ghAuthenticated,
		missing,
		version: installed ? ver.stdout : undefined,
		userName: name.stdout || undefined,
		userEmail: email.stdout || undefined
	};
}

module.exports = {
	run,
	getGitReadiness
};
