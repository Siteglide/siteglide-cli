/*
  Steps
  step 0. a) get env in case need to pull or sync anything
  step 0. b) In future check if first-time setup of Tailwind, but for step now we'll assume it is. 
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

import { opendir, open, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import yaml from 'js-yaml';
import {spawn, spawnSync} from 'child_process';
import command from './lib/command.js';
import {fetchSettings} from './lib/settings.js';
import program from 'commander';
import cli_package_json from './package.json' with { type: "json" };
import {confirm, checkbox} from '@inquirer/prompts';



const child_process = {spawn, spawnSync};
const fetchAuthData = fetchSettings;
const version = cli_package_json.version;

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
        const exists = await existsSync(regFilePath);
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
    }))
  }))

  // const themeModuleQuestions = themeModules.map(async (module) => {
  //   const value = await confirm({
  //     message: `Do you want to setup the Theme: ${module.metadata.name || module.id}, by ${module.metadata.author || 'unknown author'}?`,
  //     default: false
  //   });
  //   return {
  //     id: module.id,
  //     value: value
  //   }
  // })
  // const modulesForSetup = await Promise.all(themeModuleQuestions);
  // step 4. In each module, move the files out of assets/config/open_me step into the module_folder location

  
  //const ans = await sitebuilder.setupThemeConfirm(themeModules);
  //console.log('ans', ans)
  // const ans = await sitebuilder.firstTailwindSetup();
  // console.log(ans);

  
});

program.parse(process.argv)


//Helpers
async function moduleSetup(module) {
  //step 4. In each module, move the files out of assets/config/open_me step into the module_folder location
  const module_path = `./modules/${module.id}/public/`;
  const module_assets_path = `${module_path}assets/`;
  const setupPath = `${module_assets_path}first_time_setup/`;
  const sRootPath = `${setupPath}root/`;
  const sAssetsPath = `${setupPath}root/`;
  const sAssetsSrcPath = `${setupPath}root/`;
  const rootPackageJsonPath = `./package.json`;
  const checkSetupDirExists = existsSync(setupPath),

  checkSRootDirExists = existsSync(sRootPath),
  checkSAssetsDirExists = existsSync(sAssetsPath),
  checkSAssetsSrcDirExists = existsSync(sAssetsSrcPath)
  if(!checkSetupDirExists) {
    console.error(`Missing setup folder for module ${module.metadata.name}, cancelling setup.`);
    return false;
  }
  if(!checkSRootDirExists && !checkSAssetsDirExists && !checkSAssetsSrcDirExists) {
    console.error(`Nothing to unpack for module ${module.metadata.name}, cancelling setup.`);
    return false;
  }
  if(checkSRootDirExists) {
    //Merge root package.json into root.
    const existingRootPackageJson = existsSync(rootPackageJsonPath);
    const moduleSetupPackageJsonPath = `${sRootPath}/package.json`;
    const moduleSetupPackageJsonExists = existsSync(moduleSetupPackageJsonPath);
    if(!moduleSetupPackageJsonExists) {
      console.error('No settings exist for root packasge.json file. This may be a module author\'s error.');
      return false;
    }
    console.log('existingRootPackageJson', existingRootPackageJson);
    if(existingRootPackageJson) {
      const permissionToMerge = await confirm({
        message: `Your project already has a package.json file (used to store a list of node package manager dependencies). SiteBuilder uses npm workspaces to store dependencies specific to your SiteBuilder Themes. Are you happy for us to merge our workspace settings into your package.json file?`,
        default: false
      });
      if(permissionToMerge === false) {
        console.log('Sorry, permission to merge npm package.json files is required to continue with the wizard. Please setup manually using the documentation or restart the wizard again.');
        return false;
      }
      //Merge
      let rootPackageJson, moduleSetupPackageJson, rootPackageJsonStream, moduleSetupPackageJsonStream;
      try {
        rootPackageJson = await readFile(rootPackageJsonPath, {encoding: 'utf8'});
        moduleSetupPackageJson = await readFile(`${sRootPath}package.json`, {encoding: 'utf8'});
        const srcJson = JSON.parse(moduleSetupPackageJson);
        let destJson = JSON.parse(rootPackageJson);
        if(srcJson.workspaces) {
          if(destJson.workspaces) {
            console.log(typeof srcJson.workspaces, typeof destJson.workspaces)
            if(Array.isArray(destJson.workspaces) && Array.isArray(srcJson.workspaces)) {
              destJson['workspaces'] = destJson['workspaces'].concat(srcJson.workspaces).filter((value, index, array) => {
                return array.indexOf(value) === index;
              });
              console.log('new merged array', destJson['workspaces'])
            } else {
              console.log('Expected workspaces in package.json file to be an array. Cannot automatically merge. Cancelling setup.');
              return false;
            }
          } else {
            destJson['workspaces'] = srcJson.workspaces;
          }
          const newFileContents = JSON.stringify(destJson);
          const newPackageJSONFile = await writeFile(rootPackageJsonPath,newFileContents, {
            encoding: 'utf8'
          });
        }
        if(srcJson.scripts) {
          
        }


      } catch(e) {
        console.error(e);
      }
      
    } else {
      console.log('Creating a new package.json file');
    }
  }
  return true;
}

