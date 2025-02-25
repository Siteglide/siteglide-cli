/*
  Steps
  step 0. a) get env in case need to pull or sync anything
  step 0. b) In future check if first-time setup of Tailwind, but for step now we'll assume it is. 
  step 0. c) Strongly recommend github and walk them through setting up local repo before proceeding. This will help them undo anything we do wrong!!
  step 1. a) Find modules - check if user wants to set up Tailwind for them.
  step 1. b) check them for views/partials/sitebuilder/step module_registry- if they have package.json but not step module_registry, then b)
  step 1. c) Possibly need to do siteglide-cli pull -m module_86?
  step 2. Read the yaml
  Step 3. Confirm for each module.
  step 4. In each module, move the files out of assets/config/open_me step into the module_folder location
  step 5. Check the default output paths are okay with the user. Edit step the -o path in scripts if not
  step 6. Check root for package.json file
  step 7. If package.json file already exists, merge
  step 8. If not, create
  step 9. Run npm i
  step 10. Ask if they want to deploy changes? Do so if yes. Maybe
  */

import { opendir, readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import yaml from 'js-yaml';
import {spawn, spawnSync} from 'child_process';
import command from './lib/command.js';
import {fetchSettings} from './lib/settings.js';
import program from 'commander';
import cli_package_json from './package.json' with { type: "json" };
import {confirm, checkbox, input} from '@inquirer/prompts';



const child_process = {spawn, spawnSync};
const fetchAuthData = fetchSettings;
const version = cli_package_json.version;

//DEFINE PROGRAM

program
.version(version, '-v, --version')
.name('siteglide-cli sitebuilder')
.usage('<env>')
.description('A wizard for setting up front-end configuration files, e.g. for libraries like Tailwind CSS for SiteBuilder Themes. This is designed to work on both a developer\'s CLI tool and on a Siteglide server, to ensure full compatibility.')
.arguments('[environment]', 'Name of environment. Example: staging')
.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
.action(async (environment, params) => {
  // step 0. a) get env in case need to pull or sync anything
  let modules, themeModules = [], module_meta = {};
  process.env.CONFIG_FILE_PATH = params.configFile;
  const module = params.module;
  const authData = fetchAuthData(environment, program);
  // step 0. b) In future check if first-time setup of Tailwind, but for step now we'll assume it is. 
  // step 1. Find modules and check them for views/partials/sitebuilder/step module_registry- if they have package.json but not step module_registry, then b)
  try {
    modules = await opendir('./modules', {
      recursive: false
    });
  } catch (err) {
    console.error(err);
  }

  if(modules) {
    for await (const dirent of modules) {
      try {
        const regFilePath = `./modules/${dirent.name}/public/views/partials/sitebuilder/module_registry.liquid`;
        const exists = existsSync(regFilePath);
        if(!exists) {
          //No registry file exists
          // step 1. b. Possibly need to do siteglide-cli pull -m module_86? Can only do this for known modules built accordining to SiteBuilder
          //module_111 Flowbite Pro doesn't count, because it doesn't need its own Page Templates.
          const knownMainThemeModules = ['module_86'];
          if(knownMainThemeModules.includes(dirent.name)) {
            const downloadModConfig = await confirm({
              message: `${dirent.name} is known to contain a SiteBuilder Theme which has setup steps, but it hasn't been fully downloaded yet. Would you like to fully download it so the Theme can be setup on your machine?`,
              default: false
            });
            if(downloadModConfig === false) {
              console.log('Okay, will skip this module.');
            } else if(downloadModConfig === true) {
              console.log('Okay, the CLI will now trigger a pull command for this module\'s public folder. Please accept the pull command next and wait for it to finish (it could take 1 minute). Despite what the pull command warning says, only module files will be overwritten, not your site files. Setup will continue after.')
              const pullModule = await new Promise((resolve,reject) => {
                const pulled = child_process.spawn(command('siteglide-cli-pull'), [`-m ${dirent.name}`, environment], {
                  stdio: 'inherit',
                  env: process.env,
                  shell: true
                });
                pulled.on('close', () => {
                  resolve(true);
                })
              })
              console.log(`${dirent.name} files pulled. Continuing setup.`);
            }
          } else {
            //May need a way to check other modules and confirm but for now, skip them if registry doesn't exist, or we'll have repeat pulls for modules which don't need them.
            continue;
          }
        } 
        // step 2. Read the yaml, so we know what files to move
        const registryFile = await readFile(regFilePath, {encoding: 'utf8'});
        const doc = registryFile.replace(/---/g, (match, p1, offset) => {
          return offset !== 0 ? '' : match}
        ).trim();
        const registry = yaml.load(doc);
        if(registry.metadata.type === 'theme') {
          themeModules.push({
            id: dirent.name,
            metadata: registry.metadata
          });
        }
      } catch(e) {
        console.error(e);
      }
    }
  }

  const modulesForSetup = await checkbox({
    message: 'Which Themes do you want to setup?',
    choices: themeModules.map((module) => {
      return {
        name: `${module.metadata.name || module.id}, by ${module.metadata.author || 'unknown author'}`,
        value: module.id
      }
    })
  });
  const setups = await Promise.all(modulesForSetup.map((module) => {
    return moduleSetup(themeModules.find((m) => {
      return m.id === module
    }));
  }));
  console.log('All module files installed. Next will attempt installing dependencies.');
  const dependencies = await new Promise((resolve,reject) => {
    const dependenciesCmd = child_process.spawn('npm install', [], {
      stdio: 'inherit',
      env: process.env,
      shell: true
    });
    dependenciesCmd.on('close', () => {
      resolve(true);
    });
    dependenciesCmd.on('error', (e) => {
      reject(e);
    });
  }).catch((e) => {
    console.error(e);
  });
});

//RUN PROGRAM
program.parse(process.argv);


//Helpers
async function moduleSetup(module) {
  //step 4. In each module, move the files out of assets/config/open_me step into the module_folder location
  const modulePath = `./modules/${module.id}/public/`;
  const moduleWorkspacePath = `${modulePath}assets/${module.id}_workspace/`;
  const setupPath = `${modulePath}assets/first_time_setup/`;
  const sRootPath = `${setupPath}root/`;
  const sWorkspacePath = `${setupPath}${module.id}_workspace/`;
  const moduleWorkspaceSrcPath = `${moduleWorkspacePath}src/`;
  const rootPackageJsonPath = `./package.json`;
  const checkSetupDirExists = existsSync(setupPath),
  checkSRootDirExists = existsSync(sRootPath),
  checkSWorkspaceDirExists = existsSync(sWorkspacePath);
  if(!checkSetupDirExists) {
    console.error(`Missing setup folder for module ${module.metadata.name}, cancelling setup.`);
    return false;
  }
  if(!checkSRootDirExists && !checkSWorkspaceDirExists && !checkSWorkspaceSrcDirExists) {
    console.error(`Nothing to unpack for module ${module.metadata.name}, cancelling setup.`);
    return false;
  }
  if(checkSRootDirExists) {
    //Merge root package.json into root, or create new one
    const existingRootPackageJson = existsSync(rootPackageJsonPath);
    const moduleSetupPackageJsonPath = `${sRootPath}/package.json`;
    const moduleSetupPackageJsonExists = existsSync(moduleSetupPackageJsonPath);
    if(!moduleSetupPackageJsonExists) {
      console.error('No settings exist for root package.json file. This may be a module author\'s error.');
      return false;
    }
    console.log('existingRootPackageJson', existingRootPackageJson);
    if(existingRootPackageJson) {
      //Merge root package.json into root
      const permissionToMerge = await confirm({
        message: `Your project already has a package.json file (used to store a list of node package manager dependencies). SiteBuilder uses npm workspaces to store dependencies specific to your SiteBuilder Themes. Are you happy for us to merge our workspace settings into your package.json file?`,
        default: false
      });
      if(permissionToMerge === false) {
        console.log('Sorry, permission to merge npm package.json files is required to continue with the wizard. Please setup manually using the documentation or restart the wizard again.');
        return false;
      }
      //Merge configs on root
      let rootPackageJson, moduleSetupPackageJson, rootPackageJsonStream, moduleSetupPackageJsonStream;
      try {
        rootPackageJson = await readFile(rootPackageJsonPath, {encoding: 'utf8'});
        moduleSetupPackageJson = await readFile(`${sRootPath}package.json`, {encoding: 'utf8'});
        const srcJson = JSON.parse(moduleSetupPackageJson);
        let destJson = JSON.parse(rootPackageJson);
        let destChanged = false;
        if(srcJson.workspaces) {
          if(destJson.workspaces) {
            console.log(typeof srcJson.workspaces, typeof destJson.workspaces)
            if(Array.isArray(destJson.workspaces) && Array.isArray(srcJson.workspaces)) {
              destJson['workspaces'] = destJson['workspaces'].concat(srcJson.workspaces).filter((value, index, array) => {
                return array.indexOf(value) === index;
              });
              destChanged = true;
              console.log('new merged array', destJson['workspaces'])
            } else {
              console.log('Expected workspaces in package.json file to be an array. Cannot automatically merge. Cancelling setup.');
              return false;
            }
          } else {
            destJson['workspaces'] = srcJson.workspaces;
            destChanged = true;
          }
        }
        if(srcJson.scripts) {
          if(destJson.scripts) {
            //Merge scripts
            if(typeof destJson.scripts === 'object' && typeof srcJson.scripts === 'object') {
              for(let key in srcJson.scripts) {
                const value = srcJson.scripts[key];
                destJson.scripts.hasOwnProperty(key);
                destChanged = true;
                const newKey = await input({
                  message: `Script name already exists. Pick a new short name which will act as a shortcut to ${module.metadata.name}'s ${key}, e.g. "tw". please use characters "[A-Z]_-" only.`,
                  required: true,
                  validate: (inputStr) => {
                    return !destJson.scripts.hasOwnProperty(key);
                  }
                });
                destJson['scripts'][newKey] = value;
                destChanged = true;
              }
            } else {
              console.log('Expected scripts in package.json file to be an object. Cannot automatically merge. Cancelling setup.');
              return false;
            }
          } else {
            //New scripts
            destJson.scripts = srcJson.scripts;
          }
        }
        if(destChanged) {
          const newFileContents = JSON.stringify(destJson, null, 2);
          const newPackageJSONFile = await writeFile(rootPackageJsonPath,newFileContents, {
            encoding: 'utf8'
          });
          console.log('Root package.json file updated.');
        } else {
          console.log('No changes made to root package.json file.');
        }
      } catch(e) {
        console.error(e);
      }
      
    } else {
      //Create new package.json on root.
      try {
        console.log('Creating a new package.json file. We will ask you some questions to fill in the required details.');
        moduleSetupPackageJson = await readFile(`${sRootPath}package.json`, {encoding: 'utf8'});
        const srcJson = JSON.parse(moduleSetupPackageJson);
        let project = {
          name: await input({
            message: "What is the name of your Siteglide project?",
            required: true,
            default: "New Siteglide Project"
          }),
          version: await input({
            message: "Choose a version number. (Required by npm, but not required by Siteglide, so you don't need to update this later unless you want to).",
            required: true,
            default: "0.1.0"
          }),
          description: await input({
            message: "A short description of your website/app/project",
            required: true,
            default: "A website project using Siteglide"
          }),
          author: await input({
            message: "Your name, or organisation name",
            required: true,
            default: "Anonymous"
          }),
          license: await input({
            message: "How is this project licensed? (This is required by npm but not by Siteglide, you can simply choose the default to skip.)",
            required: true,
            default: "UNLICENSED"
          }),
          private: true,
          workspaces: srcJson.workspaces,
          scripts: srcJson.scripts
        };
        console.log('Thank you, creating your package.json file now.');
        const newFile = await writeFile(rootPackageJsonPath, JSON.stringify(project, null, 2), {
          encoding: 'utf8'
        });
      } catch(e) {

      }
      
    }
    console.log('Unpacking module ${module.metadata.name || module.id} workspace.');
    if(!existsSync(moduleWorkspacePath)) {
      const mADir = await mkdir(moduleWorkspacePath);
    }
    const copyWorkspace = await cp(
      sWorkspacePath,
      moduleWorkspacePath,
      {
        recursive: true,
        filter: confirmCopyIfFileExists
      }
    );
    console.log(`Module ${module.metadata.name || module.id} workspace unpacked.`);
  }
  //Resolve promise. Module is setup.
  return true;
}

async function confirmCopyIfFileExists(src,dest) {
  //Can skip file copy if there is a chance this is overriding a previous setup.
  const isDir = src.split('')[src.split('').length - 1] === '/';
  console.log('trying to copy', src, dest);
  if(isDir) {
    return true;
  } else if(existsSync(dest)) {
    return await confirm({
      message: `It looks like file ${dest} already exists. A developer may have setup this module already, and the target file may contain important styling or other configuration for the project. Are you sure you want to overwrite this file with the default setup? Yes continues, no cancels.`,
      default: false
    });
  } else {
    return true;
  }
}