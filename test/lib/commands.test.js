var sh = require('shelljs');
var silentState = sh.config.silent; // save old silent state

test('should return error for missing command on stdout', ()  => {
  sh.config.silent = true;
  let command = sh.exec('./siteglide-cli.js missing');
  expect(command.stderr).toEqual(expect.stringContaining('unknown command: missing'));
  sh.config.silent = silentState;
});

test('should run help on env add', ()  => {
  sh.config.silent = true;
  let command = sh.exec('./siteglide-cli.js env add');
  expect(command.code).toEqual(0);
  expect(command.stdout).toEqual(expect.stringContaining('Usage: siteglide-cli add [options] [command]'));
  sh.config.silent = silentState;
});

test('should run help on sync', ()  => {
  sh.config.silent = true;

  let command = sh.exec('./siteglide-cli.js sync');
  expect(command.code).toEqual(0);
  expect(command.stdout).toEqual(expect.stringContaining('Usage: siteglide-cli sync [environment] [options]'));
  sh.config.silent = silentState;
});
