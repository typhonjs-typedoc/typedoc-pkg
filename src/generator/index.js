import fs                     from 'node:fs';

import {
   commonPath,
   getRelativePath,
   isDirectory,
   isFile }                   from '@typhonjs-utils/file-util';
import { isObject }           from '@typhonjs-utils/object';
import { getPackageWithPath } from "@typhonjs-utils/package-json";
import { globSync }           from 'glob';
import isGlob                 from 'is-glob';
import * as resolvePkg        from 'resolve.exports';
import path                   from 'upath';

import { generateTypedoc }    from './typedoc.js';

import {
   isDTSFile,
   regexAllowedFiles,
   regexIsDTSFile,
   validateCompilerOptions,
   validateConfig }           from './validation.js';

import { Logger }             from '#util';

/**
 * @param {GenerateConfig} config - Generate config.
 *
 * @returns {Promise<void>}
 */
export async function generateDocs(config)
{
   if (typeof config?.logLevel === 'string')
   {
      if (!Logger.isValidLevel(config.logLevel))
      {
         Logger.error(
          `Invalid options: log level '${config.logLevel}' must be 'all', 'verbose', 'info', 'warn', or 'error'.`);
         return;
      }

      Logger.logLevel = config.logLevel;
   }

   const origCWD = process.cwd();
   const processedConfigOrError = await processConfig(config);
   process.chdir(origCWD);

   if (typeof processedConfigOrError === 'string')
   {
      Logger.error(processedConfigOrError);
      return;
   }

   console.log(`!! generateDocs - processedConfigOrError: `, processedConfigOrError);
   await generateTypedoc(processedConfigOrError);
}

/**
 * Processes an original GenerateConfig object returning all processed data required to compile / bundle DTS.
 *
 * @param {GenerateConfig} origConfig - The original GenerateConfig.
 *
 * @returns {Promise<PkgTypeDocConfig | string>} Processed config or error string.
 */
async function processConfig(origConfig)
{
   // Initial sanity checks.
   if (!isObject(origConfig)) { return `Aborting as 'config' must be an object.`; }

   /**
    * A shallow copy of the original configuration w/ default values for `exportCondition`, `logLevel`, `output`.
    *
    * @type {GenerateConfig}
    */
   const config = Object.assign({
      exportCondition: 'types',
      logLevel: 'info',
      output: 'docs'
   }, origConfig);

   if (!validateConfig(config)) { return `Aborting as 'config' failed validation.`; }

   /** @type {Partial<PkgTypeDocConfig>} */
   const pkgConfig = {
      dmtNavStyle: config.dmtNavStyle,
      fromPackage: false,
      hasCompilerOptions: false,
      linkPlugins: config.linkPlugins,
      output: config.output,
      packageName: config.packageName,
      typedocOptions: config.typedocOptions
   };

   const compilerOptionsOrError = processTSConfig(config, pkgConfig);
   if (typeof compilerOptionsOrError === 'string') { return compilerOptionsOrError; }
   pkgConfig.compilerOptions = compilerOptionsOrError;

   const typedocJSONOrError = processTypedoc(config);
   if (typeof typedocJSONOrError === 'string') { return typedocJSONOrError; }
   pkgConfig.typedocJSON = typedocJSONOrError;

   // Sets `config.entryPoints` / `config.entryPointsDTS`.
   const processPathError = processPath(config, pkgConfig);
   if (typeof processPathError === 'string') { return processPathError; }

   return pkgConfig;
}

/**
 * Process `opts.file` or `opts.path` or default `package.json` lookup.
 *
 * @param {GenerateConfig}    config - CLI options.
 *
 * @param {PkgTypeDocConfig}  pkgConfig - Processed Options.
 *
 * @returns {string | undefined} Error string.
 */
