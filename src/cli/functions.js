import fs                     from 'node:fs';

import {
   commonPath,
   getFileList,
   getRelativePath,
   isDirectory,
   isFile }                   from '@typhonjs-utils/file-util';

import { getPackageWithPath } from '@typhonjs-utils/package-json';
import { globSync }           from 'glob';
import isGlob                 from 'is-glob';
import * as resolvePkg        from 'resolve.exports';
import ts                     from 'typescript';
import path                   from 'upath';

import { generateDocs }       from '../generator/index.js';
import { generateTypedoc }    from '../generator/typedoc.js';

import { Logger }             from '#util';

// Only allow standard JS / TS files.
const s_REGEX_ALLOWED_FILE_EXTENSIONS = /\.(js|mjs|ts|mts)$/;

const s_REGEX_IS_DTS_FILE = /\.d\.(cts|ts|mts)$/;

/**
 * Processes CLI options and invokes TypeDoc.
 *
 * @param {object}   opts - CLI options.
 *
 * @returns {Promise<void>}
 */
export async function generate(opts)
{
   const config = await processOptionsNew(opts);

   await generateDocs(config);

   // const config = await processOptions(opts);

   // await generateTypedoc(config);
}

function processOptionsNew(opts)
{
   /**
    * @type {import('../generator').GenerateConfig}
    */
   let config = {};

   // logLevel -------------------------------------------------------------------------------------------------------

   if (typeof opts?.loglevel === 'string')
   {
      if (!Logger.isValidLevel(opts.loglevel))
      {
         exit(`Invalid options: log level '${opts.loglevel}' must be 'all', 'verbose', 'info', 'warn', or 'error'.`);
      }

      Logger.logLevel = opts.loglevel;
      config.logLevel = opts.loglevel;
   }

   // path -----------------------------------------------------------------------------------------------------------

   if (typeof opts?.path === 'string')
   {
      if (!isFile(opts.path))
      {
         exit(`Invalid options: the 'path' specified does not exist.`);
      }

      config.path = opts.path;
   }

   // dmtNavStyle ----------------------------------------------------------------------------------------------------

   if (opts['dmt-nav-compact'] && opts?.['dmt-nav-flat'])
   {
      exit(`'--dmt-nav-compact' and '--dmt-nav-flat is enabled; choose only one.`);
   }

   if (typeof opts['dmt-nav-compact'] === 'boolean' && opts['dmt-nav-compact']) { config.dmtNavStyle = 'compact'; }
   if (typeof opts['dmt-nav-flat'] === 'boolean' && opts['dmt-nav-flat']) { config.dmtNavStyle = 'flat'; }

   // linkPlugins ----------------------------------------------------------------------------------------------------

   if (typeof opts['api-link'] === 'string') { config.linkPlugins = [...new Set(opts['api-link'].split(','))]; }

   // typedoc --------------------------------------------------------------------------------------------------------

   if (typeof opts.typedoc === 'string') { config.typedocPath = opts.typedoc; }

   // exportCondition ------------------------------------------------------------------------------------------------

   if (typeof opts.export === 'string') { config.exportCondition = opts.export; }

   // packageName ----------------------------------------------------------------------------------------------------

   if (typeof opts.name === 'string') { config.packageName = opts.name; }

   // output ---------------------------------------------------------------------------------------------------------

   if (typeof opts.output === 'string') { config.output = opts.output; }

   // tsconfigPath ---------------------------------------------------------------------------------------------------

   if (typeof opts.tsconfig === 'string') { config.tsconfigPath = opts.tsconfig; }

   return config;
}


/**
 * @param {string}   filepath - Path to check.
 *
 * @returns {boolean} Returns if the given path is a file.
 */
function isDTSFile(filepath)
{
   return isFile(filepath) &&
    !(!filepath.endsWith('.d.ts') && !filepath.endsWith('.d.mts') && !filepath.endsWith('.d.cts'));
}

/**
 * @param {object}   opts - CLI options.
 *
 * @returns {Promise<import('../generator').PkgTypeDocConfig>} Processed options.
 */
