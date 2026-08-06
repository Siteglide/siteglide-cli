#!/usr/bin/env node

const express = require('express'),
	compression = require('compression'),
	bodyParser = require('body-parser'),
	Gateway = require('./lib/proxy'),
	logger = require('./lib/logger'),
	path = require('path'),
	version = require('./package.json').version;

const start = (env, command) => {
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

	var liquidRouting;

	if (command === 'gui') {
		liquidRouting = (req, res) => {
			gateway
				.liquid(req.body)
				.then(body => res.send(body))
				.catch(error => res.send(error));
		};
	}

	app.use(bodyParser.json());
	app.use(compression());

	if (command === 'gui') {
		app.use('/', express.static(path.resolve(__dirname, 'gui', 'next', 'build')));
	}
	app.use('/gui/graphql', express.static(path.resolve(__dirname, 'gui', 'graphql', 'public')));
	if (command === 'gui') {
		app.use('/gui/liquid', express.static(path.resolve(__dirname, 'gui', 'liquid', 'public')));
	}

	// INFO — MPKIT_URL/version for gui/next; SG_URL for legacy GraphiQL/Liquid status bars
	const info = (req, res) => {
		return res.send(JSON.stringify({
			MPKIT_URL: env.SITEGLIDE_URL,
			SG_URL: env.SITEGLIDE_URL,
			version: version
		}));
	};

	app.get('/info', info);
	app.post('/graphql', graphqlRouting);
	app.post('/api/graph', graphqlRouting);
	if (command === 'gui') {
		app.post('/api/liquid', liquidRouting);
		app.get('/api/liquid', liquidRouting);
		app.get('/api/logs', (req, res) => {
			gateway
				.logs({ lastId: req.query.lastId })
				.then(body => res.send(body))
				.catch(error => res.send(error));
		});

		// SPA fallback for gui/next client routes (after API + static mounts)
		app.get('*', (req, res, next) => {
			if (req.path.startsWith('/gui/') || req.path.startsWith('/api/') || req.path === '/info' || req.path === '/graphql') {
				return next();
			}
			res.sendFile(path.resolve(__dirname, 'gui', 'next', 'build', 'index.html'));
		});
	}

	gateway.ping().then(async () => {
		app.listen(port, function () {
			logger.Debug(`Server is listening on ${port}`);
			logger.Success(`Connected to ${env.SITEGLIDE_URL}`);
			if (command === 'gui') {
				logger.Success(`Admin: http://localhost:${port}`);
				logger.Success('---');
				logger.Success(`Instance Logs: http://localhost:${port}/logs`);
				logger.Success(`GraphiQL Editor: http://localhost:${port}/gui/graphql`);
				logger.Success(`Liquid Evaluator: http://localhost:${port}/gui/liquid`);
			} else {
				logger.Success(`GraphiQL Editor: http://localhost:${port}/gui/graphql`);
				logger.Warn('The graphql command is now deprecated and will be removed in a future update. Please switch to the new gui command to use the GraphiQL Editor and Liquid Evaluator.');
			}
		})
			.on('error', err => {
				if (err.errno === 'EADDRINUSE') {
					logger.Error(`Port ${port} is already in use.`, { exit: false });
					logger.Print('\n');
					logger.Warn('Please use -p <port> to run server on a different port.\n');
					logger.Warn('Example: siteglide-cli gui <env> -p 31337');
				} else {
					logger.Error(`Something wrong happened when trying to run Express server: ${err}`);
				}
			});
	});
};

module.exports = {
	start: start
};
