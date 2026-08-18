var rl = require('readline');

const createInterface = () => {
	return rl.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: false
	});
};

/**
 * @param {string} question
 * @returns {Promise<string>}
 */
const Ask = (question) => {
	const r = createInterface();
	return new Promise((resolve) => {
		r.question(question, (answer) => {
			r.close();
			resolve(answer);
		});
	});
};

/**
 * @param {string[]} branches
 * @param {string} [defaultBranch]
 * @returns {Promise<string|null>}
 */
const chooseBranch = async (branches, defaultBranch) => {
	if (!Array.isArray(branches) || branches.length === 0) {
		return null;
	}

	const fallback = defaultBranch && branches.indexOf(defaultBranch) !== -1
		? defaultBranch
		: branches[0];
	const defaultIndex = branches.indexOf(fallback) + 1;

	const lines = branches.map((branch, index) => {
		return `  ${index + 1}) ${branch}`;
	});

	const answer = await Ask(
		`Branches:\n${lines.join('\n')}\nChoose branch [${defaultIndex}]: `
	);
	const trimmed = String(answer || '').trim();
	if (!trimmed) {
		return fallback;
	}

	const asNumber = parseInt(trimmed, 10);
	if (!isNaN(asNumber) && asNumber >= 1 && asNumber <= branches.length) {
		return branches[asNumber - 1];
	}

	if (branches.indexOf(trimmed) !== -1) {
		return trimmed;
	}

	return fallback;
};

module.exports = {
	Ask,
	chooseBranch
};
