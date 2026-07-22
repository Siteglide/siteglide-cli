const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureMcpRegistered, SERVER_NAME } = require('../lib/ai');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-mcp-reg-'));
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-mcp-home-'));
const cursorPath = path.join(root, '.cursor', 'mcp.json');
fs.mkdirSync(path.dirname(cursorPath), { recursive: true });
fs.writeFileSync(
	cursorPath,
	JSON.stringify({ mcpServers: { other: { command: 'keep-me' } } }, null, 2)
);

const first = ensureMcpRegistered({ rootPath: root, homedir: fakeHome });
assert.ok(first.added.includes('Cursor'));
assert.ok(first.added.includes('Windsurf'));
const afterFirst = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
assert.deepStrictEqual(afterFirst.mcpServers.other, { command: 'keep-me' });
assert.ok(afterFirst.mcpServers[SERVER_NAME]);

const second = ensureMcpRegistered({ rootPath: root, homedir: fakeHome });
assert.ok(second.unchanged.includes('Cursor'));
assert.strictEqual(second.added.includes('Cursor'), false);

fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(fakeHome, { recursive: true, force: true });
console.log('mcp registration smoke ok');
