const Gateway = require('../../lib/proxy');
const { runCli } = require('../helpers/runCli');
const { syncIntegrationPageRoundTrip } = require('../helpers/integrationSync');
const {
	resolveIntegrationContext,
	cliEnvForContext
} = require('../helpers/integrationProject');

const ctx = resolveIntegrationContext();
const CONFIRM_YES = 'Y\n';
const CLI_TIMEOUT_MS = 300000;

if (!ctx.ok) {
	console.warn(`\nMutating integration tests skipped: ${ctx.skipReason}\n`);
}

const describeMutating = ctx.ok ? describe : describe.skip;

describeMutating('mutating integration (sync, deploy, pull — dedicated test site only)', () => {
	const cliOpts = (extra = {}) => ({
		cwd: ctx.projectPath,
		env: cliEnvForContext(ctx, extra),
		input: CONFIRM_YES,
		timeout: CLI_TIMEOUT_MS
	});

	test('Gateway.sync uploads and deletes a disposable page', async () => {
		const gateway = new Gateway(ctx.auth);
		await syncIntegrationPageRoundTrip(gateway, ctx.projectPath);
	});

	test('deploy uploads codebase to staging', () => {
		const result = runCli(
			'siteglide-cli-deploy.js',
			[ctx.envName],
			cliOpts({
				SITEGLIDE_EMAIL: ctx.auth.email,
				SITEGLIDE_TOKEN: ctx.auth.token,
				SITEGLIDE_URL: ctx.auth.url,
				SITEGLIDE_ENV: ctx.envName
			})
		);

		expect(result.code).toEqual(0);
		expect(result.output).toMatch(/Deploying codebase succeeded|Deploy succeeded/i);
		expect(result.output).not.toMatch(ctx.auth.token);
	});

	test('pull refreshes site files from staging', () => {
		const pullArgs = [ctx.envName, '-i'];

		if (ctx.pullModule) {
			pullArgs.push('-m', ctx.pullModule);
		}

		const result = runCli('siteglide-cli-pull.js', pullArgs, cliOpts());

		expect(result.code).toEqual(0);
		expect(result.output).toMatch(/\[pull\] All steps finished|Pulled files/i);
		expect(result.output).not.toMatch(ctx.auth.token);
	});
});
