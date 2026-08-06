#!/usr/bin/env node
/**
 * Build a shareable zip: siteglide-cli-test + bundled MCP (no npm publish).
 * Output: siteglide-cli-workspace-notes/dist/siteglide-cli-test-*.zip
 */
const fs = require('fs-extra');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI_ROOT = path.resolve(__dirname, '..');
const MCP_ROOT = path.resolve(CLI_ROOT, '..', 'Siteglide-MCP---Experimental');
const OUT_ROOT = path.resolve(CLI_ROOT, '..', 'siteglide-cli-workspace-notes', 'dist');
const STAGE = path.join(OUT_ROOT, 'siteglide-cli-test-bundle');
const pad2 = (n) => String(n).padStart(2, '0');
const zipStamp = (() => {
	const d = new Date();
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
})();
const ZIP_NAME = `siteglide-cli-test-${zipStamp}.zip`;

const CLI_SKIP = new Set([
	'node_modules',
	'.git',
	'.cursor',
	'coverage',
	'dist',
	'.tmp',
	'package-lock.json'
]);

const MCP_SKIP = new Set(['node_modules', '.git', '.cursor', 'package-lock.json']);

const copyTree = async (src, dest, skip) => {
	await fs.ensureDir(dest);
	const entries = await fs.readdir(src);
	for (const name of entries) {
		if (skip.has(name)) {
			continue;
		}
		const from = path.join(src, name);
		const to = path.join(dest, name);
		const stat = await fs.stat(from);
		if (stat.isDirectory()) {
			await copyTree(from, to, skip);
		} else {
			await fs.copy(from, to);
		}
	}
};

