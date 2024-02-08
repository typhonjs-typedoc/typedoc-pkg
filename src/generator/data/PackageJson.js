import { isFile }             from '@typhonjs-utils/file-util';
import { isObject }           from '@typhonjs-utils/object';
import path                   from 'upath';

import {
   ExportMapSupport,
   PkgTypeDocMapping }        from '../system/index.js';
import { isDTSFile }          from '../validation.js';

import { logger }             from '#util';

export class PackageJson
{
   #dirpath;

   /** @type {Set<string>} */
   #entryPoints = new Set();

   #exportCondition;

   /** @type {import('../types').ExportMap} */
   #exportMap;

   #packageFilepath;

   #packageObj;

   constructor(packageObj, filepath, exportCondition)
   {
      this.#packageObj = packageObj;
      this.#packageFilepath = filepath;
      this.#exportCondition = exportCondition;

      this.#dirpath = path.dirname(filepath);

      if (isObject(packageObj.exports) ||
       (this.#exportCondition === 'default' && typeof packageObj.exports === 'string'))
      {
         this.#exportMap = ExportMapSupport.create(this);
      }
      else
      {
         logger.verbose(`No 'exports' entry found in 'package.json' for export condition: '${this.#exportCondition}'.`);
      }

      this.#process();
   }

   get data()
   {
      return this.#packageObj;
   }

   /**
    * @returns {string} Returns the directory path.
    */
   get dirpath()
   {
      return this.#dirpath;
   }

   /**
    * @returns {Set<string>} All entry points.
    */
   get entryPoints()
   {
      return this.#entryPoints;
   }

   /**
    * @returns {string} GenerateConfig export condition.
    */
   get exportCondition()
   {
      return this.#exportCondition;
   }

   /**
    * @returns {import('../types').ExportMap} Any processed `exports` map.
    */
   get exportMap()
   {
      return this.#exportMap;
   }

   get exports()
   {
      return this.#packageObj.exports;
   }

   /**
    * @returns {string} Returns the package name.
    */
   get name()
   {
      return this.#packageObj.name;
   }

   /**
    * @param {boolean}  multiplePackages - When true indicates that multiple packages are being processed. This is used
    *        to include any package README mapping for `dmtModuleReadme` for the main package export.
    */
   processMapping(multiplePackages = false)
   {
      if (this.#exportMap?.size)
      {
         ExportMapSupport.processMapping(this, multiplePackages);
      }
      // Support the case when `types` / `typings` has been processed instead of export maps.
      else if (this.exportCondition === 'types' && this.#entryPoints.size === 1)
      {
         const filepaths = Array.from(this.entryPoints.keys());

         const packageReadmePath = multiplePackages ? path.resolve(`${this.dirpath}/README.md`) : void 0;
         PkgTypeDocMapping.addMapping(filepaths[0], this.name, isFile(packageReadmePath) ? packageReadmePath : void 0);
      }
   }

   // Internal implementation ----------------------------------------------------------------------------------------

   #process()
   {
      // If there are exports in `package.json` accept the file paths.
      if (this.#exportMap?.size)
      {
         for (const entry of this.#exportMap.keys()) { this.#entryPoints.add(entry); }
      }
      // Otherwise attempt to find `types` or `typings` properties in `package.json` when `exportCondition` is
      // the default; `types`.
      else if (this.exportCondition === 'types')
      {
         if (typeof this.data.types === 'string')
         {
            logger.verbose(`Loading entry point from package.json 'types' property':`);

            if (!isDTSFile(this.data.types))
            {
               logger.warn(`'types' property in package.json is not a declaration file: ${this.data.types}`);
            }
            else
            {
               const resolvedPath = path.resolve(this.data.types);
               logger.verbose(resolvedPath);
               this.#entryPoints.add(path.resolve(resolvedPath));
            }
         }
         else if (typeof this.data.typings === 'string')
         {
            logger.verbose(`Loading entry point from package.json 'typings' property':`);

            if (!isDTSFile(this.data.typings))
            {
               logger.warn(`'typings' property in package.json is not a declaration file: ${this.data.typings}`);
            }
            else
            {
               const resolvedPath = path.resolve(this.data.typings);
               logger.verbose(resolvedPath);
               this.#entryPoints.add(path.resolve(resolvedPath));
            }
         }
      }
   }
}
