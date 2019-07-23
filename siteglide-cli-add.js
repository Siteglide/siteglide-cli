#!/usr/bin/env node

const program = require('commander'),
  fs = require('fs'),
  rl = require('readline'),
  logger = require('./lib/logger'),
  validate = require('./lib/validators'),
  version = require('./package.json').version,
  Portal = require('./lib/portal');

const checkParams = params => {
  validate.existence({
    argumentValue: params.email,
    argumentName: 'email',
    fail: program.help.bind(program)
  });
  validate.existence({
    argumentValue: params.url,
    argumentName: 'URL',
    fail: program.help.bind(program)
  });
  validate.email(params.email);

  if (params.url.slice(-1) != '/') {
    params.url = params.url + '/';
  }

  validate.url(params.url);
};

// turn to promise
const getPassword = () => {
  return new Promise((resolve, reject) => {
    const reader = rl.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    reader.stdoutMuted = true;
    reader.question('Password: ', password => {
      reader.close();
      logger.Info('');
      resolve(password);
    });

    reader._writeToOutput = stringToWrite => {
      (reader.stdoutMuted && reader.output.write('*')) || reader.output.write(stringToWrite);
    };
  });
};

const storeEnvironment = settings => {
  const environmentSettings = {
    [settings.endpoint]: {
      url: settings.url,
      token: settings.token,
      email: settings.email
    }
  };
  saveFile(Object.assign({}, existingSettings(process.env.CONFIG_FILE_PATH), environmentSettings));
};

const saveFile = settings => {
  fs.writeFileSync(process.env.CONFIG_FILE_PATH, JSON.stringify(settings, null, 2), err => {
    if (err) throw err;
  });
};

const existingSettings = configFilePath => {
  let settings = {};

  try {
    settings = JSON.parse(fs.readFileSync(configFilePath));
  } catch (e) {}

  return settings;
};

PARTNER_PORTAL_HOST = process.env.PARTNER_PORTAL_HOST || 'https://api.siteglide.co.uk';

program
  .version(version)
  .arguments('[environment]', 'name of environment. Example: staging')
  .option('--email <email>', 'Admin account email. Example: admin@example.com')
  .option('--url <url>', 'Site URL. Example: https://example.com')
  .option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
  .action((environment, params) => {
    process.env.CONFIG_FILE_PATH = params.configFile;
    checkParams(params);
    const settings = {
      url: params.url,
      endpoint: environment,
      email: params.email
    };

    getPassword().then(password => {
      logger.Info(`Asking ${PARTNER_PORTAL_HOST} for access token...`);

      Portal.login(params.email, password, params.url)
        .then(response => {
					const token = response;

          if (token!==undefined) {
            storeEnvironment(Object.assign(settings, {
              token
            }));
            logger.Success(`Environment ${environment} has been added successfully for the site ${params.url}`);
          }else{
						logger.Error(`Credentials correct but API Key has not been generated within Siteglide Admin.  Please visit your site in within portal to generate an API key`);
					}
        })
        .catch((err) => err.statusCode==422 ? logger.Error('Authentication Failed: Your Email Address or Password are incorrect') : logger.Error(`Authentication Failed: Please check that you have the correct permissions for ${params.url}`));
    });
	});

program.parse(process.argv);

validate.existence({
  argumentValue: program.args[0],
  argumentName: 'environment',
  fail: program.help.bind(program)
});
