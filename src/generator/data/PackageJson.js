import path          from 'upath';

import { ExportMap } from './ExportMap.js';

import { isDTSFile } from '../validation.js';

import { Logger }    from '#util';

export class PackageJson
{
   #dirpath;

   /** @type {Set<string>} */
   #entryPoints = new Set();

   #exportCondition;

   /** @type {ExportMap} */
   #exportMap;

   #packageFilepath;

   #packageObj;

   constructor(packageObj, filepath, exportCondition)
   {
      this.#packageObj = packageObj;
      this.#packageFilepath = filepath;
      this.#exportCondition = exportCondition;

      this.#dirpath = path.dirname(filepath);

      if (typeof packageObj.exports !== 'object')
      {
         Logger.verbose(`No 'exports' conditions found in 'package.json'.`);
      }
      else
      {
         this.#exportMap = ExportMap.create(this);
      }

      this.#process();
   }

   get data()
   {
      return this.#packageObj;
   }

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

   get exportMap()
   {
      return this.#exportMap;
   }

   get exports()
   {
      return this.#packageObj.exports;
   }

   get filepath()
   {
      return this.#packageFilepath;
   }

   get name()
   {
      return this.#packageObj.name;
   }

   #process()
   {
      // If there are exports in `package.json` accept the file paths.
      if (this.#exportMap?.size)
      {
         for (const entry of this.#exportMap.keys()) { this.#entryPoints.add(entry); }
      }
      else // Otherwise attempt to find `types` or `typings` properties in `package.json`.
      {
         if (typeof this.data.types === 'string')
         {
            Logger.verbose(`Loading entry points from package.json 'types' property':`);

            if (!isDTSFile(this.data.types))
            {
               Logger.warn(`'types' property in package.json is not a declaration file: ${this.data.types}`);
            }
            else
            {
               const resolvedPath = path.resolve(this.data.types);
               Logger.verbose(resolvedPath);
               this.#entryPoints.add(path.resolve(resolvedPath));
            }
         }
         else if (typeof this.data.typings === 'string')
         {
            Logger.verbose(`Loading entry points from package.json 'typings' property':`);

            if (!isDTSFile(this.data.typings))
            {
               Logger.warn(`'typings' property in package.json is not a declaration file: ${this.data.typings}`);
            }
            else
            {
               const resolvedPath = path.resolve(this.data.typings);
               Logger.verbose(resolvedPath);
               this.#entryPoints.add(path.resolve(resolvedPath));
            }
         }
      }
   }
}
