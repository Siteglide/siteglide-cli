const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	ensureMcpRegistered,
	ensureMcpIdeRules,
	SERVER_NAME,
	resolveMcpScriptPath,
	buildMcpLaunchEntry
} = require('../lib/ai');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-mcp-reg-'));
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-mcp-home-'));
const cursorPath = path.join(root, '.cursor', 'mcp.json');
fs.mkdirSync(path.dirname(cursorPath), { recursive: true });
fs.writeFileSync(
	cursorPath,
	JSON.stringify({
		mcpServers: {
			other: { command: 'keep-me' },
			[SERVER_NAME]: { command: 'siteglide-cli-mcp' }
		}
	}, null, 2)
);

const first = ensureMcpRegistered({ rootPath: root, homedir: fakeHome });
assert.ok(first.updated.includes('Cursor'), 'should repair bare siteglide-cli-mcp');
assert.ok(first.added.includes('Windsurf'));
const afterFirst = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
assert.deepStrictEqual(afterFirst.mcpServers.other, { command: 'keep-me' });
assert.strictEqual(afterFirst.mcpServers[SERVER_NAME].command, process.execPath);
assert.deepStrictEqual(afterFirst.mcpServers[SERVER_NAME].args, [resolveMcpScriptPath()]);
assert.ok(!afterFirst.mcpServers[SERVER_NAME].command.includes('siteglide-cli-mcp') || afterFirst.mcpServers[SERVER_NAME].args);

const second = ensureMcpRegistered({ rootPath: root, homedir: fakeHome });
assert.ok(second.unchanged.includes('Cursor'));
assert.strictEqual(second.updated.includes('Cursor'), false);

const desired = buildMcpLaunchEntry();
assert.strictEqual(desired.command, process.execPath);
assert.ok(fs.existsSync(desired.args[0]));

const rules = ensureMcpIdeRules({ rootPath: root });
assert.ok(rules.written.includes('Cursor'));
assert.ok(fs.existsSync(path.join(root, '.cursor', 'rules', 'setup_siteglide_mcp.mdc')));
assert.ok(fs.existsSync(path.join(root, '.claude', 'siteglide-mcp.md')));
const cursorRule = fs.readFileSync(path.join(root, '.cursor', 'rules', 'setup_siteglide_mcp.mdc'), 'utf8');
assert.ok(cursorRule.indexOf('.siteglide-config') > -1);
assert.ok(cursorRule.indexOf('envs_list') > -1);
assert.ok(cursorRule.indexOf('NEVER') > -1);

fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(fakeHome, { recursive: true, force: true });
console.log('mcp registration smoke ok');
