import {
   getFileList,
   isDirectory,
   isFile }                   from '@typhonjs-utils/file-util';
import {
   isIterable,
   isObject }                 from '@typhonjs-utils/object';
import { getPackageWithPath } from '@typhonjs-utils/package-json';
import path                   from 'upath';

import { linkPluginMap }      from './typedoc.js';
import ts                     from 'typescript';

import { logger }             from '#util';

// Only allow standard JS / TS files.
export const regexAllowedFiles = /\.(js|mjs|ts|mts)$/;
export const regexIsDTSFile = /\.d\.(cts|ts|mts)$/;

/**
 * @param {string}   filepath - Path to check.
 *
 * @returns {boolean} Returns if the given path is a file.
 */
export function isDTSFile(filepath)
{
   return isFile(filepath) && regexIsDTSFile.test(filepath);
}

/**
 * Validates the TS compiler options.
 *
 * @param {import('type-fest').TsConfigJson.CompilerOptions} compilerOptions - The TS compiler options.
 *
 * @returns {ts.CompilerOptions} The validated compiler options or undefined if failure.
 */
export function validateCompilerOptions(compilerOptions)
{
   // Validate `config.compilerOptions` ------------------------------------------------------------------------------

   // Use the current working directory as the base path.
   const basePath = process.cwd();

   const { options, errors } = ts.convertCompilerOptionsFromJson(compilerOptions, basePath);

   if (errors.length > 0)
   {
      for (const err of errors) { logger.error(`[TS] ${ts.flattenDiagnosticMessageText(err.messageText, '\n')}`); }
      return void 0;
   }

   return options;
}

/**
 * Validates all config object parameters. If no `path` is specified an attempt to load `package.json` from CWD
 * is executed.
 *
 * @param {import('./').GenerateConfig} config - A generate config.
 *
 * @returns {Promise<boolean>} Validation state.
 */
export async function validateConfig(config)
{
   if (config.dmtNavStyle !== void 0 && !(['compact', 'flat', 'full'].includes(config.dmtNavStyle)))
   {
      logger.error(`Error: 'dmtNavStyle' must be 'compact', 'flat', or 'full'.`);
      return false;
   }

   if (typeof config.exportCondition !== 'string')
   {
      logger.error(`Error: 'exportCondition' must be a string.`);
      return false;
   }

   if (config.output !== void 0 && typeof config.output !== 'string')
   {
      logger.error(`Error: 'output' must be a string.`);
      return false;
   }

   if (config.packageName !== void 0 && typeof config.packageName !== 'string')
   {
      logger.error(`Error: 'packageName' must be a string.`);
      return false;
   }

   if (config.monoRepo !== void 0)
   {
      if (typeof config.monoRepo !== 'boolean')
      {
         logger.error(`Error: 'monoRepo' must be a boolean.`);
         return false;
      }

      if (config.monoRepo && !isDirectory(config.path))
      {
         logger.error(`Error: 'monoRepo' is enabled and 'path' is not a directory.`);
         return false;
      }

      const resolvePath = path.resolve(config.path);
      logger.verbose('Searching for all NPM packages under directory:');
      logger.verbose(resolvePath);

      // Get all `package.json` files in the given folder and sub-folders. Any found files will be added to `path`.
      const packageFilepaths = await getFileList({
         dir: resolvePath,
         includeFile: /package\.json$/,
         excludeDir: 'node_modules',
         resolve: true,
         walk: true
      });

      if (!packageFilepaths.length)
      {
         logger.error('No NPM packages found for mono-repo base directory:');
         logger.error(resolvePath);
         return false;
      }

      logger.verbose('Found and expanding path for the following packages:');
      for (const packagePath of packageFilepaths) { logger.verbose(packagePath); }

      config.path = packageFilepaths;
   }

   if (config.path !== void 0)
   {
      if (typeof config.path !== 'string' && !isIterable(config.path))
      {
         logger.error(`Error: 'path' must be a string or iterable list of strings.`);
         return false;
      }

      const paths = isIterable(config.path) ? config.path : [config.path];

      for (const nextPath of paths)
      {
         const unixPath = path.toUnix(nextPath);

         const isPathDir = isDirectory(unixPath);
         const isPathFile = isFile(unixPath);

         if (!(isPathDir || isPathFile))
         {
            logger.error(`Error: 'path' is not a directory or file; ${unixPath}`);
            return false;
         }

         if (isPathFile &&
          !(regexIsDTSFile.test(unixPath) || regexAllowedFiles.test(unixPath) || unixPath.endsWith('package.json')))
         {
            logger.error(`Error: 'path' is not an allowed entry point or 'package.json' file; ${unixPath}`);
            return false;
         }
      }
   }
   else
   {
      const cwd = process.cwd();

      // Find local `package.json` only.
      const { packageObj, filepath } = getPackageWithPath({ filepath: cwd, basepath: cwd });

      if (!packageObj)
      {
         logger.error(`No 'package.json' found in: ${path.toUnix(cwd)}`);
         return false;
      }

      config.path = path.toUnix(filepath);
   }

   if (config.tsconfigPath !== void 0 && !isFile(config.tsconfigPath))
   {
      logger.error(`Error: 'tsconfigPath' is not a file; ${config.tsconfigPath}`);
      return false;
   }

   if (config.typedocOptions !== void 0 && !isObject(config.typedocOptions))
   {
      logger.error(`Error: 'typedocOptions' is not an object.`);
      return false;
   }

   if (config.typedocPath !== void 0 && !isFile(config.typedocPath))
   {
      logger.error(`Error: 'typedocPath' is not a file; ${config.typedocPath}`);
      return false;
   }

   // Process `linkPlugins` last as there is additional verbose logging.
   if (config.linkPlugins !== void 0)
   {
      const plugins = [];

      if (!isIterable(config.linkPlugins))
      {
         logger.error(`Error: 'linkPlugins' must be an iterable list.`);
         return false;
      }

      const entries = new Set(Array.from(config.linkPlugins));

      // Detect when dom and worker are configured together as they are exclusive.
      if (entries.has('dom') && entries.has('worker'))
      {
         logger.error(
          `API link error: You may only include either 'dom' or 'worker' for the DOM API or Web Worker API.`);
         return false;
      }

      for (const entry of entries)
      {
         if (!linkPluginMap.has(entry))
         {
            logger.warn(`API Link warning: Unknown API link '${entry}'.`);
            continue;
         }

         logger.verbose(`Adding API link plugin '${entry}': ${linkPluginMap.get(entry)}`);
         plugins.push(linkPluginMap.get(entry));
      }

      config.linkPlugins = plugins;
   }

   return true;
}
