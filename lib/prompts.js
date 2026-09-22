/**
 * Interactive CLI prompts via @inquirer/prompts (arrow-key select, input, confirm).
 */

const { select, input, confirm } = require('@inquirer/prompts');
const { ExitPromptError } = require('@inquirer/core');
const logger = require('./logger');
const { copyToClipboard } = require('./clipboard');

const COPY_AI_PROMPT_VALUE = 'copy_ai_prompt';

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
			opts.successMessage || '[clipboard] AI prompt copied --- paste it into AI chat.'
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
 * @param {{ confirmMessage?: string, default?: boolean }} [opts]
 * @returns {Promise<{ copied: boolean, skipped?: boolean, cancelled?: boolean, error?: string }>}
 */
async function offerCopyAiPrompt(promptText, opts = {}) {
	const answer = await confirmYesNo(
		opts.confirmMessage || 'Copy AI prompt to clipboard?',
		{ default: opts.default !== false }
	);
	if (answer == null) {
		return { copied: false, cancelled: true };
	}
	if (!answer) {
		return { copied: false, skipped: true };
	}
	const result = copyAiPrompt(promptText);
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
	try {
		return await select({
			message,
			choices,
			default: opts.default
		});
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
	try {
		const value = await input({
			message,
			default: opts.default
		});
		return typeof value === 'string' ? value : String(value || '');
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
	try {
		return await confirm({
			message,
			default: opts.default !== false
		});
	} catch (err) {
		if (isPromptCancel(err)) {
			return null;
		}
		throw err;
	}
}

module.exports = {
	COPY_AI_PROMPT_VALUE,
	copyAiPromptChoice,
	copyAiPrompt,
	offerCopyAiPrompt,
	selectChoice,
	inputText,
	confirmYesNo,
	isPromptCancel
};
