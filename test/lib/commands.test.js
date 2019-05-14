var sh = require('shelljs');
var silentState = sh.config.silent; // save old silent state

test('should return error for missing command on stdout', ()  => {
  sh.config.silent = true;
  let command = sh.exec('./siteglide.js missing');
  expect(command.stderr).toEqual(expect.stringContaining('unknown command: missing'));
  sh.config.silent = silentState;
});


// test('should run env list', ()  => {
//   sh.config.silent = true;
//   let command = sh.exec('./siteglide.js env list');
//   expect(command.code).toEqual(1);
//   expect(command.stderr).toEqual(expect.stringContaining('No environments registered yet, please see siteglide-cli env add'));
//   sh.config.silent = silentState;
// });

test('should run help on env add', ()  => {
  sh.config.silent = true;
  let command = sh.exec('./siteglide.js env add');
  expect(command.code).toEqual(0);
  expect(command.stdout).toEqual(expect.stringContaining('Usage: siteglide [options] [command]'));
  sh.config.silent = silentState;
});

// test('should run help on gui serve', ()  => {
//   sh.config.silent = true;
//   let command = sh.exec('./siteglide.js gui serve');
//   expect(command.code).toEqual(0);
//   expect(command.stdout).toEqual(expect.stringContaining('Usage: siteglide-cli-gui-serve [options] [environment]'));
//   sh.config.silent = silentState;
// });

// test('should run help on logs', ()  => {
//   sh.config.silent = true;

//   let command = sh.exec('./siteglide.js logs');
//   expect(command.code).toEqual(0);
//   expect(command.stdout).toEqual(expect.stringContaining('Usage: siteglide-cli-logs [options] [environment]'));
//   sh.config.silent = silentState;
// });


test('should run help on sync', ()  => {
  sh.config.silent = true;

  let command = sh.exec('./siteglide.js sync');
  expect(command.code).toEqual(0);
  expect(command.stdout).toEqual(expect.stringContaining('Usage: siteglide-sync [options] [environment]'));
  sh.config.silent = silentState;
});
