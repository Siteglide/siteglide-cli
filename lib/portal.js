const { apiRequest } = require('./apiRequest'),
	logger = require('./logger');

const PARTNER_PORTAL_HOST = process.env.PARTNER_PORTAL_HOST || 'https://api.siteglide.co.uk';

const Portal = {
	login: (email, password, url) => {
		logger.Debug('Portal.login ' + email + ' to ' + PARTNER_PORTAL_HOST);

		return apiRequest({
			uri: `${PARTNER_PORTAL_HOST}/api/cli/auth`,
			headers: { UserAuthorization: `${email}:${password}`, site: url },
			json: true
		});
	},
	HOST: PARTNER_PORTAL_HOST
};

module.exports = Portal;