async function processOptions(opts)
{
   const cwd = process.cwd();

   // Find local `package.json` only.
   const { packageObj, filepath } = getPackageWithPath({ filepath: cwd, basepath: cwd });

   /** @type {Partial<import('../generator').PkgTypeDocConfig>} */
   const config = {
      cwd,
      dmtNavStyle: void 0,
      fromPackage: false,
      hasCompilerOptions: false,
      packageObj
   };

   if (Logger.isValidLevel(opts?.loglevel)) { Logger.logLevel = opts.loglevel; }

   if (opts?.['dmt-nav-style'] === 'compact' || opts?.['dmt-nav-style'] === 'flat')
   {
      config.dmtNavStyle = opts['dmt-nav-style'];
   }

   config.compilerOptions = processTSConfig(opts, config);
   config.linkPlugins = processAPILink(opts);
   config.packageName = opts.name ?? packageObj?.name ?? '';
   config.out = typeof opts?.output === 'string' ? opts.output : 'docs';
   config.typedocJSON = processTypedoc(opts, config);

   // Sets `config.entryPoints` / `config.entryPointsDTS`.
   await processPath(opts, config, filepath);

   return config;
}

const s_LINK_PLUGINS = new Map([
   ['dom', '@typhonjs-typedoc/ts-lib-docs/typedoc/ts-links/dom/2023'],
   ['esm', '@typhonjs-typedoc/ts-lib-docs/typedoc/ts-links/esm/2023'],
   ['worker', '@typhonjs-typedoc/ts-lib-docs/typedoc/ts-links/worker/2023']
]);

/**
 * Processes `opts.[api-link]` to find the appropriate link plugins.
 *
 * @param {object}   opts - CLI options.
 *
 * @returns {string[]} List of link plugins enabled.
 */
function processAPILink(opts)
{
   const plugins = [];

   if (typeof opts?.['api-link'] === 'string')
   {
      const entries = new Set(opts['api-link'].split(','));

      // Detect when dom and worker are configured together as they are exclusive.
      if (entries.has('dom') && entries.has('worker'))
      {
         exit(`API link error: You may only include either 'dom' or 'worker' for the DOM API or Web Worker API.`);
      }

      for (const entry of entries)
      {
         if (!s_LINK_PLUGINS.has(entry))
         {
            Logger.warn(`API Link warning: Unknown API link '${entry}'.`);
            continue;
         }

         Logger.verbose(`Adding API link plugin '${entry}': ${s_LINK_PLUGINS.get(entry)}`);
         plugins.push(s_LINK_PLUGINS.get(entry));
      }
   }

   return [...plugins];
}

/**
 * Process `opts.file` or `opts.path` or default `package.json` lookup.
 *
 * @param {object}            opts - CLI options.
 *
 * @param {import('../generator').PkgTypeDocConfig}  config - Processed Options.
 *
 * @param {string}            [packageFilepath] - File path to package.json.
 *
 * @returns {Promise<string[]>} Array of DTS file paths.
 */
async function processPath(opts, config, packageFilepath)
{
   let filepaths = new Set();

   if (typeof opts?.path === 'string')
   {
      if (!fs.existsSync(opts.path)) { exit(`Invalid options: the 'path' specified does not exist.`); }

      if (isDirectory(opts.path))
      {
         Logger.verbose(`Loading Typescript declarations from directory path specified:`);

         // Get all files ending in `d.ts` folder an sub-folders specified.
         const dtsFilepaths = await getFileList({
            dir: opts.path,
            includeFile: /\.d\.(ts|mts)$/
         });

         for (const dtsPath of dtsFilepaths)
         {
            const resolvedPath = path.resolve(opts.path, dtsPath);

            if (filepaths.has(resolvedPath)) { continue; }
            filepaths.add(resolvedPath);

            Logger.verbose(resolvedPath);
         }
      }
      else if (isFile(opts.path) && s_REGEX_ALLOWED_FILE_EXTENSIONS.test(opts.path))
      {
         const resolvedPath = path.resolve(opts.path);
         filepaths.add(resolvedPath);

         Logger.verbose(`Loading entry point from file path specified:`);
         Logger.verbose(resolvedPath);
      }
   }
   else
   {
      config.fromPackage = true;

      const packageObj = config.packageObj;

      if (!packageObj) { exit(`No 'package.json' found in: ${config.cwd}`); }

      if (packageFilepath)
      {
         Logger.verbose(
          `Processing: ${getRelativePath({ basepath: config.cwd, filepath: path.toUnix(packageFilepath) })}`);
      }

      const exportsFilepaths = processPathExports(opts, config, packageObj);

      // If there are exports in `package.json` accept the file paths.
      if (exportsFilepaths.size)
      {
         filepaths = exportsFilepaths;
      }
      else // Otherwise attempt to find `types` or `typings` properties in `package.json`.
      {
         if (typeof packageObj?.types === 'string')
         {
            Logger.verbose(`Loading entry points from package.json 'types' property':`);

            if (!isDTSFile(packageObj.types))
            {
               Logger.warn(`'types' property in package.json is not a declaration file: ${packageObj.types}`);
            }
            else
            {
               const resolvedPath = path.resolve(packageObj.types);
               Logger.verbose(resolvedPath);
               filepaths.add(path.resolve(resolvedPath));
            }
         }
         else if (typeof packageObj?.typings === 'string')
         {
            Logger.verbose(`Loading entry points from package.json 'typings' property':`);

            if (!isDTSFile(packageObj.typings))
            {
               Logger.warn(`'typings' property in package.json is not a declaration file: ${packageObj.typings}`);
            }
            else
            {
               const resolvedPath = path.resolve(packageObj.typings);
               Logger.verbose(resolvedPath);
               filepaths.add(path.resolve(resolvedPath));
            }
         }
      }
   }

   if (filepaths.size === 0)
   {
      Logger.warn(`No entry points found to load for documentation generation.`);
      process.exit(1);
   }

   config.entryPoints = [...filepaths];

   // Sets true if every entry point a Typescript declaration.
   config.entryPointsDTS = config.entryPoints.every((filepath) => s_REGEX_IS_DTS_FILE.test(filepath));
}

