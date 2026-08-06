const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const chalk = require('chalk');
const yaml = require('js-yaml');
const ora = require('ora');
const logger = require('./logger');

// Severity levels from platformos-check-node
const Severity = {
	ERROR: 0,
	WARNING: 1,
	INFO: 2
};

const loadPlatformosCheck = async () => {
	try {
		const platformosCheck = await import('@platformos/platformos-check-node');
		return platformosCheck;
	} catch (error) {
		logger.Error(
			'Failed to load @platformos/platformos-check-node.\n' +
			`${error && error.message ? error.message : error}\n` +
			'Ensure it is installed: npm install @platformos/platformos-check-node'
		);
	}
};

const validatePath = (checkPath) => {
	if (!fs.existsSync(checkPath)) {
		logger.Error(`Path does not exist: ${checkPath}`);
		return;
	}

	const stats = fs.statSync(checkPath);
	if (!stats.isDirectory()) {
		logger.Error(`Path is not a directory: ${checkPath}`);
	}
};

/**
 * Convert file:// URI to filesystem path
 */
const uriToPath = (uri) => {
	try {
		return fileURLToPath(uri);
	} catch {
		// Fallback for non-standard URIs
		return uri.replace('file://', '');
	}
};

/**
 * Get severity label
 */
const severityToLabel = (severity) => {
	switch (severity) {
		case Severity.ERROR:
			return 'error';
		case Severity.WARNING:
			return 'warning';
		case Severity.INFO:
			return 'info';
		default:
			return 'unknown';
	}
};

/**
 * Get code snippet from file (lines are 0-indexed from platformos-check)
 */
const getSnippet = (uri, startLine, endLine) => {
	try {
		const fsPath = uriToPath(uri);
		const fileContent = fs.readFileSync(fsPath, 'utf8');
		const lines = fileContent.split('\n');
		const snippetLines = lines.slice(startLine, endLine + 1);

		return snippetLines
			.map((line, index) => {
				const lineNumber = startLine + index + 1;
				const paddedLineNum = String(lineNumber).padStart(4, ' ');
				return `${paddedLineNum}  ${line}`;
			})
			.join('\n');
	} catch {
		return '';
	}
};

/**
 * Format a single offense with code snippet
 */
const formatOffense = (offense, basePath = null) => {
	let absolutePath = uriToPath(offense.uri);
	// Normalize path separators and resolve to absolute path
	absolutePath = path.normalize(absolutePath);

	let filePath = absolutePath;
	if (basePath) {
		const normalizedBase = path.normalize(path.resolve(basePath));
		filePath = path.relative(normalizedBase, absolutePath);
		// Convert backslashes to forward slashes for consistent output
		filePath = filePath.split(path.sep).join('/');
	}

	const severityLabel = severityToLabel(offense.severity);
	const location = `${filePath}:${offense.start.line + 1}:${offense.start.character}`;
	const snippet = getSnippet(offense.uri, offense.start.line, offense.end.line);

	return {
		location,
		message: offense.message,
		check: offense.check,
		severity: severityLabel,
		snippet,
		file: filePath
	};
};

/**
 * Sort offenses by severity (ERROR < WARNING < INFO)
 */
const sortBySeverity = (a, b) => a.severity - b.severity;

/**
 * Group and sort offenses by file, then by severity
 */
const groupOffensesByFile = (offenses, basePath = null) => {
	const grouped = {};

	offenses.forEach(offense => {
		let absolutePath = uriToPath(offense.uri);
		// Normalize path separators and resolve to absolute path
		absolutePath = path.normalize(absolutePath);

		let filePath = absolutePath;
		if (basePath) {
			const normalizedBase = path.normalize(path.resolve(basePath));
			filePath = path.relative(normalizedBase, absolutePath);
			// Convert backslashes to forward slashes for consistent output
			filePath = filePath.split(path.sep).join('/');
		}

		if (!grouped[filePath]) {
			grouped[filePath] = [];
		}
		grouped[filePath].push(offense);
	});

	// Sort offenses within each file by severity
	Object.keys(grouped).forEach(file => {
		grouped[file].sort(sortBySeverity);
	});

	return grouped;
};

/**
 * Count offenses by severity
 */
