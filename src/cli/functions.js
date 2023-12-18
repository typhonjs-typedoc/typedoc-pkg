import fs                     from 'node:fs';
import path                   from 'node:path';

import { getFileList }        from '@typhonjs-utils/file-util';
import { getPackageWithPath } from '@typhonjs-utils/package-json';
import * as resolvePkg        from 'resolve.exports';

import ts                     from 'typescript';
import { LogLevel }           from 'typedoc';

import { generateDocs }       from '../typedoc/index.js';

// Only allow standard JS / TS files.
const s_ALLOWED_FILES_EXTENSIONS = /\.(js|mjs|ts|mts)$/;

/**
 * Processes CLI options and invokes TypeDoc.
 *
 * @param {object}   opts - CLI options.
 *
 * @returns {Promise<void>}
 */
export async function generate(opts)
{
   const config = await processOptions(opts);

   await generateDocs(config);
}

/**
 * @param {object}   opts - CLI options.
 *
 * @returns {Promise<ProcessedOptions>} Processed options.
 */
async function processOptions(opts)
{
   const cwd = process.cwd();

   // Find local `package.json` only.
   const { packageObj, filepath } = getPackageWithPath({ filepath: cwd, basepath: cwd });

   /** @type {Partial<ProcessedOptions>} */
   const config = {
      cwd,
      fromPackage: false,
      packageObj,
      packageFilepath: filepath
   };

   const isVerbose = typeof opts?.verbose === 'boolean' ? opts.verbose : false;

   config.compilerOptions = processTSConfig(opts, config, isVerbose);
   config.dmtFlat = typeof opts?.['dmt-flat'] === 'boolean' ? opts['dmt-flat'] : false;
   config.entryPoints = await processPath(opts, config, isVerbose);
   config.linkPlugins = processLink(opts, isVerbose);
   config.out = typeof opts?.output === 'string' ? opts.output : 'docs';
   config.logLevel = isVerbose ? LogLevel.Verbose : LogLevel.Info;

   return config;
}

const s_LINK_PLUGINS = new Map([
   ['dom', '@typhonjs-typedoc/ts-lib-docs/typedoc/ts-links/dom/2023'],
   ['esm', '@typhonjs-typedoc/ts-lib-docs/typedoc/ts-links/esm/2023'],
   ['worker', '@typhonjs-typedoc/ts-lib-docs/typedoc/ts-links/worker/2023']
]);

/**
 * Processes `opts.link` to find the appropriate link plugins.
 *
 * @param {object}   opts - CLI options.
 *
 * @param {boolean}  isVerbose - Verbose state.
 *
 * @returns {string[]} List of link plugins enabled.
 */
