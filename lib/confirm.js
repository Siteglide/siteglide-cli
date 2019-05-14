var rl = require('readline');

const Confirm = (question) => {
	var r = rl.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: false
	});
	return new Promise((resolve, error) => {
		r.question(question, answer => {
			r.close();
			resolve(answer);
		});
	})
};

module.exports = Confirm;