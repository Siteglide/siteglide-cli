const {
	MERGE_CONFLICT_AGENT_GUIDANCE,
	buildMergeConflictAiPrompt
} = require('../../lib/mergeConflictGuidance');

describe('mergeConflictGuidance', () => {
	test('agent guidance requires approval before git add', () => {
		expect(MERGE_CONFLICT_AGENT_GUIDANCE).toMatch(/verbally approves/);
		expect(MERGE_CONFLICT_AGENT_GUIDANCE).toMatch(/git add/);
		expect(MERGE_CONFLICT_AGENT_GUIDANCE).toMatch(/auto-commits/);
		expect(MERGE_CONFLICT_AGENT_GUIDANCE).toMatch(/no need to re-save/);
	});

	test('clipboard prompt asks for approval before git add', () => {
		const prompt = buildMergeConflictAiPrompt({ command: 'sync', environment: 'staging' });
		expect(prompt).toMatch(/explicit approval before any git add/);
		expect(prompt).toMatch(/Only after I approve/);
		expect(prompt).toMatch(/upload automatically/);
		expect(prompt).not.toMatch(/lastPullCommit/);
	});
});
