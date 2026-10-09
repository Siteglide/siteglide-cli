const {
	EXPERIENCE_OPTIONS,
	normalizeExperienceLevel,
	wantsExtraHelp
} = require('../../lib/experienceLevel');

describe('experienceLevel', () => {
	test('EXPERIENCE_OPTIONS are extra help and familiar', () => {
		expect(EXPERIENCE_OPTIONS).toEqual(['extra help', 'familiar']);
	});

	test('normalizes legacy beginner and advanced aliases', () => {
		expect(normalizeExperienceLevel('beginner')).toBe('extra help');
		expect(normalizeExperienceLevel('advanced')).toBe('familiar');
		expect(normalizeExperienceLevel('Extra Help')).toBe('extra help');
		expect(normalizeExperienceLevel('FAMILIAR')).toBe('familiar');
	});

	test('wantsExtraHelp accepts legacy beginner', () => {
		expect(wantsExtraHelp('beginner')).toBe(true);
		expect(wantsExtraHelp('familiar')).toBe(false);
		expect(wantsExtraHelp('advanced')).toBe(false);
	});
});