const countOffensesBySeverity = (offenses) => {
	return offenses.reduce((counts, offense) => {
		switch (offense.severity) {
			case Severity.ERROR:
				counts.errors++;
				break;
			case Severity.WARNING:
				counts.warnings++;
				break;
			case Severity.INFO:
				counts.info++;
				break;
		}
		return counts;
	}, { errors: 0, warnings: 0, info: 0 });
};

/**
 * Format and display offenses in text format
 */
const printTextOutput = (offenses, silent, basePath = null) => {
	if (offenses.length === 0) {
		if (!silent) {
			logger.Success('No offenses found.');
		}
		return;
	}

	const grouped = groupOffensesByFile(offenses, basePath);
	const fileCount = Object.keys(grouped).length;
	const counts = countOffensesBySeverity(offenses);

	// Print offenses grouped by file
	logger.Print('');
	const sortedFiles = Object.keys(grouped).sort();
	for (const file of sortedFiles) {
		logger.Print(chalk.bold.cyan(file));
		logger.Print('');

		for (const offense of grouped[file]) {
			const formatted = formatOffense(offense, basePath);

			// Print severity icon and check name
			let severityIcon, checkName;
			switch (offense.severity) {
				case Severity.ERROR:
					severityIcon = chalk.red.bold('✖');
					checkName = chalk.red.bold(formatted.check);
					break;
				case Severity.WARNING:
					severityIcon = chalk.yellow.bold('⚠');
					checkName = chalk.yellow.bold(formatted.check);
					break;
				case Severity.INFO:
					severityIcon = chalk.cyan.bold('ℹ');
					checkName = chalk.cyan.bold(formatted.check);
					break;
			}

			logger.Print(`${severityIcon}  ${checkName}`);
			logger.Print(chalk.gray(`  ${formatted.message}`));

			// Print code snippet if available
			if (formatted.snippet) {
				logger.Print('');
				logger.Print(chalk.gray(formatted.snippet));
			}

			logger.Print('');
		}
	}

	// Print summary at the end
	logger.Print(chalk.gray('─'.repeat(60)));
	logger.Print('');

	// Summary header
	const totalOffenses = offenses.length;
	const summaryHeader = `${totalOffenses} offense${totalOffenses === 1 ? '' : 's'} found in ${fileCount} file${fileCount === 1 ? '' : 's'}`;

	logger.Print(chalk.bold.white(summaryHeader));
	logger.Print('');

	// Count badges
	const badges = [];
	if (counts.errors > 0) {
		badges.push(chalk.red(`✖ ${counts.errors} error${counts.errors === 1 ? '' : 's'}`));
	}
	if (counts.warnings > 0) {
		badges.push(chalk.yellow(`⚠ ${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}`));
	}
	if (counts.info > 0) {
		badges.push(chalk.cyan(`ℹ ${counts.info} info`));
	}

	logger.Print('  ' + badges.join('  '));
	logger.Print('');
};

/**
 * Format offenses as JSON
 */
const printJsonOutput = (offenses, basePath = null) => {
	const grouped = groupOffensesByFile(offenses, basePath);

	const result = Object.entries(grouped).map(([filePath, fileOffenses]) => {
		const counts = countOffensesBySeverity(fileOffenses);

		return {
			path: filePath,
			offenses: fileOffenses.map(offense => ({
				check: offense.check,
				severity: severityToLabel(offense.severity),
				start_row: offense.start.line,
				start_column: offense.start.character,
				end_row: offense.end.line,
				end_column: offense.end.character,
				message: offense.message
			})),
			errorCount: counts.errors,
			warningCount: counts.warnings,
			infoCount: counts.info
		};
	});

	const totalCounts = countOffensesBySeverity(offenses);

	const output = {
		offenseCount: offenses.length,
		fileCount: Object.keys(grouped).length,
		errorCount: totalCounts.errors,
		warningCount: totalCounts.warnings,
		infoCount: totalCounts.info,
		files: result
	};

	logger.Print(JSON.stringify(output, null, 2));
};

/**
 * Add '#' character at the start of each line in a string
 */
const commentString = (input) => {
	return input
		.split('\n')
		.map(line => `# ${line}`)
		.join('\n');
};

/**
 * Initialize .platformos-check.yml configuration file
 */