function processLink(opts, isVerbose)
{
   const plugins = [];

   if (typeof opts?.link === 'string')
   {
      const entries = new Set(opts.link.split(','));

      // Detect when dom and worker are configured together as they are exclusive.
      if (entries.has('dom') && entries.has('worker'))
      {
         exit(`API link error: You may only include either 'dom' or 'worker' for the DOM API or Web Worker API.`);
      }

      for (const entry of entries)
      {
         if (!s_LINK_PLUGINS.has(entry))
         {
            warn(`API Link warning: Unknown API link '${entry}'.`);
            continue;
         }

         if (isVerbose) { verbose(`Adding API link plugin '${entry}': ${s_LINK_PLUGINS.get(entry)}`); }
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
 * @param {ProcessedOptions}  config - Processed Options.
 *
 * @param {boolean}           isVerbose - Verbose logging.
 *
 * @returns {Promise<string[]>} Array of DTS file paths.
 */
async function processPath(opts, config, isVerbose)
{
   let filepaths = new Set();

   if (typeof opts?.path === 'string')
   {
      if (!fs.existsSync(opts.path)) { exit(`Invalid options: the 'path' specified does not exist.`); }

      if (isDirectory(opts.path))
      {
         if (isVerbose) { verbose(`Loading Typescript declarations from directory path specified:`); }

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

            if (isVerbose) { verbose(resolvedPath); }
         }
      }
      else if (isFile(opts.path) && s_ALLOWED_FILES_EXTENSIONS.test(opts.path))
      {
         const resolvedPath = path.resolve(opts.path);
         filepaths.add(resolvedPath);

         if (isVerbose)
         {
            verbose(`Loading entry point from file path specified:`);
            verbose(resolvedPath);
         }
      }
   }
   else
   {
      config.fromPackage = true;

      const packageObj = config.packageObj;

      if (!packageObj) { exit(`No 'package.json' found in: ${config.cwd}`); }

      if (isVerbose)
      {
         verbose(`Processing 'package.json':`);
         verbose(config.packageFilepath);
      }

      const exportsFilepaths = processPathExports(opts, config, packageObj, isVerbose);

      if (exportsFilepaths.size)
      {
         filepaths = exportsFilepaths;
      }
      else
      {
         if (typeof packageObj?.types === 'string')
         {
            if (isVerbose) { verbose(`Loading entry points from package.json 'types' property':`); }

            if (!isDTSFile(packageObj.types))
            {
               warn(`'types' property in package.json is not a declaration file: ${packageObj.types}`);
            }
            else
            {
               const resolvedPath = path.resolve(packageObj.types);
               if (isVerbose) { verbose(resolvedPath); }
               filepaths.add(path.resolve(resolvedPath));
            }
         }
         else if (typeof packageObj?.typings === 'string')
         {
            if (isVerbose) { verbose(`Loading entry points from package.json 'typings' property':`); }

            if (!isDTSFile(packageObj.typings))
            {
               warn(`'typings' property in package.json is not a declaration file: ${packageObj.typings}`);
            }
            else
            {
               const resolvedPath = path.resolve(packageObj.typings);
               if (isVerbose) { verbose(resolvedPath); }
               filepaths.add(path.resolve(resolvedPath));
            }
         }
      }
   }

   if (filepaths.size === 0)
   {
      warn(`No Typescript declarations found to load for documentation generation.`);
      process.exit(1);
   }

   return [...filepaths];
}

/**
 * @param opts
 * @param config
 * @param packageObj
 * @param isVerbose
 *
 * @returns {Set<string>} Any resolved entry points to load.
 */
function processPathExports(opts, config, packageObj, isVerbose)
{
   if (typeof packageObj?.exports !== 'object')
   {
      if (isVerbose) { verbose(`No 'exports' conditions found in 'package.json'.`); }

      return new Set();
   }

   return opts.export === 'types' ? processExportsTypes(packageObj, isVerbose) :
    processExportsCondition(packageObj, opts.export, isVerbose);
}

/**
 * Generically processes `package.json` exports conditions from user supplied condition.
 *
 * @param {object}   packageObj - Package object.
 *
 * @param {string}   condition - Export condition to find.
 *
 * @param {boolean}  isVerbose - Verbose logging.
 *
 * @returns {Set<string>} Resolved file paths for given export condition.
 */
function processExportsCondition(packageObj, condition, isVerbose)
{
   const filepaths = new Set();
   const exportPaths = [];

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

      const filepath = result[0];

      if (typeof filepath !== 'string') { continue; }

      if (!s_ALLOWED_FILES_EXTENSIONS.test(filepath)) { continue; }

      // Currently `resolve.exports` does not allow filtering out the `default` condition.
      // See: https://github.com/lukeed/resolve.exports/issues/30

      // TODO: There is no check here to ensure that the 'default' condition isn't used or determine the type of file.

      if (!isFile(filepath))
      {
         warn(`Warning: export condition is not a file; "${exportPath}": ${filepath}`);
         continue;
      }

      if (filepaths.has(filepath)) { continue; }

      filepaths.add(path.resolve(filepath));
      exportPaths.push(`"${exportPath}": ${filepath}`);
   }

   // Log any entry points found.
   if (exportPaths.length && isVerbose)
   {
      verbose(`Loading entry points from 'package.json' export condition '${condition}':`);
      for (const exportPath of exportPaths) { verbose(exportPath); }
   }

   return filepaths;
}

/**
 * Specifically parse the `types` export condition with a few extra sanity checks.
 *
 * @param {object}   packageObj - Package object.
 *
 * @param {boolean}  isVerbose - Verbose logging.
 *
 * @returns {Set<string>} Resolved file paths for given export condition.
 */
function processExportsTypes(packageObj, isVerbose)
{
   const dtsPaths = new Set();
   const exportPaths = [];

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

      const filepath = result[0];

      if (typeof filepath !== 'string') { continue; }

      // Currently `resolve.exports` does not allow filtering out the `default` condition.
      // See: https://github.com/lukeed/resolve.exports/issues/30
      if (!filepath.endsWith('.d.ts') && !filepath.endsWith('.d.mts') && !filepath.endsWith('.d.cts'))
      {
         continue;
      }

      if (!isDTSFile(filepath))
      {
         warn(`Warning: export condition is not a file; "${exportPath}": ${filepath}`);
         continue;
      }

      // Consider `dts-buddy` and cases where multiple export conditions point to the same DTS file.
      if (dtsPaths.has(filepath)) { continue; }

      dtsPaths.add(path.resolve(filepath));
      exportPaths.push(`"${exportPath}": ${filepath}`);
   }

   // Log any entry points found.
   if (exportPaths.length && isVerbose)
   {
      verbose(`Loading entry points from 'package.json' export condition 'types':`);
      for (const exportPath of exportPaths) { verbose(exportPath); }
   }

   return dtsPaths;
}

