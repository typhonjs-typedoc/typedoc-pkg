import { isFile }       from '@typhonjs-utils/file-util';

import {
   Application,
   Logger as TDLogger,
   Options,
   PackageJsonReader,
   ReflectionKind,
   TSConfigReader,
   TypeDocReader }      from 'typedoc';

import { Logger }       from '#util';

export const linkPluginMap = new Map([
   ['dom', '@typhonjs-typedoc/ts-lib-docs/typedoc/ts-links/dom/2023'],
   ['esm', '@typhonjs-typedoc/ts-lib-docs/typedoc/ts-links/esm/2023'],
   ['worker', '@typhonjs-typedoc/ts-lib-docs/typedoc/ts-links/worker/2023']
]);

/**
 * Generate docs from typedoc-pkg configuration.
 *
 * @param {import('./').PkgTypeDocConfig} config - typedoc-pkg configuration.
 *
 * @returns {Promise<void>}
 */
export async function generateTypedoc(config)
{
   // Create a new TypeDoc application instance with no default config readers.
   const typedocOptions = await createTypedocOptions(config);

   const optionReaders = [new PackageJsonReader()];

   // If explicit options have been read from CLI configuration avoid adding those option readers.
   if (!config.typedocJSON) { optionReaders.push(new TypeDocReader()); }
   if (!config.hasCompilerOptions) { optionReaders.push(new TSConfigReader()); }

   const app = await Application.bootstrapWithPlugins(typedocOptions, optionReaders);

   setDefaultOptions(config, app.options);

   // Set any extra options for DMT.
   if ('default-modern' === app.options.getValue('theme')) { setDMTOptions(config, app.options); }

   // Set default compiler options or any CLI optional tsconfig compiler options.
   if (!app.options.isSet('compilerOptions') || config.hasCompilerOptions)
   {
      app.options.setCompilerOptions(config.entryPoints, config.compilerOptions, []);
   }

   // Convert TypeScript sources to a TypeDoc ProjectReflection.
   const project = await app.convert();

   // Generate the documentation.
   if (project)
   {
      await app.generateDocs(project, config.output);
   }
   else
   {
      Logger.warn('Warning: No project generated');
   }
}

// Internal implementation -------------------------------------------------------------------------------------------

/**
 * Create the TypeDoc options.
 *
 * @param {import('./').PkgTypeDocConfig}  config - typedoc-pkg configuration.
 *
 * @returns {Partial<import('typedoc').TypeDocOptions>} TypeDoc options.
 */
async function createTypedocOptions(config)
{
   // Temporary TypeDoc Options loading to find any `theme` set by default configuration.
   const options = new Options();
   options.addReader(new TypeDocReader());
   options.addReader(new PackageJsonReader());
   await options.read(new TDLogger(), config.cwd);

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
      out: config.output,
   };

   const optionsDoc = Object.assign(optionsDefault, config.typedocJSON ?? {}, optionsRequired);

   if (!Array.isArray(optionsDoc.plugin)) { optionsDoc.plugin = []; }

   // Add DMT theme plugin.
   if (theme === 'default-modern')
   {
      if (!optionsDoc.plugin.includes('@typhonjs-typedoc/typedoc-theme-dmt'))
      {
         optionsDoc.plugin.unshift('@typhonjs-typedoc/typedoc-theme-dmt');
      }
   }

   // Add any API link plugins.
   for (const linkPlugin of config.linkPlugins)
   {
      if (!optionsDoc.plugin.includes(linkPlugin)) { optionsDoc.plugin.push(linkPlugin); }
   }

   return optionsDoc;
}

/**
 * Set default options from typedoc-pkg configuration.
 *
 * @param {import('./').PkgTypeDocConfig}   config - typedoc-pkg configuration.
 *
 * @param {import('typedoc').Options}   options - TypeDoc options.
 */
function setDefaultOptions(config, options)
{
   // Optional values to set if not defined. -------------------------------------------------------------------------

   // Sorts the main index for a namespace / module; not the sidebar tab.
   if (!options.isSet('groupOrder')) { options.setValue('groupOrder', groupOrder); }

   // Hide generator
   if (!options.isSet('hideGenerator')) { options.setValue('hideGenerator', true); }

   // Sorts the navigation sidebar order for symbol types.
   if (!options.isSet('kindSortOrder')) { options.setValue('kindSortOrder', kindSortOrder); }

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
 * Set DMT options from typedoc-pkg configuration.
 *
 * @param {import('./').PkgTypeDocConfig}   config - typedoc-pkg configuration.
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

   if (config.dmtNavStyle === 'compact') { options.setValue('dmtNavModuleCompact', true); }
   if (config.dmtNavStyle === 'flat') { options.setValue('dmtNavModuleDepth', 0); }

   if (!options.isSet('dmtModuleAsPackage') && config.fromPackage)
   {
      options.setValue('dmtModuleAsPackage', true);
   }
}

/**
 * Sorts the main index for a namespace / module; not the sidebar tab.
 *
 * @type {string[]}
 */
export const groupOrder = [
   'Classes',
   'Constructors',
   'Accessors',
   'Methods',
   'Functions',
   'Namespaces',
   'Variables',
   'Enumerations',
   'Interfaces',
   'Type Aliases',
   '*'
];

/**
 * Sorts the navigation sidebar order for symbol types.
 *
 * @type {ReflectionKind.KindString[]}
 */
export const kindSortOrder = [
   'Project',
   'Module',
   'Class',
   'Interface',
   'Function',
   'Namespace',
   'Variable',
   'Enum',
   'EnumMember',
   'TypeAlias',
   'Reference',
   'Constructor',
   'Property',
   'Accessor',
   'Method',
   'Parameter',
   'TypeParameter',
   'TypeLiteral',
   'CallSignature',
   'ConstructorSignature',
   'IndexSignature',
   'GetSignature',
   'SetSignature'
];
