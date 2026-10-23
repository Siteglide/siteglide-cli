#!/usr/bin/env node
/**
 * Dev helper: list golden paths for format parity work (-compare on a live env).
 * Usage: node scripts/pull-format-oracle.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const listPath = path.join(root, 'test/fixtures/pull-serialize/README/paths.txt');

if (!fs.existsSync(listPath)) {
	console.error('Missing test/fixtures/pull-serialize/README/paths.txt');
	process.exit(1);
}

const paths = fs.readFileSync(listPath, 'utf8')
	.split(/\r?\n/)
	.map((line) => line.trim())
	.filter(Boolean);

console.log('Oracle checklist (run sync -compare with one path at a time on staging):');
for (const p of paths) {
	console.log(`  ${p}`);
}
