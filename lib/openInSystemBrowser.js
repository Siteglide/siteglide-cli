/**
 * Open a URL in the OS default browser (not an IDE simple browser).
 * Terminal Ctrl+click is controlled by the IDE; -o / this helper is the reliable path.
 */

const { spawn } = require('child_process');
const open = require('open');

/**
 * @param {string} url
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function openInSystemBrowser(url) {
	try {
		if (process.platform === 'win32') {
			// `start` with an empty title opens the system-associated browser.
			await new Promise((resolve, reject) => {
				const child = spawn('cmd', ['/c', 'start', '', url], {
					detached: true,
					stdio: 'ignore',
					windowsHide: true
				});
				child.on('error', reject);
				child.unref();
				// start returns immediately when launched successfully
				resolve();
			});
			return { ok: true };
		}

		await open(url, { wait: false });
		return { ok: true };
	} catch (err) {
		try {
			await open(url, { wait: false });
			return { ok: true };
		} catch (fallbackErr) {
			return { ok: false, error: (fallbackErr && fallbackErr.message) || String(fallbackErr) };
		}
	}
}

module.exports = { openInSystemBrowser };
