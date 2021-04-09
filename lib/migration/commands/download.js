const { normalizeUrl, getHostFromUrl } = require('../lib/utils');
const scrape = require('website-scraper');
const SaveToExistingDirectoryPlugin = require('website-scraper-existing-directory');
const GenerateFilename = require('../lib/scraper-plugins/generate-filename');
const ignore404 = require('../lib/scraper-plugins/ignore-404');
const parseArgs = require('minimist')
const ora = require('ora');

const root = url => getHostFromUrl(url).replace(/^www\./, '');

const isEligible = (currentUrl, domain) => {
	const rootDomain = root(currentUrl);
	const dynamic = /(.php|.cgi|.cfm|.jsp|.ashx)/.test(currentUrl);

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

const download = (url, maxRecursiveDepth) => {
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

			if (currentUrl.includes('LogOutProcess.aspx')) return false;
			if (currentUrl.includes('FavoriteProcess.aspx')) return false;
			if (currentUrl.includes('LiteratureRetrieve.aspx')) return false;
			if (currentUrl.includes('RSSRetrieve.aspx')) return false;
			if (currentUrl.includes('BookingRetrieve.aspx')) return false;

			if (process.env.DEBUG === 'true') {
				console.log(`Fetching ${currentUrl}`);
			} else {
				process.stdout.write('.');
			}

			let args = parseArgs(process.argv);
			if(
				(args.i)||
				(args.ignore)
			){
				let ignore = args.i ? args.i : args.ignore;
				if(typeof ignore === 'string'){
					if(currentUrl.includes(ignore)) return false;
				}else{
					for(var i=0;i<ignore.length;i++){
						if(currentUrl.includes(ignore[i])) return false
					}
				}
			}

			return true;
		},
		request: {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:77.0) Gecko/20100101 Firefox/77.0'
			}
		},
		recursive: true,
		requestConcurrency: 5,
		maxRecursiveDepth: maxRecursiveDepth,
		directory: '.',
		prettifyUrls: true,
		plugins: [
			new SaveToExistingDirectoryPlugin(),
			new GenerateFilename(),
			new ignore404(),
		],
		sources: [
			{ selector: 'style' },
			{ selector: '[style]', attr: 'style' },
			{ selector: 'img', attr: 'src' },
			{ selector: 'img', attr: 'srcset' },
			{ selector: 'img', attr: 'data-src' },
			{ selector: 'img', attr: 'data-muse-src' }, //Support for Adobe Muse
			{ selector: 'img', attr: 'data-orig-src' }, //Support for Adobe Muse
			{ selector: 'input', attr: 'src' },
			{ selector: 'object', attr: 'data' },
			{ selector: 'embed', attr: 'src' },
			{ selector: 'param[name="movie"]', attr: 'value' },
			{ selector: 'script', attr: 'src' },
			{ selector: 'script', attr: 'data-main'}, //Support for Adobe Muse
			{ selector: 'link[rel="stylesheet"]', attr: 'href' },
			{ selector: 'link[rel="StyleSheet"]', attr: 'href' }, //Support for BC Module Stlyesheets file
			{ selector: 'link[rel*="icon"]', attr: 'href' },
			{ selector: 'svg *[xlink\\:href]', attr: 'xlink:href' },
			{ selector: 'svg *[href]', attr: 'href' },
			{ selector: 'picture source', attr: 'srcset' },
			{ selector: 'meta[property="og\\:image"]', attr: 'content' },
			{ selector: 'meta[property="og\\:image\\:url"]', attr: 'content' },
			{ selector: 'meta[property="og\\:image\\:secure_url"]', attr: 'content' },
			{ selector: 'meta[property="og\\:audio"]', attr: 'content' },
			{ selector: 'meta[property="og\\:audio\\:url"]', attr: 'content' },
			{ selector: 'meta[property="og\\:audio\\:secure_url"]', attr: 'content' },
			{ selector: 'meta[property="og\\:video"]', attr: 'content' },
			{ selector: 'meta[property="og\\:video\\:url"]', attr: 'content' },
			{ selector: 'meta[property="og\\:video\\:secure_url"]', attr: 'content' },
			{ selector: 'video', attr: 'src' },
			{ selector: 'video source', attr: 'src' },
			{ selector: 'video track', attr: 'src' },
			{ selector: 'audio', attr: 'src' },
			{ selector: 'audio source', attr: 'src' },
			{ selector: 'audio track', attr: 'src' },
			{ selector: 'frame', attr: 'src' },
			{ selector: 'iframe', attr: 'src' },
			{ selector: '[background]', attr: 'background' }
		],
	});
};

const run = (program) => {
	return new Promise((resolve, reject) => {
		const normalizedUrl = normalizeUrl(program.url, { stripWWW: false });
		const spinner = ora({text:`Downloading ${normalizedUrl}` });
		spinner.start();
		download(normalizedUrl, program.maxRecursiveDepth)
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