#!/usr/bin/env node

const express = require('express'),
	compression = require('compression'),
	bodyParser = require('body-parser'),
	Gateway = require('./lib/proxy'),
	logger = require('./lib/logger'),
	path = require('path');

const start = (env) => {
	const port = env.PORT || 3333;
	const app = express();

	const gateway = new Gateway({
		url: env.SITEGLIDE_URL,
		token: env.SITEGLIDE_TOKEN,
		email: env.SITEGLIDE_EMAIL
	});

	const graphqlRouting = (req, res) => {
		gateway
			.graph(req.body)
			.then(body => res.send(body))
			.catch(error => res.send(error));
	};
	app.use(bodyParser.json());
	app.use(compression());

	app.use('/gui/graphql', express.static(path.resolve(__dirname, 'gui', 'graphql', 'public')));

	// INFO
	const info = (req, res) => {
		return res.send(JSON.stringify({ SG_URL: env.SITEGLIDE_URL }));
	};

	app.get('/info', info);
	app.post('/graphql', graphqlRouting);
	app.post('/api/graph', graphqlRouting);

	app.listen(port, function() {
		logger.Debug(`Server is listening on ${port}`);
		logger.Success(`Connected to ${env.SITEGLIDE_URL}`);
		logger.Success(`GraphQL Browser: http://localhost:${port}/gui/graphql`);
	})
	.on('error', err => {
		if (err.errno === 'EADDRINUSE') {
			logger.Error(`Port ${port} is already in use.`, { exit: false });
			logger.Print('\n');
			logger.Warn('Please use -p <port> to run server on a different port.\n');
			logger.Warn('Example: pos-cli gui serve staging -p 31337');
		} else {
			logger.Error(`Something wrong happened when trying to run Express server: ${err}`);
		}
	});
};

module.exports = {
	start: start
};