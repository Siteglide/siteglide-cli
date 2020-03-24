const request = require('request-promise'),
	logger = require('./logger');

const PARTNER_PORTAL_HOST = process.env.PARTNER_PORTAL_HOST || 'http://localhost:3000';

const Portal = {
	login: (email, password, url) => {
		logger.Debug('Portal.login ' + email + ' to ' + PARTNER_PORTAL_HOST);

		return request({
			url: `${PARTNER_PORTAL_HOST}/api/cli/auth`,
			headers: { UserAuthorization: `${email}:${password}`, site: url},
			json: true
		});
	},
	HOST: PARTNER_PORTAL_HOST
};

module.exports = Portal;