const initConfig = async (rootPath) => {
	const configFileName = '.platformos-check.yml';
	const configFilePath = path.join(rootPath, configFileName);

	// Check if config file already exists
	if (fs.existsSync(configFilePath)) {
		logger.Info(`${configFileName} already exists at ${rootPath}`);
		return;
	}

	const platformosCheck = await loadPlatformosCheck();

	try {
		// Load default configuration
		const { settings } = await platformosCheck.loadConfig(undefined, rootPath);

		// Create the initial config that extends recommended settings
		const config = {
			extends: 'platformos-check:recommended',
			ignore: ['node_modules/**']
		};

		const initConfigYml = yaml.dump(config, { lineWidth: -1 });

		// Comment out all settings for user reference
		const settingsYml = commentString(yaml.dump(settings, { lineWidth: -1 }));

		// Combine: base config + commented settings
		const finalConfig = `${initConfigYml}\n# Below are all available settings with their default values:\n${settingsYml}`;

		// Write config file
		fs.writeFileSync(configFilePath, finalConfig, 'utf8');

		logger.Success(`Created ${configFileName} at ${rootPath}`);
	} catch (error) {
		logger.Error(`Error creating config file: ${error.message}`);
	}
};

/**
 * Download the latest platformOS Liquid documentation used by the linter
 */
const updateDocs = async () => {
	const platformosCheck = await loadPlatformosCheck();

	const spinner = ora({ text: 'Downloading platformOS Liquid docs...', stream: process.stdout });
	spinner.start();

	try {
		await platformosCheck.updateDocs((msg) => {
			if (msg) {
				spinner.text = msg;
			}
		});
		spinner.succeed('platformOS Liquid docs updated successfully.');
	} catch (error) {
		spinner.fail('Failed to update docs.');
		logger.Error(error.message);
	}
};

const run = async (opts) => {
	const { path: checkPath, autoFix, checks, format, silent } = opts;

	validatePath(checkPath);

	const platformosCheck = await loadPlatformosCheck();

	if (checks && checks.length > 0) {
		const validNames = new Set(platformosCheck.allChecks.map((c) => c.meta.code));
		const unknown = checks.filter((name) => !validNames.has(name));
		if (unknown.length > 0) {
			const available = Array.from(validNames).sort().join(', ');
			logger.Error(
				`Unknown check${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}\n` +
				`Available checks: ${available}`
			);
			return;
		}
	}

	let offenses = [];
	let spinner;
	let app;

	// Only show spinner for text output (not JSON)
	if (format !== 'json' && !silent) {
		spinner = ora({ text: 'Loading files...', stream: process.stdout });
		spinner.start();
	}

	try {
		// Run checks with progress callback
		const result = await platformosCheck.appCheckRun(checkPath, undefined, (message) => {
			if (spinner && message) {
				spinner.text = message;
			}
		});

		offenses = checks
			? result.offenses.filter((o) => checks.includes(o.check))
			: result.offenses;
		app = result.app;

		// Update spinner with completion info if it's still running
		if (spinner && spinner.isSpinning) {
			const fileCount = app.length;
			spinner.text = `Checked ${fileCount} file${fileCount === 1 ? '' : 's'}`;
		}

		if (autoFix && offenses.length > 0) {
			if (spinner) {
				spinner.text = `Applying automatic fixes to ${offenses.length} offense${offenses.length === 1 ? '' : 's'}...`;
			}
			await platformosCheck.autofix(app, offenses);

			// Re-run check after autofix to get updated offenses
			if (spinner) {
				spinner.text = 'Re-checking after fixes...';
			}
			const recheck = await platformosCheck.appCheckRun(checkPath);
			offenses = recheck.offenses;
		}

		if (spinner) {
			spinner.stop();
		}
	} catch (error) {
		if (spinner) {
			spinner.fail('Check failed');
		}
		logger.Error(`Error running platformos-check: ${error.message}\n${error.stack}`);
		return;
	}

	if (format === 'json') {
		printJsonOutput(offenses, checkPath);
	} else {
		printTextOutput(offenses, silent, checkPath);
	}

	if (offenses.length > 0) {
		process.exitCode = 1;
	}
};

module.exports = {
	run,
	initConfig,
	updateDocs
};
