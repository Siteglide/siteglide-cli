/**
 * Pull always wins over read-only hints: clear the write bit before overwriting so
 * marking is a nudge to developers (reference-only), not a lock against the CLI.
 */

const fs = require('fs-extra');
const path = require('path');
const { makeWritable, makeWritableSync } = require('./fileReadOnly');

/**
 * Recursively clear read-only on every file under `dirPath` (not directories).
 *
 * @param {string} dirPath
 * @returns {Promise<void>}
 */
const makeFilesWritableUnder = async (dirPath) => {
	if (!(await fs.pathExists(dirPath))) {
		return;
	}
	const walk = async (current) => {
		const entries = await fs.readdir(current);
		for (let i = 0; i < entries.length; i++) {
			const fullPath = path.join(current, entries[i]);
			const stats = await fs.lstat(fullPath);
			if (stats.isDirectory()) {
				await walk(fullPath);
			} else if (stats.isFile()) {
				await makeWritable(fullPath);
			}
		}
	};
	await walk(path.resolve(dirPath));
};

/**
 * Before `fs.copy` / unzip into an existing path, clear read-only on what will be replaced.
 *
 * @param {string} destPath
 * @returns {Promise<void>}
 */
const prepareDestForPullOverwrite = async (destPath) => {
	if (!(await fs.pathExists(destPath))) {
		return;
	}
	const stats = await fs.stat(destPath);
	if (stats.isDirectory()) {
		await makeFilesWritableUnder(destPath);
	} else {
		await makeWritable(destPath);
	}
};

/**
 * @param {string} src
 * @param {string} dest
 * @returns {Promise<void>}
 */
const copyForPullOverwrite = async (src, dest) => {
	await prepareDestForPullOverwrite(dest);
	await fs.copy(src, dest, { overwrite: true });
};

/**
 * @param {string} filePath
 * @param {string | Buffer} body
 * @param {(path: string, data: string | Buffer) => void} writeSync
 * @returns {void}
 */
const writeFileSyncForPullOverwrite = (filePath, body, writeSync) => {
	makeWritableSync(filePath);
	writeSync(filePath, body);
};

module.exports = {
	makeFilesWritableUnder,
	prepareDestForPullOverwrite,
	copyForPullOverwrite,
	writeFileSyncForPullOverwrite
};
