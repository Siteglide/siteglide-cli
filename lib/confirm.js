var rl = require('readline');

/**
 * Ask a question on stdin.
 * @param {string} question
 * @param {{ default?: string }} [opts] when default is set, pre-fills the input line for editing
 * @returns {Promise<string>}
 */
const Confirm = (question, opts = {}) => {
	const hasDefault = opts.default != null && String(opts.default).length > 0;
	var r = rl.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: hasDefault
	});
	return new Promise((resolve) => {
		r.question(question, answer => {
			r.close();
			const trimmed = typeof answer === 'string' ? answer.trim() : '';
			if (!trimmed && hasDefault) {
				resolve(String(opts.default));
				return;
			}
			resolve(answer);
		});
		if (hasDefault) {
			r.write(String(opts.default));
		}
	});
};
module.exports = Confirm;
