/**
 * Format nested pull child output for parent merge-first error messages.
 */

const MAX_CAPTURE_BYTES = 16384;

/**
 * @param {string} buf
 * @param {Buffer|string} chunk
 * @returns {string}
 */
function appendNestedPullCapture(buf, chunk) {
	const next = buf + String(chunk);
	if (next.length <= MAX_CAPTURE_BYTES) {
		return next;
	}
	return next.slice(-MAX_CAPTURE_BYTES);
}

/**
 * Prefer CLI error lines from nested pull stdout/stderr.
 *
 * @param {string} text
 * @param {number} [maxLines]
 * @returns {string}
 */
function formatNestedPullOutputTail(text, maxLines = 4) {
	const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	if (lines.length === 0) {
		return '';
	}
	const tagged = lines.filter((line) => {
		return (
			/\[pull\]/i.test(line)
			|| /\[Error\]/i.test(line)
			|| /\[Cancelled\]/i.test(line)
			|| /Pull failed/i.test(line)
			|| /fetch failed/i.test(line)
			|| /RequestError/i.test(line)
			|| /^✖\s/i.test(line)
		);
	});
	const pick = tagged.length > 0 ? tagged : lines;
	return pick.slice(-maxLines).join('\n');
}

/**
 * @param {number|null|undefined} code
 * @param {string} captured
 * @returns {string}
 */
function nestedPullFailureMessage(code, captured) {
	const exitLabel = code == null ? 'unknown' : String(code);
	const tail = formatNestedPullOutputTail(captured);
	if (tail) {
		return `Nested pull failed (exit ${exitLabel}):\n${tail}`;
	}
	return `Nested pull failed (exit ${exitLabel}). See the nested pull output above for details.`;
}

module.exports = {
	MAX_CAPTURE_BYTES,
	appendNestedPullCapture,
	formatNestedPullOutputTail,
	nestedPullFailureMessage
};