/**
 * Attempt to parse any `package.json` exports conditions.
 *
 * @param {object}            opts - CLI options.
 *
 * @param {import('../generator').PkgTypeDocConfig}  config - Processed Options.
 *
 * @param {object}            packageObj - Package object.
 *
 * @returns {Set<string>} Any resolved entry points to load.
 */
function processPathExports(opts, config, packageObj)
{
   if (typeof packageObj?.exports !== 'object')
   {
      Logger.verbose(`No 'exports' conditions found in 'package.json'.`);

      return new Map();
   }

   const exportsMap = opts.export === 'types' ? processExportsTypes(config, packageObj) :
    processExportsCondition(config, packageObj, opts.export);

   // Process `dmtModuleNames ----------------------------------------------------------------------------------------

   const filepaths = [...exportsMap.keys()];

   if (filepaths.length)
   {
      const exportPaths = [...exportsMap.values()];
      const basepath = commonPath(...filepaths);

      const dmtModuleNames = {};

      for (let cntr = 0; cntr < filepaths.length; cntr++)
      {
         const filepath = filepaths[cntr];
         const exportPath = exportPaths[cntr];

         if (isGlob(exportPath))
         {
            const relativeDir = path.dirname(getRelativePath({ basepath, filepath }));

            if (relativeDir === '.')
            {
               // Path is at the project root, so use filename without extension as package / module name.
               const filename = path.basename(filepath).split('.')[0];
               dmtModuleNames[filename] = `${config.packageName}/${filename}`;
            }
            else
            {
               // Attempt a best mapping attempt for how TypeDoc generates the associated module name. The relative path
               // including file name without extension is used except for file names that are `index` which is removed.
               const relativePath = getRelativePath({ basepath, filepath })?.split('.')?.[0]?.replace(/\/index$/, '');

               if (!relativePath) { continue; }

               // Path is located in a sub-directory, so join it with package name.
               dmtModuleNames[relativePath] = path.join(config.packageName, relativePath);
            }
         }
         else
         {
            const relativeDir = path.dirname(getRelativePath({ basepath, filepath }));

            if (relativeDir === '.')
            {
               // Path is at the project root, so use filename without extension as package / module name.
               const filename = path.basename(filepath).split('.')[0];
               dmtModuleNames[filename] = `${config.packageName}/${filename}`;
            }
            else
            {
               // Attempt a best mapping attempt for how TypeDoc generates the associated module name. The relative path
               // including file name without extension is used except for file names that are `index` which is removed.
               const relativePath = getRelativePath({ basepath, filepath })?.split('.')?.[0]?.replace(/\/index$/, '');

               if (!relativePath) { continue; }

               // Path is located in a sub-directory, so join it with package name.
               dmtModuleNames[relativePath] = path.join(config.packageName, exportPath);
            }
         }
      }

      config.dmtModuleNames = dmtModuleNames;
   }

   return new Set(filepaths);
}