const main = async () => {
	if (!(await fs.pathExists(MCP_ROOT))) {
		throw new Error(`MCP package not found at ${MCP_ROOT}`);
	}

	await fs.remove(STAGE);
	await fs.ensureDir(STAGE);

	const mcpDest = path.join(STAGE, 'siteglide-mcp');
	const cliDest = path.join(STAGE, 'siteglide-cli-test');

	console.log('Copying MCP…');
	await copyTree(MCP_ROOT, mcpDest, MCP_SKIP);

	console.log('Copying CLI…');
	await copyTree(CLI_ROOT, cliDest, CLI_SKIP);

	const cliPkgPath = path.join(cliDest, 'package.json');
	const cliPkg = await fs.readJson(cliPkgPath);
	cliPkg.name = '@siteglide/siteglide-cli-test';
	cliPkg.description =
		'TEST / preview build of Siteglide CLI + MCP (not the production siteglide-cli package)';
	cliPkg.version = `${cliPkg.version}-test.0`;
	cliPkg.dependencies['@siteglide/siteglide-mcp'] = 'file:../siteglide-mcp';

	const newBin = {};
	for (const [binName, binPath] of Object.entries(cliPkg.bin || {})) {
		const testName = binName.replace(/^siteglide-cli/, 'siteglide-cli-test');
		newBin[testName] = binPath;
	}
	cliPkg.bin = newBin;
	delete cliPkg.preferGlobal;
	await fs.writeJson(cliPkgPath, cliPkg, { spaces: '\t' });

	// MCP registration id: siteglide-test (won't clash with production "siteglide")
	const aiPath = path.join(cliDest, 'lib', 'ai.js');
	let aiSrc = await fs.readFile(aiPath, 'utf8');
	aiSrc = aiSrc.replace(
		/const SERVER_NAME = 'siteglide';/,
		"const SERVER_NAME = 'siteglide-test';"
	);
	aiSrc = aiSrc.replace(/server "siteglide"/g, 'server "siteglide-test"');
	aiSrc = aiSrc.replace(/Siteglide MCP/g, 'Siteglide test MCP');
	aiSrc = aiSrc.replace(/bare siteglide-cli-mcp/g, 'bare siteglide-cli-test-mcp');
	aiSrc = aiSrc.replace(
		/absolute path to siteglide-cli-mcp\.js/g,
		'absolute path to siteglide-cli-mcp.js (via siteglide-cli-test)'
	);
	await fs.writeFile(aiPath, aiSrc);

	const mcpLauncher = path.join(cliDest, 'siteglide-cli-mcp.js');
	let mcpLaunchSrc = await fs.readFile(mcpLauncher, 'utf8');
	mcpLaunchSrc = mcpLaunchSrc.replace(
		/\[siteglide-cli-mcp\]/g,
		'[siteglide-cli-test-mcp]'
	);
	await fs.writeFile(mcpLauncher, mcpLaunchSrc);

	const mainCli = path.join(cliDest, 'siteglide-cli.js');
	let mainSrc = await fs.readFile(mainCli, 'utf8');
	mainSrc = mainSrc.replace(
		/Siteglide CLI v/,
		'Siteglide CLI TEST v'
	);
	await fs.writeFile(mainCli, mainSrc);

	const installMd = `# Siteglide CLI TEST — install (for your boss / AI)

This zip is a **preview** of Siteglide CLI + MCP. It installs as **\`siteglide-cli-test\`** so it does **not** replace your normal \`siteglide-cli\`.

## Requirements

- Node.js 18+ (22 recommended)
- Windows, macOS, or Linux
- npm (comes with Node)

## Ask an AI to install (recommended)

Paste this into Cursor / ChatGPT after unzipping:

\`\`\`
Unzip this archive if needed. From the folder that contains INSTALL.md, run:

  cd siteglide-mcp
  npm install
  cd ../siteglide-cli-test
  npm install
  npm install -g .

Then confirm:
  siteglide-cli-test --version
  where siteglide-cli-test   (Windows) or which siteglide-cli-test (Mac/Linux)

Do NOT install over or uninstall the normal siteglide-cli package.
Do NOT create or edit mcp.json by hand — pull writes IDE MCP config.

When the user is ready (site folder open, environment already added if needed), run a first pull from that site, e.g.:
  siteglide-cli-test pull staging

After pull finishes, tell the user to enable the Siteglide test MCP server in their AI tool settings (e.g. Cursor: Settings → Tools & MCP → enable siteglide-test) and reload the window if tools do not appear.
\`\`\`

## Manual install (PowerShell)

\`\`\`powershell
cd path\\to\\siteglide-cli-test-bundle\\siteglide-mcp
npm install
cd ..\\siteglide-cli-test
npm install
npm install -g .
siteglide-cli-test --version
\`\`\`

## First pull (registers MCP in the site project)

When you are ready — in a Siteglide site folder that already has an environment (e.g. via \`siteglide-cli-test add\`):

\`\`\`powershell
cd path\\to\\your-site
siteglide-cli-test pull staging
\`\`\`

Pull writes \`.cursor/mcp.json\` (and other IDE configs) pointing at the installed CLI. Do not create \`mcp.json\` by hand.

## Enable MCP in your AI tool

After pull finishes, turn the server on in settings, then reload if needed:

- **Cursor:** Settings → Tools & MCP → enable **siteglide-test** → reload the window
- **Other tools:** enable the **siteglide-test** MCP server in that product's MCP settings

Commands use the \`siteglide-cli-test\` prefix, e.g.:

- \`siteglide-cli-test pull staging\`
- \`siteglide-cli-test mcp\`
- \`siteglide-cli-test-mcp\` (same MCP launcher Cursor uses)

## Uninstall later

\`\`\`powershell
npm uninstall -g @siteglide/siteglide-cli-test
\`\`\`

Your normal \`siteglide-cli\` is unchanged.
`;

	await fs.writeFile(path.join(STAGE, 'INSTALL.md'), installMd);

	const aiPrompt = `Please install this Siteglide CLI TEST preview for me.

1. Open the folder that contains INSTALL.md (after unzipping if needed).
2. Run: cd siteglide-mcp && npm install
3. Run: cd ../siteglide-cli-test && npm install && npm install -g .
4. Confirm \`siteglide-cli-test --version\` works.
5. Do not remove or overwrite the normal siteglide-cli package.
6. Do not create or edit mcp.json by hand — pull writes IDE MCP config.
7. When I am ready (site folder open; environment added if needed), run a first pull from that site, e.g. siteglide-cli-test pull staging.
8. After pull finishes, prompt me to enable the Siteglide test MCP server in my AI tool settings (e.g. Cursor: Settings → Tools & MCP → enable siteglide-test) and reload the window if tools do not appear.

This is a test build; commands are siteglide-cli-test (not siteglide-cli).
`;
	await fs.writeFile(path.join(STAGE, 'ASK-AI-TO-INSTALL.txt'), aiPrompt);

	const zipPath = path.join(OUT_ROOT, ZIP_NAME);
	await fs.remove(zipPath);

	console.log('Creating zip…');
	// Use PowerShell Compress-Archive on Windows for reliability without extra deps
	if (process.platform === 'win32') {
		execFileSync(
			'powershell.exe',
			[
				'-NoProfile',
				'-Command',
				`Compress-Archive -Path '${STAGE.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`
			],
			{ stdio: 'inherit' }
		);
	} else {
		execFileSync('zip', ['-r', zipPath, '.'], { cwd: STAGE, stdio: 'inherit' });
	}

	const stat = await fs.stat(zipPath);
	console.log(`Done: ${zipPath}`);
	console.log(`Size: ${(stat.size / (1024 * 1024)).toFixed(1)} MB`);
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
