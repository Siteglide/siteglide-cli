#!/usr/bin/env node

const express = require('express'),
	compression = require('compression'),
	bodyParser = require('body-parser'),
	Gateway = require('./lib/proxy'),
	logger = require('./lib/logger');

const start = (env) => {
	const port = env.PORT || 3333;
	const app = express();

	const gateway = new Gateway({
		url: env.SITEGLIDE_URL,
		token: env.SITEGLIDE_TOKEN,
		email: env.SITEGLIDE_EMAIL
	});

	app.use(bodyParser.json());
	app.use(compression());
	app.use('/gui/graphql', express.static(__dirname + '/gui/graphql/public'));

	// INFO
	const info = (req, res) => {
		return res.send(JSON.stringify({ SG_URL: env.SITEGLIDE_URL }));
	};

	app.get('/info', info);

	// GRAPHQL
	const graphqlRouting = (req, res) => {
		gateway
			.graph(req.body)
			.then(body => res.send(body))
			.catch(error => res.send(error));
	};

	app.post('/graphql', graphqlRouting);
	app.post('/api/graph', graphqlRouting);

	app.listen(port, err => {
		if (err) {
			logger.Error(`Something wrong happened when trying to run Express server: ${err}`);
		}

		logger.Debug(`Server is listening on ${port}`);
		logger.Success(`Connected to ${env.SITEGLIDE_URL}`);
		logger.Success(`GraphQL Browser: http://localhost:${port}/gui/graphql`);
	});
};

module.exports = {
	start: start
};