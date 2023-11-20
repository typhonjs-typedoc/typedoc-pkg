import {
   Application,
   TSConfigReader }        from 'typedoc';

/**
 * Generate docs
 *
 * @param {ProcessedOptions} config - The processed CLI options.
 *
 * @returns {Promise<void>}
 */
export async function generateDocs(config)
{
   // Create a new TypeDoc application instance
   const app = new Application();
// console.log(`!! generateDocs - config: `, config)
   // Set TypeDoc options
   // app.options.addReader(new TSConfigReader());
console.log(`!! process.cwd: `, process.cwd())
   app.options.setCompilerOptions(config.entryPoints, {
      module: 7, //"es2022",
      target: 9, //"es2022",
      noImplicitAny: true,
      rootDir: process.cwd(),
      sourceMap: false,
      moduleResolution: 99, //"NodeNext",
      lib: ['lib.dom.d.ts', 'lib.es2022.d.ts'],
   }, [])

   await app.bootstrapWithPlugins({
      name: 'TyphonJS Runtime Library (FVTT)',

      // compilerOptions: {
      // },

      // includes: [
      //    ...config.entryPoints
      // ],

      // Provide a link for the title / name.
      // titleLink: '',

      // Disables the source links as they reference the d.ts files.
      disableSources: true,

      // TODO: Sets favicon.
      // dmtFavicon: './assets/icons/favicon.ico',

      // Removes the default module page including from navigation & breadcrumbs
      dmtRemoveDefaultModule: true,

      // Removes the top level navigation sidebar namespace SVG icon associated with the sub-path exports.
      dmtRemoveNavTopLevelIcon: true,

      entryPoints: config.entryPoints,

      // Excludes any private members including the `#private;` member added by Typescript.
      excludePrivate: true,

      // For Typedoc v0.24+; sorts the main index for a namespace; not the sidebar tab.
      // groupOrder,

      // Sorts the sidebar symbol types.
      // kindSortOrder,

      // Hide the documentation generator footer.
      hideGenerator: true,

      // Sets log level.
      logLevel: config.logLevel,

      // New option in 0.24.8 required to render full navigation tree.
      navigation: {
         fullTree: true
      },

      // Provides links for the top nav bar
      // navigationLinks,

      // Output directory for the generated documentation
      out: config.out,

      plugin: [
         '@typhonjs-typedoc/typedoc-theme-dmt',
         ...config.linkPlugins
      ],

      // Boosts relevance for classes and function in search.
      // searchGroupBoosts,

      theme: 'default-modern',

      // Only show the `inherited` filter.
      visibilityFilters: {
         inherited: true,
         protected: true
      }
   });

   // Convert TypeScript sources to a TypeDoc ProjectReflection
   const project = app.convert();

   // Generate the documentation
   if (project)
   {
      await app.generateDocs(project, config.out);
   }
   else
   {
      console.error('Error: No project generated');
   }
}
