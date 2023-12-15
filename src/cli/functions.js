import fs                     from 'node:fs';
import path                   from 'node:path';

import { getFileList }        from '@typhonjs-utils/file-util';
import { getPackageWithPath } from '@typhonjs-utils/package-json';
import * as resolvePkg        from 'resolve.exports';

import { LogLevel }           from 'typedoc';

import { generateDocs }       from '../typedoc/index.js';

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
      fromPackageExports: false,
      packageObj,
      packageFilepath: filepath
   };

   const isVerbose = typeof opts?.verbose === 'boolean' ? opts.verbose : false;

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
   const dtsPaths = new Set();

   if (typeof opts?.file === 'string')
   {
      const filepath = opts.file;

      if (!fs.existsSync(filepath)) { exit(`Invalid options: the 'file' specified does not exist.`); }

      const resolvedPath = path.resolve(filepath);
      dtsPaths.add(resolvedPath);

      if (isVerbose) { verbose(`Loading declarations from file path specified: \n${resolvedPath}`); }
   }
   else if (typeof opts?.path === 'string')
   {
      const dirpath = opts.path;

      if (!fs.existsSync(dirpath)) { exit(`Invalid options: the 'path' specified does not exist.`); }

      if (!isDirectory(dirpath)) { exit(`Invalid options: the 'path' specified is not a directory.`); }

      // Get all files ending in `.ts` that are not declarations in the entry point folder or sub-folders. These TS files
      // will be compiled and added to the declaration bundle generated as synthetic wildcard exports.
      const dtsFilepaths = await getFileList({
         dir: dirpath,
         includeFile: /\.d\.(ts|mts)$/,
         walk: true
      });

      if (isVerbose) { verbose(`Loading declarations from path specified:`); }

      for (const dtsPath of dtsFilepaths)
      {
         const resolvedPath = path.resolve(dirpath, dtsPath);

         if (dtsPaths.has(resolvedPath)) { continue; }
         dtsPaths.add(resolvedPath);

         if (isVerbose) { verbose(resolvedPath); }
      }
   }
   else
   {
      config.fromPackageExports = true;

      const packageObj = config.packageObj;

      if (!packageObj) { exit(`No 'package.json' found in: \n${config.cwd}`); }

      if (typeof packageObj?.types === 'string')
      {
         if (isVerbose) { verbose(`Loading declarations from package.json 'types' property':`); }

         if (!isDTSFile(packageObj.types))
         {
            warn(`'types' property in package.json is not a declaration file: ${packageObj.types}`);
         }
         else
         {
            if (isVerbose) { verbose(packageObj.typings); }
         }
      }
      else if (typeof packageObj?.typings === 'string')
      {
         if (isVerbose) { verbose(`Loading declarations from package.json 'typings' property':`); }

         if (!isDTSFile(packageObj.typings))
         {
            warn(`'typings' property in package.json is not a declaration file: ${packageObj.typings}`);
         }
         else
         {
            if (isVerbose) { verbose(packageObj.typings); }
         }
      }
      else
      {
         if (typeof packageObj?.exports !== 'object')
         {
            exit(`No 'exports' conditions found in 'package.json': \n${config.packageFilepath}`);
         }

         if (isVerbose) { verbose(`Loading declarations from 'package.json' export conditions:`); }

         for (const exportPath in packageObj.exports)
         {
            const result = resolvePkg.exports(packageObj, exportPath, { conditions: ['types'] });

            if (!Array.isArray(result) || result.length === 0) { continue; }

            const typesPath = result[0];

            if (typeof typesPath !== 'string') { continue; }

            // Currently `resolve.exports` does not allow filtering out the `default` condition.
            // See: https://github.com/lukeed/resolve.exports/issues/30
            if (!typesPath.endsWith('.d.ts') && !typesPath.endsWith('.d.mts') && !typesPath.endsWith('.d.cts'))
            {
               continue;
            }

            if (!isDTSFile(typesPath))
            {
               warn(`Warning: export condition is not a file; "${exportPath}": ${typesPath}`);
               continue;
            }

            // Consider `dts-buddy` and cases where multiple export conditions point to the same DTS file.
            if (dtsPaths.has(typesPath)) { continue; }

            dtsPaths.add(path.resolve(typesPath));

            if (isVerbose) { verbose(`"${exportPath}": ${typesPath}`); }
         }
      }
   }

   if (dtsPaths.size === 0)
   {
      warn(`No Typescript declarations found to load for documentation generation.`);
      process.exit(1);
   }

   return [...dtsPaths];
}


/**
 * @param {string}   filepath - Path to check.
 *
 * @returns {boolean} Returns if the given path is a file.
 */
function isDTSFile(filepath)
{
   try
   {
      const stats = fs.statSync(filepath);
      if (!stats.isFile()) { return false; }
   }
   catch (err)
   {
      return false;
   }

   return !(!filepath.endsWith('.d.ts') && !filepath.endsWith('.d.mts') && !filepath.endsWith('.d.cts'));
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
      exit(err.message);
   }

   return false;
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
   console.error(`[31m[typedoc-d-ts] ${message}[0m`);
   if (exit) { process.exit(1); }
}

/**
 * Log a verbose message.
 *
 * @param {string} message - A message.
 */
function verbose(message)
{
   console.log(`[35m[typedoc-d-ts] ${message}[0m`);
}

/**
 * Log a warning message.
 *
 * @param {string} message - A message.
 */
function warn(message)
{
   console.warn(`[33m[typedoc-d-ts] ${message}[0m`);
}

/**
 * @typedef {object} ProcessedOptions
 *
 * @property {boolean} allDTSFiles When true all entry point files are Typescript declarations.
 *
 * @property {string} cwd Current Working Directory.
 *
 * @property {boolean} dmtFlat Module paths should be flattened.
 *
 * @property {string[]} entryPoints All declaration files to include in doc generation.
 *
 * @property {boolean} fromPackageExports Indicates that the entry point files are from package exports.
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
