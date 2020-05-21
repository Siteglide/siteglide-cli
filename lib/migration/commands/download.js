const { normalizeUrl, getHostFromUrl } = require('../lib/utils');
const scrape = require('website-scraper');
const SaveToExistingDirectoryPlugin = require('website-scraper-existing-directory');
const GenerateFilename = require('../lib/scraper-plugins/generate-filename');
const ignore404 = require('../lib/scraper-plugins/ignore-404');

const ora = require('ora');

const root = url => getHostFromUrl(url).replace(/^www\./, '');

const isEligible = (currentUrl, domain) => {
	const rootDomain = root(currentUrl);
	const dynamic = /(.aspx|.php|.cgi|.cfm|.jsp|.asp)/.test(currentUrl);

	if (process.env.DEBUG === 'true') {
		console.log('Domain info', {
			rootDomain,
			domain,
			dynamic
		});
	}

	if (dynamic) return false;
	if (domain.indexOf(rootDomain) < 0) return false;

	return true;
};

const download = (url) => {
	const domain = getHostFromUrl(url);

	if (process.env.DEBUG === 'true') {
		console.log('URL', {
			url,
			domain
		});
	}

	return scrape({
		urls: [url],
		urlFilter: (currentUrl) => {
			if (!isEligible(currentUrl, domain)) return false;

			if (process.env.DEBUG === 'true') {
				console.log(`Fetching ${currentUrl}`);
			} else {
				process.stdout.write('.');
			}

			return true;
		},
		recursive: true,
		requestConcurrency: 15,
		maxRecursiveDepth: 5,
		directory: '.',
		prettifyUrls: true,
		plugins: [
			new SaveToExistingDirectoryPlugin(),
			new GenerateFilename(),
			new ignore404(),
		],
	});
};

const run = (program) => {
	return new Promise((resolve, reject) => {
		const normalizedUrl = normalizeUrl(program.url, { stripWWW: false });
		const spinner = ora(`Downloading ${normalizedUrl}`);
		download(normalizedUrl, program.url)
			.then(() => {
				console.log('');
				spinner.succeed(`Downloaded ${normalizedUrl}`);
				resolve();
			})
			.catch((error) => {
				spinner.fail(`Error: ${error}`);
				reject();
			});
	});
};

module.exports = {
	run
};