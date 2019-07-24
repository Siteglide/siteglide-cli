const request = require('request-promise'),
	logger = require('./logger');

const Portal = {
	login: (email, password, url) => {
		logger.Debug('Portal.login ' + email + ' to ' + PARTNER_PORTAL_HOST);

		return request({
			url: `${PARTNER_PORTAL_HOST}/api/cli/auth`,
			headers: { UserAuthorization: `${email}:${password}`, site: url},
			json: true
		});
	}
};

module.exports = Portal;
