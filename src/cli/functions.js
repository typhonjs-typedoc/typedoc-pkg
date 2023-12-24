import fs                     from 'node:fs';

import path                   from 'upath';

import { generateDocs }       from '../generator/index.js';

import { Logger }             from '#util';

/**
 * Processes CLI options and invokes `generateDocs`.
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
 * @param {object}   opts - CLI Options.
 *
 * @returns {import('../generator').GenerateConfig} Converted CLI options to GenerateConfig.
 */
function processOptions(opts)
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
      if (!fs.existsSync(opts.path))
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
 * Exit with error message.
 *
 * @param {string} message - A message.
 */
function exit(message)
{
   Logger.error(message);
   process.exit(1);
}
