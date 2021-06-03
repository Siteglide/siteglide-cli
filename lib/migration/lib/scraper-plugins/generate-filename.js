// This file is an adaptation of default bySiteStructure strategy
// https://github.com/website-scraper/node-website-scraper/blob/master/lib/filename-generator/by-site-structure.js

const path = require('path');
const mt = require('mime-types');
const utils = require('../utils');
const resourceTypes = require('website-scraper/lib/config/resource-types');
const resourceTypeExtensions = require('website-scraper/lib/config/resource-ext-by-type');

class GenerateFilename {
	apply(registerAction) {
		registerAction('generateFilename', ({ resource, responseData }) => {
			const resourceUrl = resource.getUrl();
			const host = utils.getHostFromUrl(resourceUrl);
			let filePath = utils.getFilepathFromUrl(resourceUrl);
			let extension = utils.getFilenameExtension(filePath);
			let query = utils.getQueryFromUrl(resourceUrl);
			const mimeExtension = mt.extension(responseData.mimeType);
			const viewsDirectory = 'marketplace_builder/views/pages'; // need to make dynamic so that it doesn't always write to root folder

			if (process.env.DEBUG === 'true') {
				console.log('Original data', {
					filePath,
					extension,
					mimeExtension
				});
			}

			if (extension === '') {
				//  Guess extension based on mime type
				if (mimeExtension === 'html') {
					filePath = `${viewsDirectory}/${filePath.replace(/ /g,'-')}/index.html`;
					if (process.env.DEBUG === 'true') {
						console.log('Final filePath (html, mime)', filePath);
					}
				} else {
					filePath = `marketplace_builder/assets/${filePath}.${mimeExtension}`;
					if (process.env.DEBUG === 'true') {
						console.log('Final filePath (non-html, mime)', filePath);
					}
				}
			} else if(extension === '.aspx') {
				// Use detected extension from path
				const fpArr = filePath.split('.');
				fpArr.pop();
				const dirPath = fpArr.join();
				filePath = `${viewsDirectory}/${dirPath.replace(/ /g,'-')}-${resourceUrl.split('?PageID=').pop().split('&')[0]}-${resourceUrl.split('&Page=').pop().split('&')[0]}/index.html`;
				if (process.env.DEBUG === 'true') {
					console.log('Final filePath (html, ext orig)', filePath);
				}
			} else {
				// Use detected extension from path
				if (mimeExtension === 'html') {
					const fpArr = filePath.split('.');
					fpArr.pop();
					const dirPath = fpArr.join();

					filePath = `${viewsDirectory}/${dirPath.replace(/ /g,'-')}/index.html`;
					if (process.env.DEBUG === 'true') {
						console.log('Final filePath (html, ext orig)', filePath);
					}
				} else {
					filePath = `marketplace_builder/assets/${filePath}`;
					if (resourceUrl.includes('?Action=thumbnail')){
						if(
							(query.find(item => item.includes('Width=')))||
							(query.find(item => item.includes('Height=')))
						){
							let width = query.find(item => item.includes('Width=')).split('=')[1];
							let height = query.find(item => item.includes('Height=')).split('=')[1];
							filePath = `${filePath.split(extension)[0]}-${width}x${height}${extension}`;
						}
					}
					if (process.env.DEBUG === 'true') {
						console.log('Final filePath (non-html, ext orig)', filePath);
					}
				}
			}

			return { filename: utils.sanitizeFilepath(filePath) };
		});
	}
}

module.exports = GenerateFilename;
