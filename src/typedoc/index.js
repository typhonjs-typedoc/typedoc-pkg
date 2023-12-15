import fs               from 'node:fs';

import { Application }  from 'typedoc';

import ts               from 'typescript';

/**
 * Generate docs
 *
 * @param {import('../cli').ProcessedOptions} config - The processed CLI options.
 *
 * @returns {Promise<void>}
 */
export async function generateDocs(config)
{
   // Create a new TypeDoc application instance
   const app = await Application.bootstrapWithPlugins(createConfig(config));

   // Necessary to set compiler options here just before `app.convert` otherwise they are reset.
   app.options.setCompilerOptions(config.entryPoints, {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      noEmit: true,
      noImplicitAny: true,
      sourceMap: false,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
   }, []);

   // Convert TypeScript sources to a TypeDoc ProjectReflection
   const project = await app.convert();

   // Generate the documentation
   if (project)
   {
      await app.generateDocs(project, config.out);
   }
   else
   {
      console.log('[33m[typedoc-d-ts] Warning: No project generated[0m');
   }
}

/**
 * Create the TypeDoc configuration.
 *
 * @param {import('../cli').ProcessedOptions}  config - Processed CLI options.
 *
 * @returns {object} TypeDoc configuration.
 */
function createConfig(config)
{
   /** @type {Partial<import('typedoc').TypeDocOptions>} */
   const configDefault = {
      // Disables the source links as they reference the d.ts files.
      disableSources: true,

      entryPoints: config.entryPoints,

      // Excludes any private members including the `#private;` member added by Typescript.
      excludePrivate: true,

      // Hide the documentation generator footer.
      hideGenerator: true,

      // Sets log level.
      logLevel: config.logLevel,

      // Output directory for the generated documentation
      out: config.out,

      theme: 'default-modern',

      // Only show the `inherited` and `protected` filters.
      visibilityFilters: {
         inherited: true,
         protected: true
      }
   };

   // Load any `typedoc` options via `typedoc-pkg` property in `package.json`.
   const pkgTypedocConfig = typeof config?.packageObj?.['typedoc-pkg'] === 'object' ?
    config.packageObj['typedoc-pkg'] : {};

   const configDocs = Object.assign(configDefault, pkgTypedocConfig);

   // Ensure that `plugins` is defined.
   if (!Array.isArray(configDocs.plugin)) { configDocs.plugin = []; }

   // Add any API link plugins.
   configDocs.plugin.push(...config.linkPlugins);

   // Set any extra options for DMT.
   if (configDocs.theme === 'default-modern') { setDMTOptions(config, configDocs); }

   return configDocs;
}

/**
 * Set DMT options from CLI options.
 *
 * @param {import('../cli').ProcessedOptions}   config - CLI options.
 *
 * @param {object}   configDocs - TypeDoc config.
 */
function setDMTOptions(config, configDocs)
{
   // Add DMT theme plugin.
   if (!configDocs.plugin.includes('@typhonjs-typedoc/typedoc-theme-dmt'))
   {
      configDocs.plugin.unshift('@typhonjs-typedoc/typedoc-theme-dmt');
   }

   const dmtFavicon = fs.existsSync('./favicon.ico') ? './favicon.ico' :
    fs.existsSync('./assets/docs/favicon.ico') ? './assets/docs/favicon.ico' : void 0;

   if (configDocs.dmtFavicon === void 0) { configDocs.dmtFavicon = dmtFavicon; }

   if (configDocs.dmtNavModuleDepth === void 0 && config.dmtFlat) { configDocs.dmtNavModuleDepth = 0; }

   if (configDocs.dmtModuleAsPackage === void 0 && config.fromPackageExports)
   {
      configDocs.dmtModuleAsPackage = true;
   }
}
