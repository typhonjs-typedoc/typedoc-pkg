import { getRelativePath } from '@typhonjs-utils/file-util';

import path                from 'upath';

/**
 * Externalizes the mapping process for the DMT `dmtModuleNames` and `dmtModuleReadme` configuration options that map
 * entry point files to package names.
 */
export class PkgTypeDocMapping
{
   /**
    * The base common path for all entry points processed.
    *
    * @type {string}
    */
   static #basepath;

   /**
    * Target PkgTypeDocConfig object.
    *
    * @type {import('../types').PkgTypeDocConfig}
    */
   static #pkgConfig;

   /**
    * @param {import('../types').PkgTypeDocConfig} pkgConfig - Target PkgTypeDocConfig object.
    *
    * @param {string}   basepath - The base common path for all entry points processed.
    */
   static initialize(pkgConfig, basepath)
   {
      this.#pkgConfig = pkgConfig;
      this.#basepath = basepath;
   }

   /**
    * @param {string}   filepath - The entry point file to map.
    *
    * @param {string}   packageName - The name of the package or sub-path export.
    *
    * @param {string}   [readmePath] - Optional `README.md` path to associate with package export.
    */
   static addMapping(filepath, packageName, readmePath)
   {
      // Process dmtModuleNames --------------------------------------------------------------------------------------

      const relativeDir = path.dirname(getRelativePath({ basepath: this.#basepath, filepath }));

      if (relativeDir === '.')
      {
         // Path is at the common root, so use filename without extension as package / module name.
         const filename = path.basename(filepath).split('.')[0];

         this.#pkgConfig.dmtModuleNames[filename] = packageName;
      }
      else
      {
         // Attempt the best mapping for how TypeDoc generates the associated module name. The relative path
         // including file name without extension is used except for file names that are `index` which is removed.
         const relativePath = getRelativePath({ basepath: this.#basepath, filepath })?.split('.')?.[0]?.replace(
          /\/index$/, '');

         if (!relativePath) { return; }

         // Path is located in a subdirectory, so join it with package name.
         this.#pkgConfig.dmtModuleNames[relativePath] = packageName;
      }

      // Process dmtModuleReadme -------------------------------------------------------------------------------------

      if (typeof readmePath === 'string') { this.#pkgConfig.dmtModuleReadme[packageName] = readmePath; }
   }
}
