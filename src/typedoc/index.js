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
   const app = new Application();

   const dmtFavicon = fs.existsSync('favicon.ico') ? './favicon.ico' : void 0;

   await app.bootstrapWithPlugins({
      // Disables the source links as they reference the d.ts files.
      disableSources: true,

      // Set favicon.
      dmtFavicon,

      // Removes the default module page including from navigation & breadcrumbs
      dmtRemoveDefaultModule: true,

      // Removes the top level navigation sidebar namespace SVG icon associated with the sub-path exports.
      dmtRemoveNavTopLevelIcon: true,

      entryPoints: config.entryPoints,

      // Excludes any private members including the `#private;` member added by Typescript.
      excludePrivate: true,

      // Hide the documentation generator footer.
      hideGenerator: true,

      // Sets log level.
      logLevel: config.logLevel,

      // New option in 0.24.8 required to render full navigation tree.
      navigation: {
         fullTree: true
      },

      // Output directory for the generated documentation
      out: config.out,

      plugin: [
         '@typhonjs-typedoc/typedoc-theme-dmt',
         ...config.linkPlugins
      ],

      theme: 'default-modern',

      // Only show the `inherited` and `protected` filters.
      visibilityFilters: {
         inherited: true,
         protected: true
      }
   });

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
   const project = app.convert();

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
