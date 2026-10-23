/**
 * Cross-platform clipboard write (no extra npm dependency).
 * Windows: PowerShell Set-Clipboard
 * macOS: pbcopy
 * Linux: wl-copy, then xclip, then xsel
 */

const { spawnSync } = require('child_process');

/**
 * @param {string} text
 * @returns {{ ok: boolean, error?: string }}
 */
function copyToClipboard(text) {
	const value = text == null ? '' : String(text);

	if (process.platform === 'win32') {
		// UTF-8 stdin → Set-Clipboard (handles multiline / unicode better than clip.exe).
		const script = [
			'$ErrorActionPreference = \'Stop\'',
			'[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)',
			'$text = [Console]::In.ReadToEnd()',
			'Set-Clipboard -Value $text'
		].join('; ');
		const res = spawnSync(
			'powershell.exe',
			['-NoProfile', '-NonInteractive', '-Command', script],
			{ input: value, encoding: 'utf8', windowsHide: true }
		);
		if (res.status === 0) {
			return { ok: true };
		}
		return {
			ok: false,
			error: (res.stderr || res.stdout || 'PowerShell Set-Clipboard failed').trim()
		};
	}

	if (process.platform === 'darwin') {
		const res = spawnSync('pbcopy', [], { input: value, encoding: 'utf8' });
		if (res.status === 0) {
			return { ok: true };
		}
		return { ok: false, error: (res.stderr || res.stdout || 'pbcopy failed').trim() };
	}

	const linuxBins = [
		{ bin: 'wl-copy', args: [] },
		{ bin: 'xclip', args: ['-selection', 'clipboard'] },
		{ bin: 'xsel', args: ['--clipboard', '--input'] }
	];
	const errors = [];
	for (const { bin, args } of linuxBins) {
		const res = spawnSync(bin, args, { input: value, encoding: 'utf8' });
		if (res.error && res.error.code === 'ENOENT') {
			errors.push(`${bin} not found`);
			continue;
		}
		if (res.status === 0) {
			return { ok: true };
		}
		errors.push((res.stderr || res.stdout || `${bin} failed`).trim());
	}
	return {
		ok: false,
		error: errors.filter(Boolean).join('; ') || 'No clipboard utility available (wl-copy / xclip / xsel)'
	};
}

module.exports = {
	copyToClipboard
};