/**
 * Creates the Typescript compiler options from default values and / or `tsconfig` CLI option.
 *
 * @param {object}            opts - CLI options.
 *
 * @param {ProcessedOptions}  config - Processed config options.
 *
 * @param {boolean}           isVerbose - Verbose logging.
 *
 * @returns {ts.CompilerOptions} Processed Typescript compiler options.
 */
function processTSConfig(opts, config, isVerbose)
{
   let tsconfigPath;

   // Verify any tsconfig provided path.
   if (opts.tsconfig)
   {
      if (fs.existsSync(opts.tsconfig)) { tsconfigPath = opts.tsconfig; }
      else
      {
         exit(`error: Aborting as 'tsconfig' path is specified, but file does not exist; '${opts.tsconfig}'`);
      }
   }

   /** @type {import('type-fest').TsConfigJson.CompilerOptions} */
   const defaultCompilerOptions = {
      module: 'ES2022',
      target: 'ES2022',
      allowJs: true,
      noEmit: true,
      noImplicitAny: false,
      sourceMap: false,
      moduleResolution: 'Bundler'
   };

   /** @type {import('type-fest').TsConfigJson.CompilerOptions} */
   let tsconfigCompilerOptions = {};

   if (tsconfigPath)
   {
      if (isVerbose) { verbose(`Loading TS compiler options from 'tsconfig' path: ${tsconfigPath}`); }

      try
      {
         const configJSON = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8').toString());
         if (configJSON?.compilerOptions) { tsconfigCompilerOptions = configJSON.compilerOptions; }
      }
      catch (err)
      {
         exit(`Aborting as 'tsconfig' path is specified, but failed to load; '${
          err.message}'\ntsconfig path: ${tsconfigPath};`);
      }
   }

   // ----------------------------------------------------------------------------------------------------------------

   /** @type {import('type-fest').TsConfigJson.CompilerOptions} */
   const compilerOptionsJson = Object.assign(defaultCompilerOptions, tsconfigCompilerOptions);

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
 * @param {string}   filepath - Path to check.
 *
 * @returns {boolean} Returns if the given path is a file.
 */
function isFile(filepath)
{
   try
   {
      const stats = fs.statSync(filepath);
      return stats.isFile();
   }
   catch (err)
   {
      return false;
   }
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
 * @param {string}   dirpath - Path to check.
 *
 * @returns {boolean} Returns if the given path is a directory.
 */
function isDirectory(dirpath)
{
   try
   {
      const stats = fs.statSync(dirpath);
      return stats.isDirectory();
   }
   catch (err)
   {
      return false;
   }
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
      for (const err of errors) { error(`[TS] ${ts.flattenDiagnosticMessageText(err.messageText, '\n')}`); }
      return void 0;
   }

   return options;
}

/**
 * Log an error message.
 *
 * @param {string} message - A message.
 */
function error(message)
{
   console.error(`[31m[typedoc-pkg] ${message}[0m`);
}

/**
 * Exit with error message.
 *
 * @param {string} message - A message.
 *
 * @param {boolean} [exit=true] - Invoke `process.exit`.
 */
function exit(message, exit = true)
{
   console.error(`[31m[typedoc-pkg] ${message}[0m`);
   if (exit) { process.exit(1); }
}

/**
 * Log a verbose message.
 *
 * @param {string} message - A message.
 */
function verbose(message)
{
   console.log(`[35m[typedoc-pkg] ${message}[0m`);
}

/**
 * Log a warning message.
 *
 * @param {string} message - A message.
 */
function warn(message)
{
   console.warn(`[33m[typedoc-pkg] ${message}[0m`);
}

/**
 * @typedef {object} ProcessedOptions
 *
 * @property {boolean} allDTSFiles When true all entry point files are Typescript declarations.
 *
 * @property {ts.CompilerOptions} compilerOptions Typescript compiler options.
 *
 * @property {string} cwd Current Working Directory.
 *
 * @property {boolean} dmtFlat Module paths should be flattened.
 *
 * @property {string[]} entryPoints All declaration files to include in doc generation.
 *
 * @property {boolean} fromPackage Indicates that the entry point files are from package exports.
 *
 * @property {string[]} linkPlugins All API link plugins to load.
 *
 * @property {number} logLevel TypeDoc log level.
 *
 * @property {string} out Documentation output directory.
 *
 * @property {object} packageObj Any found package.json object.
 *
 * @property {string} packageFilepath File path of found package.json.
 */