function processPath(config, pkgConfig)
{
   let filepaths = new Set();

   const isPathDir = isDirectory(config.path);

   if (isPathDir || config.path.endsWith('package.json'))
   {
      pkgConfig.fromPackage = true;

      const dirname = isPathDir ? path.resolve(config.path) : path.dirname(path.resolve(config.path));

      const origCWD = process.cwd();

      process.chdir(dirname);

      const { packageObj, filepath } = getPackageWithPath({ filepath: dirname, basepath: dirname });

      if (!packageObj) { return `No 'package.json' found in: ${dirname}`; }

      if (typeof config.packageName !== 'string') { config.packageName = packageObj.name; }

      if (filepath)
      {
         Logger.verbose(
          `Processing: ${getRelativePath({ basepath: origCWD, filepath: path.toUnix(filepath) })}`);
      }

      const exportsFilepaths = processPathExports(config, pkgConfig, packageObj);

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
   else if (isFile(config.path) && regexAllowedFiles.test(config.path))
   {
      const resolvedPath = path.resolve(config.path);
      filepaths.add(resolvedPath);

      Logger.verbose(`Loading entry point from file path specified:`);
      Logger.verbose(resolvedPath);
   }

   if (filepaths.size === 0)
   {
      Logger.warn(`No entry points found to load for documentation generation.`);
      process.exit(1);
   }

   pkgConfig.entryPoints = [...filepaths];

   // Sets true if every entry point a Typescript declaration.
   pkgConfig.entryPointsDTS = pkgConfig.entryPoints.every((filepath) => regexIsDTSFile.test(filepath));
}

/**
 * Attempt to parse any `package.json` exports conditions.
 *
 * @param {GenerateConfig} config - Processed Options.
 *
 * @param {PkgTypeDocConfig} pkgConfig - PkgTypeDocConfig.
 *
 * @param {object}         packageObj - Package object.
 *
 * @returns {Set<string>} Any resolved entry points to load.
 */
function processPathExports(config, pkgConfig, packageObj)
{
   if (typeof packageObj?.exports !== 'object')
   {
      Logger.verbose(`No 'exports' conditions found in 'package.json'.`);

      return new Map();
   }

   const exportsMap = config.exportCondition === 'types' ? processExportsTypes(config, packageObj) :
    processExportsCondition(config, packageObj);

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

      pkgConfig.dmtModuleNames = dmtModuleNames;
   }

   return new Set(filepaths);
}

/**
 * Generically processes `package.json` exports conditions from user supplied condition.
 *
 * @param {GenerateConfig}  config - Processed Options.
 *
 * @param {object}   packageObj - Package object.
 *
 * @returns {Map<string, string>} Resolved file paths for given export condition.
 */
function processExportsCondition(config, packageObj)
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
      exportLog.push(`"${procExportPath}": ${getRelativePath({ basepath: process.cwd(), filepath })}`);
   };

   for (const exportPath in packageObj.exports)
   {
      let result;

      try
      {
         result = resolvePkg.exports(packageObj, exportPath, { conditions: [config.exportCondition] });
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

      if (!regexAllowedFiles.test(entryPath)) { continue; }

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
      Logger.verbose(`Loading entry points from 'package.json' export condition '${config.exportCondition}':`);
      for (const entry of exportLog) { Logger.verbose(entry); }
   }

   return exportMap;
}

/**
 * Specifically parse the `types` export condition with a few extra sanity checks.
 *
 * @param {GenerateConfig}  config - Processed Options.
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
      exportLog.push(`"${procExportPath}": ${getRelativePath({ basepath: process.cwd(), filepath })}`);
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
 * @param {GenerateConfig}    config - Processed config options.
 *
 * @param {PkgTypeDocConfig}  pkgConfig - PkgTypeDocConfig.
 *
 * @returns {import('typescript').CompilerOptions | string} Processed Typescript compiler options or error string.
 */
