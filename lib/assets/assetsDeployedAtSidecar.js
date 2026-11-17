/**
 * Child deploy process writes latest asset manifest floor for parent deploy command.
 */

const fs = require('fs');
const path = require('path');

const SIDECAR = '.tmp/siteglide-assets-deployed-at.json';

/**
 * @param {string} iso
 */
function writeAssetsDeployedAtSidecar(iso) {
	if (!iso) {
		return;
	}
	const filePath = path.join(process.cwd(), SIDECAR);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify({ assetsDeployedAt: iso })}\n`, 'utf8');
}

/**
 * @param {string} [cwd]
 * @returns {string | null}
 */
function readAssetsDeployedAtSidecar(cwd = process.cwd()) {
	const filePath = path.join(cwd, SIDECAR);
	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		const data = JSON.parse(raw);
		const iso = data && data.assetsDeployedAt;
		return iso ? String(iso) : null;
	} catch {
		return null;
	}
}

/**
 * @param {string} [cwd]
 */
function clearAssetsDeployedAtSidecar(cwd = process.cwd()) {
	const filePath = path.join(cwd, SIDECAR);
	try {
		fs.unlinkSync(filePath);
	} catch (err) {
		if (err && err.code !== 'ENOENT') {
			throw err;
		}
	}
}

module.exports = {
	SIDECAR,
	writeAssetsDeployedAtSidecar,
	readAssetsDeployedAtSidecar,
	clearAssetsDeployedAtSidecar
};