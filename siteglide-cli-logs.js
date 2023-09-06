#!/usr/bin/env node

const program = require('commander'),
	EventEmitter = require('events'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	logger = require('./lib/logger'),
	url = require('url'),
	Gateway = require('./lib/proxy');

class LogStream extends EventEmitter {
	constructor(authData) {
		super();
		this.authData = authData;
		this.gateway = new Gateway(authData);
	}

	start() {
		logger.Info('Live logging is starting. \n');
		this.fetchData();
	}

	fetchData() {
		this.gateway.logs({ lastId: storage.lastId }).then((response) => {
			const logs = response && response.logs;
			if (!logs) {
				return false;
			}

			for (let k in logs) {
				const row = logs[k];
				const filter = !!program.opts().filter && program.opts().filter.toLowerCase();
				const errorType = (row.error_type || 'error').toLowerCase();

				if (!!program.opts().filter && filter !== errorType) continue;

				if (!storage.exists(row.id)) {
					storage.add(row);
					this.emit('message', row);
				}
			}
			setTimeout(() => this.fetchData(), 7500);
		});
	}
}

const storage = {
	logs: {},
	lastId: 0,
	add: item => {
		storage.logs[item.id] = item;
		storage.lastId = item.id;
	},
	exists: key => storage.logs.hasOwnProperty(key)
};

program
	.arguments('[environment]', 'name of environment. Example: staging')
	.name('siteglide-cli logs')
	.usage('<env> [options]')
	.description("This command will output the last 20 logs and then a live list of logs from your site. Logs are written by using the log liquid code, for example: {% log 'Hello World!' -%} .")
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-f --filter <log type>', 'display only logs of given type, example: error')
	.option('-q --quiet', 'show only log message, without context')
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;

		const authData = fetchAuthData(environment, program);
		const stream = new LogStream(authData);

		stream.on('message', ({ created_at, error_type, message, data }) => {
			if (message == null) message = '';

			const options = { exit: false, hideTimestamp: true };
			const msg = typeof message === 'object'? message.body : message;
			const text = `[${created_at.replace('T', ' ')}] - ${error_type}: ${msg.replace(/\n$/, '')}`;

			if(error_type==='error') {
				logger.Error(text, options);
			}else{
				logger.Info(text, options);
			}
			if (!program.opts().quiet) {
				let parts = [];
				if(data) {
					if (data.url) {
						requestUrl = url.parse(`https://${data.url}`);
						let line = `path: ${requestUrl.pathname}`;
						if (requestUrl.search) line += `${requestUrl.search}`;
						parts.push(line);
					}
					if (data.page) parts.push(`page: ${data.page}`);
					if (data.partial) parts.push(`partial: ${data.partial}`);
					if (data.user && data.user.email) parts.push(`email: ${data.user.email}`);
					if (parts.length > 0) logger.Quiet(parts.join(' | '), options);
				}
			}
		});

		stream.start();
	});

program.parse(process.argv);