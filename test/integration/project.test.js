const Gateway = require('../../lib/proxy');
const { hostnameFromUrl } = require('../../lib/envClassification');
const { runCli } = require('../helpers/runCli');
const {
	resolveIntegrationContext,
	cliEnvForContext
} = require('../helpers/integrationProject');

const ctx = resolveIntegrationContext();

if (!ctx.ok) {
	console.warn(`\nIntegration tests skipped: ${ctx.skipReason}\n`);
}

const describeProject = ctx.ok ? describe : describe.skip;

describeProject('integration project (from local.json or SITEGLIDE_TEST_PROJECT)', () => {
	const cliOpts = () => ({
		cwd: ctx.projectPath,
		env: cliEnvForContext(ctx)
	});

	test('list prints configured environment (no network)', () => {
		const result = runCli('siteglide-cli-list.js', [], cliOpts());
		expect(result.code).toEqual(0);
		expect(result.output).toMatch(new RegExp(`\\[${ctx.envName}\\]`));
		expect(result.output).toMatch(hostnameFromUrl(ctx.auth.url));
		expect(result.output).not.toMatch(ctx.auth.token);
	});

	test('list --details includes staging classification for staging hostnames', () => {
		const result = runCli('siteglide-cli-list.js', ['--details'], cliOpts());
		expect(result.code).toEqual(0);
		expect(result.output).toMatch(new RegExp(`\\[${ctx.envName}\\]`));
		expect(result.output).toMatch(/classification=staging|classification=production/);
		expect(result.output).not.toMatch(ctx.auth.token);
	});

	test('Gateway.ping succeeds with project credentials', async () => {
		const gateway = new Gateway(ctx.auth);
		const response = await gateway.ping();
		expect(response).toBeDefined();
	});

	test('modules lists installed modules from live API', () => {
		const result = runCli('siteglide-cli-modules.js', [ctx.envName], cliOpts());
		expect(result.code).toEqual(0);
		expect(result.output).toMatch(/Installed modules:|There are no installed modules/);
		expect(result.output).not.toMatch(ctx.auth.token);
	});
});
