import fs                     from 'node:fs';

import {
   commonPath,
   getRelativePath,
   isDirectory,
   isFile }                   from '@typhonjs-utils/file-util';
import {
   isIterable,
   isObject }                 from '@typhonjs-utils/object';
import { getPackageWithPath } from "@typhonjs-utils/package-json";
import path                   from 'upath';

import { PackageJson }        from './data/PackageJson.js';
import { PkgTypeDocMapping }  from './system/index.js';
import { generateTypedoc }    from './typedoc.js';
import {
   regexAllowedFiles,
   regexIsDTSFile,
   validateCompilerOptions,
   validateConfig }           from './validation.js';

import { logger }             from '#util';

/**
 * Generates docs from given configuration.
 *
 * @param {GenerateConfig | Iterable<GenerateConfig>} configs - Generate config(s).
 *
 * @returns {Promise<void>}
 */
export async function generateDocs(configs)
{
   const allConfigs = isIterable(configs) ? configs : [configs];

   for (const config of allConfigs)
   {
      if (typeof config?.logLevel === 'string')
      {
         if (!logger.isValidLevel(config.logLevel))
         {
            logger.error(`Invalid options: log level must be 'off', 'fatal', 'error', 'warn', 'info', ` +
             `'verbose', 'debug', 'trace', or 'all'; received: '${config.logLevel}'`);
            return;
         }

         logger.setLogLevel(config.logLevel);
      }

      const origCWD = process.cwd();
      const processedConfigOrError = await processConfig(config);
      process.chdir(origCWD);

      if (typeof processedConfigOrError === 'string')
      {
         logger.error(processedConfigOrError);
         return;
      }

      await generateTypedoc(processedConfigOrError);
   }
}

/**
 * Processes an original GenerateConfig object returning all processed data required to compile / bundle DTS.
 *
 * @param {GenerateConfig} origConfig - The original GenerateConfig.
 *
 * @returns {Promise<import('./types').PkgTypeDocConfig | string>} Processed config or error string.
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
      linkChecker: false,
      logLevel: 'info',
      output: 'docs'
   }, origConfig);

   if (!(await validateConfig(config))) { return `Aborting as 'config' failed validation.`; }

   /** @type {Partial<import('./types').PkgTypeDocConfig>} */
   const pkgConfig = {
      dmtModuleNames: {},
      dmtModuleReadme: {},
      dmtNavStyle: config.dmtNavStyle,
      isPackage: false,
      hasCompilerOptions: false,
      linkChecker: config.linkChecker,
      linkPlugins: config.linkPlugins,
      output: config.output,
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
 * @param {import('./types').PkgTypeDocConfig}  pkgConfig - Processed Options.
 *
 * @returns {string | undefined} Error string.
 */
function processPath(config, pkgConfig)
{
   const allEntryPoints = new Set();
   const allPackages = [];

   const paths = isIterable(config.path) ? config.path : [config.path];

   for (const nextPath of paths)
   {
      const origCWD = process.cwd();

      const isPathDir = isDirectory(nextPath);

      if (isPathDir || nextPath.endsWith('package.json'))
      {
         pkgConfig.isPackage = true;

         const dirname = isPathDir ? path.resolve(nextPath) : path.dirname(path.resolve(nextPath));

         process.chdir(dirname);

         const { packageObj, filepath } = getPackageWithPath({ filepath: dirname, basepath: dirname });

         if (!packageObj) { return `No 'package.json' found in: ${dirname}`; }

         if (filepath)
         {
            logger.verbose(
             `Processing: ${getRelativePath({ basepath: origCWD, filepath: path.toUnix(filepath) })}`);
         }

         const packageJson = new PackageJson(packageObj, filepath, config.exportCondition);

         for (const entryPoint of packageJson.entryPoints) { allEntryPoints.add(entryPoint); }

         allPackages.push(packageJson);
      }
      else if (isFile(nextPath) && regexAllowedFiles.test(nextPath))
      {
         const resolvedPath = path.resolve(nextPath);
         allEntryPoints.add(resolvedPath);

         logger.verbose('Loading entry point from file path specified:');
         logger.verbose(resolvedPath);
      }

      process.chdir(origCWD);
   }

   // Quit now if there are no entry points.
   if (allEntryPoints.size === 0) { return 'No entry points found to load for documentation generation.'; }

   // Determine common base path for all entry points to create `dmtModuleNames` mapping.
   const basepath = commonPath(...allEntryPoints);

   // Processes all packages mappings for `dmtModuleNames` / `dmtModuleReadme` in `pkgConfig`.
   if (allPackages.length)
   {
      PkgTypeDocMapping.initialize(pkgConfig, basepath);

      const multiplePackages = allPackages.length > 1;

      for (const packageJson of allPackages) { packageJson.processMapping(multiplePackages); }
   }

   pkgConfig.entryPoints = [...allEntryPoints];

   // Sets true if every entry point a Typescript declaration.
   pkgConfig.entryPointsDTS = pkgConfig.entryPoints.every((filepath) => regexIsDTSFile.test(filepath));
}

/**
 * Creates the Typescript compiler options from default values and / or `tsconfig` CLI option.
 *
 * @param {GenerateConfig}    config - Processed config options.
 *
 * @param {Partial<import('./types').PkgTypeDocConfig>}  pkgConfig - PkgTypeDocConfig.
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
      logger.verbose(`Loading TS compiler options from 'tsconfig' path: ${config.tsconfigPath}`);

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
      logger.verbose(`Loading TypeDoc options from 'typedoc' path: ${config.typedocPath}`);

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
 * @property {'compact' | 'flat' | 'full'}   [dmtNavStyle='full'] Modify navigation module paths to be flat or compact
 * singular paths; default: 'full'.
 *
 * @property {string}   [exportCondition='types'] The export condition to query for `package.json` entry points.
 *
 * @property {boolean}  [linkChecker] Enable debug TypeDoc logging with a unknown symbol link checker.
 *
 * @property {Iterable<'dom' | 'es' | 'worker'>}  [linkPlugins] All API link plugins to load.
 *
 * @property {import('@typhonjs-utils/logger-color').LogLevel} [logLevel='info'] Defines the logging level; default:
 * 'info'.
 *
 * @property {string}   [output='docs'] Provide a directory path for generated documentation.
 *
 * @property {boolean}  [monoRepo=false] When true a single directory path must be specified that will be scanned for
 * all NPM packages.
 *
 * @property {string | Iterable<string>}  [path] Path to a source file, `package.json`, or directory with a
 * `package.json` to use as entry points; you may provide an iterable list of paths.
 *
 * @property {string}   [tsconfigPath] Path to custom `tsconfig.json` to load.
 *
 * @property {Partial<import('typedoc').TypeDocOptions>}   [typedocOptions] Direct TypeDoc options to set.
 *
 * @property {string}   [typedocPath] Path to custom `typedoc.json` to load.
 */
