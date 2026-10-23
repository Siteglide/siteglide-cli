/**
 * Interactive CLI prompts via @inquirer/prompts (arrow-key select, input, confirm).
 */

const { select, input, confirm, checkbox } = require('@inquirer/prompts');
const { ExitPromptError, makeTheme } = require('@inquirer/core');
const { styleText } = require('node:util');
const chalk = require('chalk');
const logger = require('./logger');
const { applyCliColour } = require('./cliColour');
const { copyToClipboard } = require('./clipboard');

const COPY_AI_PROMPT_VALUE = 'copy_ai_prompt';

/** @type {Record<'select' | 'checkbox' | 'confirm' | 'input', string>} */
const PROMPT_HINTS = {
	select: 'Select one. Use arrow keys to navigate, Enter to select.',
	checkbox: 'Select multiple. Arrow keys to navigate, space to toggle, enter to confirm.',
	confirm: 'Enter Y or n.',
	input: 'Type and press enter.'
};

/** Keyboard help and defaults stay bold (white), not dim — same weight as decision titles. */
const CLI_PROMPT_THEME = {
	style: {
		help: (text) => styleText('bold', text),
		message: (text) => styleText('bold', text),
		defaultAnswer: (text) => styleText('bold', text),
		confirmDefault: (text) => styleText('bold', text),
		keysHelpTip: (keys) => keys
			.map(([key, action]) => `${styleText('bold', key)} ${styleText('bold', action)}`)
			.join(' • ')
	}
};

/**
 * @param {object} [opts]
 * @returns {object}
 */
function withCliPromptTheme(opts = {}) {
	return {
		...opts,
		theme: makeTheme(CLI_PROMPT_THEME, opts.theme)
	};
}

/**
 * @param {'select' | 'checkbox' | 'confirm' | 'input'} kind
 */
function printPromptHint(kind) {
	if (!process.stdin.isTTY || process.env.CI) {
		return;
	}
	const hint = PROMPT_HINTS[kind];
	if (!hint) {
		return;
	}
	logger.Print(`${chalk.bold.white(hint)}\n`);
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isPromptCancel(err) {
	return err instanceof ExitPromptError
		|| (err && (err.name === 'ExitPromptError' || err.code === 'EXIT_PROMPT'));
}

/**
 * Choice entry for select menus — use value {@link COPY_AI_PROMPT_VALUE}.
 * @param {{ name?: string, description?: string, value?: string }} [opts]
 * @returns {{ name: string, value: string, description: string }}
 */
function copyAiPromptChoice(opts = {}) {
	return {
		name: opts.name || 'Copy AI prompt to clipboard',
		value: opts.value || COPY_AI_PROMPT_VALUE,
		description:
			opts.description
			|| 'Copies a ready-made prompt you can paste into Cursor or Claude chat'
	};
}

/**
 * Write an AI prompt to the system clipboard and log the result.
 * @param {string} promptText
 * @param {{ successMessage?: string }} [opts]
 * @returns {{ ok: boolean, error?: string }}
 */
function copyAiPrompt(promptText, opts = {}) {
	const result = copyToClipboard(promptText);
	if (result.ok) {
		logger.Success(
			opts.successMessage
				|| applyCliColour('info', '[clipboard] AI prompt copied --- paste it into AI chat.')
		);
	} else {
		logger.Warn(
			`[clipboard] Could not copy AI prompt: ${result.error || 'unknown error'}`,
			{ exit: false }
		);
	}
	return result;
}

/**
 * Ask whether to copy, then copy if the user agrees.
 * @param {string} promptText
 * @param {{ confirmMessage?: string, default?: boolean, successMessage?: string }} [opts]
 * @returns {Promise<{ copied: boolean, skipped?: boolean, cancelled?: boolean, error?: string }>}
 */
async function offerCopyAiPrompt(promptText, opts = {}) {
	const confirmOpts = opts.default !== undefined ? { default: opts.default } : {};
	const answer = await confirmYesNo(
		opts.confirmMessage || 'Copy AI prompt to clipboard?',
		confirmOpts
	);
	if (answer == null) {
		return { copied: false, cancelled: true };
	}
	if (!answer) {
		return { copied: false, skipped: true };
	}
	const result = copyAiPrompt(promptText, { successMessage: opts.successMessage });
	return { copied: result.ok, error: result.error };
}

/**
 * Radio-style list. Returns choice value, or null if user cancels (Ctrl+C).
 * @param {string} message
 * @param {{ name: string, value: string, description?: string }[]} choices
 * @param {{ default?: string }} [opts]
 * @returns {Promise<string | null>}
 */
async function selectChoice(message, choices, opts = {}) {
	printPromptHint('select');
	try {
		return await select(withCliPromptTheme({
			message,
			choices,
			default: opts.default
		}));
	} catch (err) {
		if (isPromptCancel(err)) {
			return null;
		}
		throw err;
	}
}

/**
 * Free-text input with optional default (prefilled / used on empty Enter).
 * @param {string} message
 * @param {{ default?: string }} [opts]
 * @returns {Promise<string | null>}
 */
async function inputText(message, opts = {}) {
	printPromptHint('input');
	try {
		const value = await input(withCliPromptTheme({
			message,
			default: opts.default
		}));
		return typeof value === 'string' ? value : String(value || '');
	} catch (err) {
		if (isPromptCancel(err)) {
			return null;
		}
		throw err;
	}
}

/**
 * Multi-select checkbox list. Returns selected values, or null if user cancels (Ctrl+C).
 * @param {string} message
 * @param {{ name: string, value: string, checked?: boolean, disabled?: boolean | string }[]} choices
 * @param {{ required?: boolean, loop?: boolean }} [opts]
 * @returns {Promise<string[] | null>}
 */
async function selectCheckbox(message, choices, opts = {}) {
	printPromptHint('checkbox');
	try {
		return await checkbox(withCliPromptTheme({
			message,
			choices,
			required: opts.required !== false,
			loop: opts.loop !== false
		}));
	} catch (err) {
		if (isPromptCancel(err)) {
			return null;
		}
		throw err;
	}
}

/**
 * Yes/No confirm. Returns null on cancel.
 * @param {string} message
 * @param {{ default?: boolean }} [opts]
 * @returns {Promise<boolean | null>}
 */
async function confirmYesNo(message, opts = {}) {
	printPromptHint('confirm');
	try {
		const confirmOpts = withCliPromptTheme({ message });
		if (opts.default !== undefined) {
			confirmOpts.default = opts.default;
		}
		return await confirm(confirmOpts);
	} catch (err) {
		if (isPromptCancel(err)) {
			return null;
		}
		throw err;
	}
}

module.exports = {
	COPY_AI_PROMPT_VALUE,
	PROMPT_HINTS,
	CLI_PROMPT_THEME,
	withCliPromptTheme,
	copyAiPromptChoice,
	copyAiPrompt,
	offerCopyAiPrompt,
	selectChoice,
	selectCheckbox,
	inputText,
	confirmYesNo,
	isPromptCancel
};