function processTSConfig(config, pkgConfig)
{
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

   if (config.tsconfigPath)
   {
      Logger.verbose(`Loading TS compiler options from 'tsconfig' path: ${config.tsconfigPath}`);

      try
      {
         const configJSON = JSON.parse(fs.readFileSync(config.tsconfigPath, 'utf-8').toString());
         if (configJSON?.compilerOptions)
         {
            tsconfigCompilerOptions = configJSON.compilerOptions;
            pkgConfig.hasCompilerOptions = true;
         }
      }
      catch (err)
      {
         return `Aborting as 'tsconfig' path is specified, but failed to load; '${
          err.message}'\ntsconfig path: ${config.tsconfigPath}`;
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
      return `Aborting as 'config.compilerOptions' failed validation.`;
   }

   return compilerOptions;
}

/**
 * Loads `typedocPath` option.
 *
 * @param {GenerateConfig}  config - Generate config.
 *
 * @returns {object | string} TypeDoc JSON object or error string.
 */
function processTypedoc(config)
{
   let typedocJSON;

   if (config.typedocPath)
   {
      Logger.verbose(`Loading TypeDoc options from 'typedoc' path: ${config.typedocPath}`);

      try
      {
         typedocJSON = JSON.parse(fs.readFileSync(config.typedocPath, 'utf-8').toString());
      }
      catch (err)
      {
         return `Aborting as 'typedoc.json' path is specified, but failed to load; '${
          err.message}'\ntypedoc path: ${config.typedocPath};`;
      }
   }

   return typedocJSON;
}

/**
 * @typedef {object} GenerateConfig
 *
 * @property {'compact' | 'flat'}   [dmtNavStyle] Modify navigation module paths to be flat or compact singular paths.
 *
 * @property {string}   [exportCondition='types'] The export condition to query for `package.json` entry points.
 *
 * @property {Iterable<'dom' | 'esm' | 'worker'>}  [linkPlugins] All API link plugins to load.
 *
 * @property {'all' | 'verbose' | 'info' | 'warn' | 'error'} [logLevel='info'] Defines the logging level.
 *
 * @property {string}   [output='docs'] Provide a directory path for generated documentation.
 *
 * @property {string}   [packageName] Package name substitution; instead of `name` attribute of `package.json`.
 *
 * @property {string}   [path] Path to a file to use as a single entry point or specific 'package.json' to load.
 *
 * @property {string}   [tsconfigPath] Path to custom 'tsconfig.json' to load.
 *
 * @property {Partial<import('typedoc').TypeDocOptions>}   [typedocOptions] Direct TypeDoc options to set.
 *
 * @property {string}   [typedocPath] Path to custom `typedoc.json` to load.
 */

/**
 * @typedef {object} PkgTypeDocConfig Internal TypeDoc configuration.
 *
 * @property {import('typescript').CompilerOptions} compilerOptions Typescript compiler options.
 *
 * @property {string} cwd Current Working Directory.
 *
 * @property {'compact' | 'flat'} [dmtNavStyle] Modify navigation module paths to be flat or compact singular paths.
 *
 * @property {Record<string, string>} dmtModuleNames Module name substitution.
 *
 * @property {string[]} entryPoints All files to include in doc generation.
 *
 * @property {boolean} entryPointsDTS True if all entry points are Typescript declarations.
 *
 * @property {boolean} fromPackage Indicates that the entry point files are from package exports.
 *
 * @property {boolean} hasCompilerOptions When true indicates that compiler options were loaded from CLI option.
 *
 * @property {Iterable<string>} linkPlugins All API link plugins to load.
 *
 * @property {string} output Documentation output directory.
 *
 * @property {string} packageName The name attribute from associated package.json or custom name from CLI option.
 *
 * @property {object} packageObj Any found package.json object.
 *
 * @property {string} packageFilepath File path of found package.json.
 *
 * @property {object} typedocJSON Options loaded from `typedocPath` option.
 *
 * @property {Partial<import('typedoc').TypeDocOptions>}   [typedocOptions] Direct TypeDoc options to set.
 */
