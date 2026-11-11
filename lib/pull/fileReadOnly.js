/**
 * Developer hint after pull: discourage editing paths the CLI will replace on the next pull.
 * Not enforcement — pull clears these bits before every overwrite (see pullOverwrite.js).
 * On Windows, clearing/setting write bits maps to the read-only file attribute.
 * Directories stay writable so later pulls can add or replace children.
 */

const fs = require('fs-extra');

/**
 * @param {string} filePath
 * @returns {Promise<void>}
 */
const makeWritable = async (filePath) => {
	try {
		if (!(await fs.pathExists(filePath))) {
			return;
		}
		const stats = await fs.stat(filePath);
		if (stats.isDirectory()) {
			return;
		}
		await fs.chmod(filePath, stats.mode | 0o200);
	} catch (e) {
		// best effort — caller may log
	}
};

/**
 * @param {string} filePath
 * @returns {Promise<void>}
 */
const makeReadOnly = async (filePath) => {
	try {
		const stats = await fs.stat(filePath);
		if (stats.isDirectory()) {
			return;
		}
		await fs.chmod(filePath, stats.mode & ~0o222);
	} catch (e) {
		// best effort — caller may log
	}
};

/**
 * @param {string} filePath
 * @returns {void}
 */
const makeWritableSync = (filePath) => {
	if (!fs.existsSync(filePath)) {
		return;
	}
	try {
		const stats = fs.statSync(filePath);
		if (stats.isDirectory()) {
			return;
		}
		fs.chmodSync(filePath, stats.mode | 0o200);
	} catch (e) {
		// best effort
	}
};

/**
 * @param {string} filePath
 * @returns {void}
 */
const makeReadOnlySync = (filePath) => {
	try {
		fs.chmodSync(filePath, fs.statSync(filePath).mode & ~0o222);
	} catch (e) {
		// best effort
	}
};

module.exports = {
	makeWritable,
	makeReadOnly,
	makeWritableSync,
	makeReadOnlySync
};
