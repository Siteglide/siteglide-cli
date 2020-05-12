const fetch = require('node-fetch');

const Portal = {
	login: (email, password, url) => {
		return fetch('http://localhost:3000/api-staging/cli/auth', {
			headers: {
				UserAuthorization: `${email}:${password}`,
				site: url
			}
		}).then(async function(res){
			if(res.status/100===2){
				return await res.text();
			}
		})
	},
	HOST: 'https://api.siteglide.co.uk'
};

module.exports = Portal;