/**
 * Generically processes `package.json` exports conditions from user supplied condition.
 *
 * @param {import('../generator').PkgTypeDocConfig}  config - Processed Options.
 *
 * @param {object}   packageObj - Package object.
 *
 * @param {string}   condition - Export condition to find.
 *
 * @returns {Map<string, string>} Resolved file paths for given export condition.
 */
function processExportsCondition(config, packageObj, condition)
{
   const exportMap = new Map();
   const exportLog = [];

   const processExport = (procEntryPath, procExportPath) =>
   {
      if (!isFile(procEntryPath))
      {
         Logger.warn(`Warning: export condition is not a file; "${procExportPath}": ${procEntryPath}`);
         return;
      }

      const filepath = path.resolve(procEntryPath);

      if (exportMap.has(filepath)) { return; }

      exportMap.set(filepath, procExportPath);
      exportLog.push(`"${procExportPath}": ${getRelativePath({ basepath: config.cwd, filepath })}`);
   };

   for (const exportPath in packageObj.exports)
   {
      let result;

      try
      {
         result = resolvePkg.exports(packageObj, exportPath, { conditions: [condition] });
      }
      catch (err)
      {
         continue;
      }

      if (!Array.isArray(result) || result.length === 0) { continue; }

      const entryPath = result[0];

      if (typeof entryPath !== 'string') { continue; }

      // Currently `resolve.exports` does not allow filtering out the `default` condition.
      // See: https://github.com/lukeed/resolve.exports/issues/30

      if (!s_REGEX_ALLOWED_FILE_EXTENSIONS.test(entryPath)) { continue; }

      if (isGlob(exportPath) || isGlob(entryPath))
      {
         const globEntryPaths = globSync(entryPath);
         for (const globEntryPath of globEntryPaths) { processExport(globEntryPath, exportPath); }
      }
      else
      {
         processExport(entryPath, exportPath);
      }
   }

   // Log any entry points found.
   if (exportLog.length)
   {
      Logger.verbose(`Loading entry points from 'package.json' export condition '${condition}':`);
      for (const entry of exportLog) { Logger.verbose(entry); }
   }

   return exportMap;
}

/**
 * Specifically parse the `types` export condition with a few extra sanity checks.
 *
 * @param {import('../generator').PkgTypeDocConfig}  config - Processed Options.
 *
 * @param {object}   packageObj - Package object.
 *
 * @returns {Map<string, string>} Resolved file paths for given export condition.
 */
function processExportsTypes(config, packageObj)
{
   const exportMap = new Map();
   const exportLog = [];

   const processExport = (procEntryPath, procExportPath) =>
   {
      if (!isDTSFile(procEntryPath))
      {
         Logger.warn(`Warning: export condition is not a DTS file; "${procExportPath}": ${procEntryPath}`);
         return;
      }

      const filepath = path.resolve(procEntryPath);

      if (exportMap.has(filepath)) { false; }

      exportMap.set(filepath, procExportPath);
      exportLog.push(`"${procExportPath}": ${getRelativePath({ basepath: config.cwd, filepath })}`);
   };

   for (const exportPath in packageObj.exports)
   {
      let result;

      try
      {
         result = resolvePkg.exports(packageObj, exportPath, { conditions: ['types'] });
      }
      catch (err)
      {
         continue;
      }

      if (!Array.isArray(result) || result.length === 0) { continue; }

      const entryPath = result[0];

      if (typeof entryPath !== 'string') { continue; }

      // Currently `resolve.exports` does not allow filtering out the `default` condition.
      // See: https://github.com/lukeed/resolve.exports/issues/30
      if (!entryPath.endsWith('.d.ts') && !entryPath.endsWith('.d.mts') && !entryPath.endsWith('.d.cts')) { continue; }

      if (isGlob(exportPath) || isGlob(entryPath))
      {
         const globEntryPaths = globSync(entryPath);
         for (const globEntryPath of globEntryPaths) { processExport(globEntryPath, exportPath); }
      }
      else
      {
         processExport(entryPath, exportPath);
      }
   }

   // Log any entry points found.
   if (exportLog.length)
   {
      Logger.verbose(`Loading entry points from 'package.json' export condition 'types':`);
      for (const entry of exportLog) { Logger.verbose(entry); }
   }

   return exportMap;
}

