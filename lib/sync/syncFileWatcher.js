/**
 * Chokidar wrapper for sync watch — supports pause/resume during merge-first pull.
 */

const chokidar = require('chokidar');

/** @type {import('chokidar').FSWatcher | null} */
let watcher = null;

/** @type {boolean} */
let paused = false;

/** @type {object | null} */
let lastConfig = null;

/**
 * @param {object} config
 * @param {string[]} config.directories
 * @param {object} config.options chokidar options
 * @param {(filePath: string) => void} config.onChange
 * @param {(filePath: string) => void} config.onAdd
 * @param {(filePath: string) => void} config.onUnlink
 */
function attach(config) {
	lastConfig = config;
	if (paused) {
		return;
	}
	if (watcher) {
		watcher.close();
	}
	watcher = chokidar.watch(config.directories, config.options);
	watcher.on('change', (fp) => {
		config.onChange(fp);
	});
	watcher.on('add', (fp) => {
		config.onAdd(fp);
	});
	watcher.on('unlink', (fp) => {
		config.onUnlink(fp);
	});
}

function pause() {
	paused = true;
	if (watcher) {
		watcher.close();
		watcher = null;
	}
}

function resume() {
	if (!lastConfig) {
		return;
	}
	paused = false;
	attach(lastConfig);
}

function isPaused() {
	return paused;
}

function close() {
	paused = false;
	lastConfig = null;
	if (watcher) {
		watcher.close();
		watcher = null;
	}
}

module.exports = {
	attach,
	pause,
	resume,
	isPaused,
	close
};
