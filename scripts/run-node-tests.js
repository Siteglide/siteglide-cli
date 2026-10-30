#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const files = require('../test/nodeRunnerManifest.js').map((rel) => {
	return path.join(__dirname, '..', rel);
});

const result = spawnSync(process.execPath, ['--test', ...files], {
	stdio: 'inherit',
	env: process.env
});

process.exit(result.status == null ? 1 : result.status);
