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
   const dmtFavicon = fs.existsSync('./favicon.ico') ? './favicon.ico' :
    fs.existsSync('./assets/docs/favicon.ico') ? './assets/docs/favicon.ico' : void 0;

   // Create a new TypeDoc application instance
   const app = await Application.bootstrapWithPlugins({
      // Disables the source links as they reference the d.ts files.
      disableSources: true,

      // Set favicon.
      dmtFavicon,

      entryPoints: config.entryPoints,

      // Excludes any private members including the `#private;` member added by Typescript.
      excludePrivate: true,

      // Hide the documentation generator footer.
      hideGenerator: true,

      // Sets log level.
      logLevel: config.logLevel,

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
