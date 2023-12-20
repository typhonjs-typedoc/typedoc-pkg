import {
   Application,
   Logger,
   Options,
   PackageJsonReader,
   TSConfigReader,
   TypeDocReader }      from 'typedoc';

import { isFile }       from '../util/index.js';

/**
 * Generate docs
 *
 * @param {import('../cli').ProcessedOptions} config - The processed CLI options.
 *
 * @returns {Promise<void>}
 */
export async function generateDocs(config)
{
   // Create a new TypeDoc application instance with no default config readers.
   const typedocOptions = await createTypedocOptions(config);

   const optionReaders = [new PackageJsonReader()];

   // If explicit options have been read from CLI configuration avoid adding those option readers.
   if (!config.typedocJSON) { optionReaders.push(new TypeDocReader()); }
   if (!config.hasCompilerOptions) { optionReaders.push(new TSConfigReader()); }

   const app = await Application.bootstrapWithPlugins(typedocOptions, optionReaders);

   setCLIOptions(config, app.options);

   // Set any extra options for DMT.
   if ('default-modern' === app.options.getValue('theme')) { setDMTOptions(config, app.options); }

   // Set default compiler options or any CLI optional tsconfig compiler options.
   if (!app.options.isSet('compilerOptions') || config.hasCompilerOptions)
   {
      app.options.setCompilerOptions(config.entryPoints, config.compilerOptions, []);
   }

   // Convert TypeScript sources to a TypeDoc ProjectReflection
   const project = await app.convert();

   // Generate the documentation
   if (project)
   {
      await app.generateDocs(project, config.out);
   }
   else
   {
      console.log('[33m[typedoc-pkg] Warning: No project generated[0m');
   }
}

// Internal implementation -------------------------------------------------------------------------------------------

/**
 * Create the TypeDoc options.
 *
 * @param {import('../cli').ProcessedOptions}  config - Processed CLI options.
 *
 * @returns {object} TypeDoc configuration.
 */
async function createTypedocOptions(config)
{
   // Temporary TypeDoc Options loading to find any `theme` set by default configuration.
   const options = new Options();
   options.addReader(new TypeDocReader());
   options.addReader(new PackageJsonReader());
   await options.read(new Logger(), config.cwd);

   // If no theme is set then use DMT / `default-modern`.
   const theme = options.isSet('theme') ? options.getValue('theme') : 'default-modern';

   /** @type {Partial<import('typedoc').TypeDocOptions>} */
   const optionsDefault = {
      theme,
   };

   /** @type {Partial<import('typedoc').TypeDocOptions>} */
   const optionsRequired = {
      entryPoints: config.entryPoints,

      entryPointStrategy: 'resolve',

      // Output directory for the generated documentation
      out: config.out,
   };

   const optionsDoc = Object.assign(optionsDefault, config.typedocJSON ?? {}, optionsRequired);

   if (!Array.isArray(optionsDoc.plugin)) { optionsDoc.plugin = []; }

   // Add DMT theme plugin.
   if (!optionsDoc.plugin.includes('@typhonjs-typedoc/typedoc-theme-dmt'))
   {
      optionsDoc.plugin.unshift('@typhonjs-typedoc/typedoc-theme-dmt');
   }

   return optionsDoc;
}

/**
 * Set options from CLI options.
 *
 * @param {import('../cli').ProcessedOptions}   config - CLI options.
 *
 * @param {import('typedoc').Options}   options - TypeDoc options.
 */
function setCLIOptions(config, options)
{
   const plugin = options.getValue('plugin');

   // Add any API link plugins.
   plugin.push(...config.linkPlugins);

   options.setValue('plugin', plugin);

   // Optional values to set if not defined. -------------------------------------------------------------------------

   // Hide generator
   if (!options.isSet('hideGenerator')) { options.setValue('hideGenerator', true); }

   // Handle defaults options when all entry points are Typescript declarations. -------------------------------------

   if (config.entryPointsDTS)
   {
      // Disables the source links as they reference the d.ts files.
      if (!options.isSet('disableSources')) { options.setValue('disableSources', true); }

      // Excludes any private members including the `#private;` member added by Typescript.
      if (!options.isSet('excludePrivate')) { options.setValue('excludePrivate', true); }

      // Only show the `inherited` and `protected` filters.
      if (!options.isSet('visibilityFilters'))
      {
         options.setValue('visibilityFilters', { inherited: true, protected: true });
      }
   }
}

/**
 * Set DMT options from CLI options.
 *
 * @param {import('../cli').ProcessedOptions}   config - CLI options.
 *
 * @param {import('typedoc').Options}   options - TypeDoc options.
 */
function setDMTOptions(config, options)
{
   // Automatic check for local `favicon.ico`.
   const dmtFavicon = isFile('./favicon.ico') ? './favicon.ico' :
    isFile('./assets/docs/favicon.ico') ? './assets/docs/favicon.ico' : void 0;

   if (!options.isSet('dmtFavicon') && dmtFavicon) { options.setValue('dmtFavicon', dmtFavicon); }

   if (!options.isSet('dmtModuleNames') && config.dmtModuleNames)
   {
      options.setValue('dmtModuleNames', config.dmtModuleNames);
   }

   if (!options.isSet('dmtNavModuleCompact') && config.dmtNavCompact) { options.setValue('dmtNavModuleCompact', true); }

   if (!options.isSet('dmtNavModuleDepth') && config.dmtNavFlat) { options.setValue('dmtNavModuleDepth', 0); }

   if (!options.isSet('dmtModuleAsPackage') && config.fromPackage)
   {
      options.setValue('dmtModuleAsPackage', true);
   }
}