/**
 * Creates the Typescript compiler options from default values and / or `tsconfig` CLI option.
 *
 * @param {object}            opts - CLI options.
 *
 * @param {import('../generator').PkgTypeDocConfig}  config - Processed config options.
 *
 * @returns {ts.CompilerOptions} Processed Typescript compiler options.
 */
function processTSConfig(opts, config)
{
   let tsconfigPath;

   // Verify any tsconfig provided path.
   if (opts.tsconfig)
   {
      if (isFile(opts.tsconfig)) { tsconfigPath = opts.tsconfig; }
      else
      {
         exit(`Aborting as 'tsconfig' path is specified, but file does not exist; '${opts.tsconfig}'`);
      }
   }

   /** @type {import('type-fest').TsConfigJson.CompilerOptions} */
   const defaultCompilerOptions = {
      allowJs: true,
      declaration: false,
      declarationMap: false,
      esModuleInterop: true,
      module: 'ES2022',
      noEmit: true,
      noImplicitAny: false,
      skipLibCheck: true,
      sourceMap: false,
      target: 'ES2022',
      moduleResolution: 'Bundler'
   };

   /** @type {import('type-fest').TsConfigJson.CompilerOptions} */
   let tsconfigCompilerOptions = {};

   if (tsconfigPath)
   {
      Logger.verbose(`Loading TS compiler options from 'tsconfig' path: ${tsconfigPath}`);

      try
      {
         const configJSON = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8').toString());
         if (configJSON?.compilerOptions)
         {
            tsconfigCompilerOptions = configJSON.compilerOptions;
            config.hasCompilerOptions = true;
         }
      }
      catch (err)
      {
         exit(`Aborting as 'tsconfig' path is specified, but failed to load; '${
          err.message}'\ntsconfig path: ${tsconfigPath};`);
      }
   }

   // ----------------------------------------------------------------------------------------------------------------

   /**
    * Note: the default compiler options will override a fair amount of values.
    *
    * @type {import('type-fest').TsConfigJson.CompilerOptions}
    */
   const compilerOptionsJson = Object.assign(tsconfigCompilerOptions, defaultCompilerOptions);

   // Validate compiler options with Typescript.
   const compilerOptions = validateCompilerOptions(compilerOptionsJson);

   // Return now if compiler options failed to validate.
   if (!compilerOptions)
   {
      exit(`Aborting as 'config.compilerOptions' failed validation.`);
   }

   return compilerOptions;
}

/**
 * Loads `typedoc` CLI options.
 *
 * @param {object}            opts - CLI options.
 *
 * @param {import('../generator').PkgTypeDocConfig}  config - Processed config options.
 *
 * @returns {object} TypeDoc JSON object.
 */
function processTypedoc(opts, config)
{
   let typedocPath;
   let typedocJSON;

   // Verify any tsconfig provided path.
   if (opts.typedoc)
   {
      if (isFile(opts.typedoc)) { typedocPath = opts.typedoc; }
      else
      {
         exit(`Aborting as 'typedoc.json' path is specified, but file does not exist; '${opts.typedoc}'`);
      }
   }

   if (typedocPath)
   {
      Logger.verbose(`Loading TypeDoc options from 'typedoc' path: ${typedocPath}`);

      try
      {
         typedocJSON = JSON.parse(fs.readFileSync(typedocPath, 'utf-8').toString());
      }
      catch (err)
      {
         exit(`Aborting as 'typedoc.json' path is specified, but failed to load; '${
          err.message}'\ntypedoc path: ${typedocPath};`);
      }
   }

   return typedocJSON;
}

/**
 * Validates the TS compiler options.
 *
 * @param {import('type-fest').TsConfigJson.CompilerOptions} compilerOptions - The TS compiler options.
 *
 * @returns {ts.CompilerOptions} The validated compiler options or undefined if failure.
 */
function validateCompilerOptions(compilerOptions)
{
   // Validate `config.compilerOptions` ------------------------------------------------------------------------------

   // Use the current working directory as the base path.
   const basePath = process.cwd();

   const { options, errors } = ts.convertCompilerOptionsFromJson(compilerOptions, basePath);

   if (errors.length > 0)
   {
      for (const err of errors) { Logger.error(`[TS] ${ts.flattenDiagnosticMessageText(err.messageText, '\n')}`); }
      return void 0;
   }

   return options;
}

/**
 * Exit with error message.
 *
 * @param {string} message - A message.
 */
function exit(message)
{
   Logger.error(message);
   process.exit(1);
}
