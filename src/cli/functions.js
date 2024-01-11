import fs                  from 'node:fs';
import { pathToFileURL }   from 'node:url';

import {
   isDirectory,
   isFile }                from '@typhonjs-utils/file-util';
import {
   isIterable,
   isObject }              from '@typhonjs-utils/object';
import path                from 'upath';

import { generateDocs }    from '../generator/generateDocs.js';

import { logger }          from '#util';

/**
 * Processes CLI options and invokes `generateDocs`.
 *
 * @param {object}   opts - CLI options.
 *
 * @returns {Promise<void>}
 */
export async function generate(opts)
{
   const configs = await processOptions(opts);

   if (isIterable(configs))
   {
      for (const config of configs) { await generateDocs(config); }
   }
   else
   {
      await generateDocs(configs);
   }
}

// Internal implementation -------------------------------------------------------------------------------------------

/**
 * @param {string}   filepath - Filepath of config.
 *
 * @returns {Promise<import('../generate').GenerateConfig | import('../generate').GenerateConfig[]>} Loaded config.
 */
async function loadConfig(filepath)
{
   const module = await import(pathToFileURL(filepath));

   if (module.default === void 0) { exit(`The config does not have a default export: ${filepath}`); }

   if (!isObject(module.default) && !isIterable(module.default))
   {
      exit(`The config file default export is not an object or iterable: ${filepath}`);
   }

   if (isIterable(module.default))
   {
      let i = 0;
      for (const entry of module.default)
      {
         if (!isObject(entry))
         {
            exit(`The config file exports a list, but entry[${i}] is not an object: ${filepath}`);
         }

         i++;
      }
   }

   return module.default;
}

/**
 * @param {object}   opts - CLI Options.
 *
 * @returns {import('../generator').GenerateConfig} Converted CLI options to GenerateConfig.
 */
async function processOptions(opts)
{
   let logLevel;

   // logLevel -------------------------------------------------------------------------------------------------------

   if (typeof opts.loglevel === 'string')
   {
      if (!logger.isValidLevel(opts.loglevel))
      {
         exit(`Invalid options: log level '${opts.loglevel}' must be 'all', 'verbose', 'info', 'warn', or 'error'.`);
      }

      logger.setLogLevel(opts.loglevel);
      logLevel = opts.loglevel;
   }

   return opts.config ? processConfigFile(opts, logLevel) : processConfigDefault(opts, logLevel);
}

/**
 * Creates a GenerateConfig object directly from CLI options.
 *
 * @param {object}   opts - CLI options.
 *
 * @param {string}   logLevel - CLI parsed log level.
 *
 * @returns {import('../generator').GenerateConfig} GenerateConfig from CLI options.
 */
function processConfigDefault(opts, logLevel)
{
   /**
    * @type {import('../generator').GenerateConfig}
    */
   const config = {
      linkChecker: false,
      logLevel
   };

   // path -----------------------------------------------------------------------------------------------------------

   if (typeof opts?.path === 'string')
   {
      if (!fs.existsSync(opts.path))
      {
         exit(`Invalid options: the 'path' specified does not exist.`);
      }

      config.path = opts.path;
   }

   if (opts?.['mono-repo'])
   {
      if (!isDirectory(opts.path))
      {
         exit(`Invalid options: the 'path' specified must be a directory when mono-repo option is enabled.`);
      }

      config.monoRepo = true;
   }

   // dmtNavStyle ----------------------------------------------------------------------------------------------------

   if (opts['dmt-nav-compact'] && opts?.['dmt-nav-flat'])
   {
      exit(`'--dmt-nav-compact' and '--dmt-nav-flat' is enabled; choose only one.`);
   }

   if (typeof opts['dmt-nav-compact'] === 'boolean' && opts['dmt-nav-compact']) { config.dmtNavStyle = 'compact'; }
   if (typeof opts['dmt-nav-flat'] === 'boolean' && opts['dmt-nav-flat']) { config.dmtNavStyle = 'flat'; }

   // linkChecker ----------------------------------------------------------------------------------------------------

   if (typeof opts['link-checker'] === 'boolean' && opts['link-checker']) { config.linkChecker = true; }

   // linkPlugins ----------------------------------------------------------------------------------------------------

   if (typeof opts['api-link'] === 'string') { config.linkPlugins = [...new Set(opts['api-link'].split(','))]; }

   // typedoc --------------------------------------------------------------------------------------------------------

   if (typeof opts.typedoc === 'string') { config.typedocPath = opts.typedoc; }

   // exportCondition ------------------------------------------------------------------------------------------------

   if (typeof opts.export === 'string') { config.exportCondition = opts.export; }

   // output ---------------------------------------------------------------------------------------------------------

   if (typeof opts.output === 'string') { config.output = opts.output; }

   // tsconfigPath ---------------------------------------------------------------------------------------------------

   if (typeof opts.tsconfig === 'string') { config.tsconfigPath = opts.tsconfig; }

   return config;
}

/**
 * Creates a GenerateConfig object from config file.
 *
 * @param {object}   opts - CLI options.
 *
 * @param {string}   logLevel - CLI parsed log level.
 *
 * @returns {Iterable<import('../generator').GenerateConfig>} GenerateConfig list.
 */
async function processConfigFile(opts, logLevel)
{
   const dirname = path.dirname(process.cwd());

   /**
    * @type {import('../generator').GenerateConfig | Iterable<import('../generator').GenerateConfig>}
    */
   let config;

   switch (typeof opts.config)
   {
      // Load default config.
      case 'boolean':
         if (!isFile('./typedoc-pkg.config.js') && !isFile('./typedoc-pkg.config.mjs'))
         {
            exit(`No default config file 'typedoc-pkg.config.[m]js' available in: ${dirname}`);
         }

         if (isFile('./typedoc-pkg.config.js'))
         {
            logger.verbose(`Loading config from path: './typedoc-pkg.config.js'`);
            config = await loadConfig(path.resolve('./typedoc-pkg.config.js'));
         }
         else if (isFile('./typedoc-pkg.config.mjs'))
         {
            logger.verbose(`Loading config from path: './typedoc-pkg.config.mjs'`);
            config = await loadConfig(path.resolve('./typedoc-pkg.config.mjs'));
         }
         break;

      // Load specific config.
      case 'string':
      {
         const configPath = path.resolve(opts.config);

         if (!isFile(configPath)) { exit(`No config file available at: ${configPath}`); }

         logger.verbose(`Loading config from path: '${configPath}'`);
         config = await loadConfig(configPath);
         break;
      }
   }

   const modifyConfig = (config) =>
   {
      if (typeof loglevel === 'string') { config.logLevel = logLevel; }
      if (typeof opts['link-checker'] === 'boolean' && opts['link-checker'])
      {
         config.linkChecker = true;
         config.logLevel = 'debug';
      }
   }

   // Apply any global command line options to overriding config file values.
   if (isIterable(config))
   {
      for (const entry of config) { modifyConfig(entry); }
   }
   else if (isObject(config))
   {
      modifyConfig(config);
   }

   return config;
}

/**
 * Exit with error message.
 *
 * @param {string} message - A message.
 */
function exit(message)
{
   logger.error(message);
   process.exit(1);
}
