const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { run } = require('../../lib/git/readiness');
const {
	STRANDED_HEADLINE,
	homeBranchPath,
	temporaryBranchRefusal
} = require('../../lib/git/homeBranch');

const HOME_BRANCH_MODULE = path.join(__dirname, '..', '..', 'lib', 'git', 'homeBranch.js');
const NOT_NESTED = {};

function gitInit(cwd) {
	assert.equal(run('git', ['init'], { cwd }).ok, true);
	run('git', ['config', 'user.email', 'test@example.com'], { cwd });
	run('git', ['config', 'user.name', 'Test User'], { cwd });
	run('git', ['checkout', '-b', 'main'], { cwd });
	fs.writeFileSync(path.join(cwd, '.gitignore'), '.siteglide/user/\n');
	fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
	run('git', ['add', '-A'], { cwd });
	assert.equal(run('git', ['commit', '-m', 'base'], { cwd }).ok, true);
}

function checkout(cwd, branch) {
	const res = run('git', ['checkout', '-b', branch], { cwd });
	assert.equal(res.ok, true, res.stderr);
}

function writeRecord(cwd, overrides = {}) {
	const filePath = homeBranchPath(cwd);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const now = new Date().toISOString();
	fs.writeFileSync(filePath, JSON.stringify(Object.assign({
		homeBranch: 'main',
		temporaryBranch: 'temp-pull-from-staging-2026-10-16-1453',
		command: 'pull',
		environment: 'staging',
		ownerPid: 999999999,
		phase: 'pulling',
		startedAt: now,
		updatedAt: now
	}, overrides)));
}

describe('temporaryBranchRefusal', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-home-guard-'));
		gitInit(cwd);
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('refuses a temp-named branch with no record and points at git_status', () => {
		checkout(cwd, 'siteglide-merge-deploy/123-456');
		assert.deepEqual(temporaryBranchRefusal({ command: 'deploy', cwd, env: NOT_NESTED }), {
			reason: 'stranded',
			headline: STRANDED_HEADLINE,
			helper: 'Ask your AI assistant to run the Siteglide MCP git_status tool to find your development branch and rescue the merge.'
		});
	});

	it('refuses the recorded temporary branch and names the home branch', () => {
		checkout(cwd, 'my-odd-temp');
		writeRecord(cwd, { temporaryBranch: 'my-odd-temp' });
		assert.deepEqual(temporaryBranchRefusal({ command: 'sync', cwd, env: NOT_NESTED }), {
			reason: 'stranded',
			headline: STRANDED_HEADLINE,
			helper: 'Your development branch is "main". Ask your AI assistant to run the Siteglide MCP git_status tool for step-by-step rescue.'
		});
	});

	it('allows the home branch, even with a leftover record', () => {
		writeRecord(cwd);
		assert.equal(temporaryBranchRefusal({ command: 'sync', cwd, env: NOT_NESTED }), null);
	});

	it('allows a nested CLI subprocess on a temporary branch', () => {
		checkout(cwd, 'temp-pull-from-staging-2026-10-16-1453');
		writeRecord(cwd);
		assert.equal(temporaryBranchRefusal({ command: 'deploy', cwd, env: { SITEGLIDE_NESTED_CLI: '1' } }), null);
		assert.equal(temporaryBranchRefusal({ command: 'deploy', cwd, env: NOT_NESTED }).reason, 'stranded');
	});

	it('says wait when the owning CLI process is still running', () => {
		checkout(cwd, 'temp-pull-from-staging-2026-10-16-1453');
		writeRecord(cwd, { ownerPid: process.pid, command: 'deploy' });
		assert.deepEqual(temporaryBranchRefusal({ command: 'sync', cwd, env: NOT_NESTED }), {
			reason: 'in_progress',
			headline: 'siteglide-cli deploy is part-way through Pull and merge on a temporary branch. Wait for it to finish before syncing or deploying.',
			helper: 'Temporary branch: "temp-pull-from-staging-2026-10-16-1453". Home branch: "main".'
		});
	});

	it('treats an old record with a live pid as stranded (pid may have been reused)', () => {
		checkout(cwd, 'temp-pull-from-staging-2026-10-16-1453');
		const old = '2020-01-01T00:00:00.000Z';
		writeRecord(cwd, { ownerPid: process.pid, startedAt: old, updatedAt: old });
		assert.equal(temporaryBranchRefusal({ command: 'sync', cwd, env: NOT_NESTED }).reason, 'stranded');
	});

	it('allows a folder that is not a git repo', () => {
		const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-home-guard-plain-'));
		try {
			assert.equal(temporaryBranchRefusal({ command: 'sync', cwd: plain, env: NOT_NESTED }), null);
		} finally {
			fs.rmSync(plain, { recursive: true, force: true });
		}
	});
});

describe('assertNotOnTemporaryBranch', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-home-guard-exit-'));
		gitInit(cwd);
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	function runGuard(env) {
		const script = `require(${JSON.stringify(HOME_BRANCH_MODULE)}).assertNotOnTemporaryBranch({ command: 'sync' }); console.log('allowed');`;
		const childEnv = Object.assign({}, process.env, { NO_COLOR: '1' });
		delete childEnv.SITEGLIDE_NESTED_CLI;
		Object.assign(childEnv, env);
		return spawnSync(process.execPath, ['-e', script], { cwd, env: childEnv, encoding: 'utf8' });
	}

	it('exits 1 with the headline on a temporary branch', () => {
		checkout(cwd, 'temp-pull-from-staging-2026-10-16-1453');
		const res = runGuard({});
		assert.equal(res.status, 1);
		assert.equal(res.stderr.includes(STRANDED_HEADLINE), true, res.stderr);
		assert.equal(res.stdout.includes('allowed'), false);
	});

	it('continues on the home branch', () => {
		const res = runGuard({});
		assert.equal(res.status, 0, res.stderr);
		assert.equal(res.stdout.trim(), 'allowed');
	});
});
