import fs                     from 'node:fs';

import {
   getRelativePath,
   isDirectory,
   isFile }                   from '@typhonjs-utils/file-util';
import {
   isIterable,
   isObject }                 from '@typhonjs-utils/object';
import { getPackageWithPath } from "@typhonjs-utils/package-json";
import path                   from 'upath';

import { ExportMap }          from './ExportMap.js';

import { generateTypedoc }    from './typedoc.js';

import {
   isDTSFile,
   regexAllowedFiles,
   regexIsDTSFile,
   validateCompilerOptions,
   validateConfig }           from './validation.js';

import { Logger }             from '#util';

/**
 * Generates docs from given configuration.
 *
 * @param {GenerateConfig | Iterable<GenerateConfig>} config - Generate config.
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

   // TODO REMOVE LOGGING
   // console.log(`!! generateDocs - processedConfigOrError: `, processedConfigOrError);
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
      dmtModuleNames: {},
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
   const filepaths = new Set();

   const exportMaps = [];

   const paths = isIterable(config.path) ? config.path : [config.path];

   for (const nextPath of paths)
   {
      const origCWD = process.cwd();

      const isPathDir = isDirectory(nextPath);

      if (isPathDir || nextPath.endsWith('package.json'))
      {
         pkgConfig.fromPackage = true;

         const dirname = isPathDir ? path.resolve(nextPath) : path.dirname(path.resolve(nextPath));

         process.chdir(dirname);

         const { packageObj, filepath } = getPackageWithPath({ filepath: dirname, basepath: dirname });

         if (!packageObj) { return `No 'package.json' found in: ${dirname}`; }

         if (filepath)
         {
            Logger.verbose(
             `Processing: ${getRelativePath({ basepath: origCWD, filepath: path.toUnix(filepath) })}`);
         }

         const exportMap = ExportMap.processPathExports(config, packageObj);
         if (!exportMap) { continue; }

         // If there are exports in `package.json` accept the file paths.
         if (exportMap.size)
         {
            for (const entry of exportMap.keys()) { filepaths.add(entry); }
            exportMaps.push(exportMap);
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
      else if (isFile(nextPath) && regexAllowedFiles.test(nextPath))
      {
         const resolvedPath = path.resolve(nextPath);
         filepaths.add(resolvedPath);

         Logger.verbose('Loading entry point from file path specified:');
         Logger.verbose(resolvedPath);
      }

      process.chdir(origCWD);
   }

   if (filepaths.size === 0)
   {
      return 'No entry points found to load for documentation generation.';
   }

   // Processes all ExportMaps adding `dmtModuleNames` and `dmtModuleReadme` entries to `pkgConfig`.
   if (exportMaps.length) { ExportMap.processExportMaps(config, pkgConfig, filepaths, exportMaps); }

   pkgConfig.entryPoints = [...filepaths];

   // Sets true if every entry point a Typescript declaration.
   pkgConfig.entryPointsDTS = pkgConfig.entryPoints.every((filepath) => regexIsDTSFile.test(filepath));
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
 * @property {string | Iterable<string>}  [path] Path to a source file, `package.json`, or directory with a
 * `package.json` to use as entry points; you may provide an iterable list of paths.
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
