import {
   ProjectReflection,
   ReflectionKind,
   RendererEvent }   from 'typedoc';

import { logger }    from '#util';

/**
 * Provides a plugin to verbosely log any unknown symbols.
 *
 * @param {import('typedoc').Application} app - Typedoc Application
 */
export function load(app)
{
   const emptyArray = [];

   /**
    * Stores the symbols that failed to resolve.
    *
    * @type {Map<string, string>}
    */
   const failed = new Map();

   /**
    * @param {import('typedoc').Reflection}  reflection -
    *
    * @returns {string} The fully qualified symbol name.
    */
   function getSymbolName(reflection)
   {
      const parts = [];

      while (reflection)
      {
         // Do not include the project reflection.
         if (reflection instanceof ProjectReflection) { break; }

         parts.unshift(reflection.name);
         reflection = reflection.parent;
      }

      return parts.join('.');
   }

   /**
    * @param {import('typedoc').DeclarationReference} ref - Unknown symbol reference.
    *
    * @param {import('typedoc').Reflection}  refl - Source reflection.
    */
   function handleUnknownSymbol(ref, refl)
   {
      if (ref.moduleSource)
      {
         const symbolPath = ref.symbolReference?.path ?? emptyArray;

         const name = symbolPath?.map((path) => path.path).join('.');

         if (!name) { return; }

         const fullName = `${ref.moduleSource}/${name}`;

         if (!failed.has(fullName))
         {
            failed.set(fullName, `[link-checker] ${name} from ${ref.moduleSource} in ${
             getSymbolName(refl)} (${ReflectionKind.singularString(refl.kind)})`);
         }
      }
   }

   app.converter.addUnknownSymbolResolver(handleUnknownSymbol);

   app.renderer.once(RendererEvent.END, () =>
   {
      if (failed.size)
      {
         logger.warn('[link-checker] Failed to resolve the following reflections / types:');

         const keys = [...failed.keys()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
         for (const key of keys) { logger.warn(failed.get(key)); }
      }
   });
}
