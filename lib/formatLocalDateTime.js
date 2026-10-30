/**
 * Format instants for CLI display in the local system timezone.
 * Machine-readable stores (baselines, logs JSON) should keep ISO UTC.
 */

/**
 * @param {Date} date
 * @returns {string} e.g. "BST" or "GMT+1"
 */
function localTimeZoneLabel(date) {
	try {
		const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
			.formatToParts(date)
			.find((p) => p.type === 'timeZoneName');
		if (part && part.value) {
			return part.value;
		}
	} catch {
		// fall through
	}
	const offsetMin = -date.getTimezoneOffset();
	const sign = offsetMin >= 0 ? '+' : '-';
	const abs = Math.abs(offsetMin);
	const hh = String(Math.floor(abs / 60)).padStart(2, '0');
	const mm = String(abs % 60).padStart(2, '0');
	return `UTC${sign}${hh}:${mm}`;
}

/**
 * @param {Date} date
 * @returns {string} e.g. "UTC+01:00"
 */
function localUtcOffsetLabel(date) {
	const offsetMin = -date.getTimezoneOffset();
	const sign = offsetMin >= 0 ? '+' : '-';
	const abs = Math.abs(offsetMin);
	const hh = String(Math.floor(abs / 60)).padStart(2, '0');
	const mm = String(abs % 60).padStart(2, '0');
	return `UTC${sign}${hh}:${mm}`;
}

/**
 * Human-readable local date-time with timezone clarity.
 * Example: "2026-08-12 15:40:22 BST (UTC+01:00)"
 *
 * @param {string | number | Date | null | undefined} value
 * @returns {string}
 */
function formatLocalDateTime(value) {
	if (value == null || value === '') {
		return 'unknown';
	}
	const date = value instanceof Date ? value : new Date(value);
	const ms = date.getTime();
	if (Number.isNaN(ms)) {
		return String(value);
	}

	const y = date.getFullYear();
	const mo = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	const h = String(date.getHours()).padStart(2, '0');
	const mi = String(date.getMinutes()).padStart(2, '0');
	const s = String(date.getSeconds()).padStart(2, '0');
	const tz = localTimeZoneLabel(date);
	const offset = localUtcOffsetLabel(date);

	if (tz === offset || tz.startsWith('UTC')) {
		return `${y}-${mo}-${d} ${h}:${mi}:${s} ${offset}`;
	}
	return `${y}-${mo}-${d} ${h}:${mi}:${s} ${tz} (${offset})`;
}

module.exports = {
	formatLocalDateTime,
	localTimeZoneLabel,
	localUtcOffsetLabel
};
