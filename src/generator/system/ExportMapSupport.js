import {
   getRelativePath,
   isFile }                   from '@typhonjs-utils/file-util';
import { globSync }           from 'glob';
import isGlob                 from 'is-glob';
import * as resolvePkg        from "resolve.exports";
import path                   from 'upath';

import { PkgTypeDocMapping }  from './PkgTypeDocMapping.js';

import {
   isDTSFile,
   regexAllowedFiles,
   regexIsDTSFile }           from '../validation.js';

import { logger }             from '#util';

export class ExportMapSupport
{
   /**
    * Attempt to parse any `package.json` exports conditions.
    *
    * @param {import('../data/PackageJson').PackageJson} packageJson - Processed Options.
    *
    * @returns {import('../types').ExportMap} The resolved export map.
    */
   static create(packageJson)
   {
      return this.#createExportMap(packageJson);
   }

   /**
    * Processes the `ExportMap` output and creates a `dmtModuleNames` remapping object for the DMT to remap TypeDoc
    * module names to match the package.json export based on the parsed condition. Includes support for sub-path export
    * patterns.
    *
    * @param {import('../data/PackageJson').PackageJson}  packageJson -
    *
    * @param {boolean} multiplePackages - When true indicates that multiple packages are being processed. This is used
    *        to include any package README mapping for `dmtModuleReadme` for the main package export.
    */
   static processMapping(packageJson, multiplePackages = false)
   {
      const exportMap = packageJson.exportMap;

      // Sanity case to exit early.
      if (!exportMap || !exportMap.size) { return; }

      const origCWD = process.cwd();
      process.chdir(packageJson.dirpath);

      const packageName = packageJson.name;
      const packageReadmePath = path.resolve(`${packageJson.dirpath}/README.md`);

      for (const [filepath, exportData] of exportMap.entries())
      {
         const { entryPath, exportPath, globEntryPath } = exportData;

         let resolvedPackageName;

         if (isGlob(exportPath) && globEntryPath)
         {
            // Remove any leading relative path / replace first wildcard occurrence with a capture group.
            const regexPattern = globEntryPath.replace(/^(\.+\/)+/g, '').replace(/\*/, '(.*)');

            // Match / Capture / Replace wildcard.
            const match = entryPath.match(new RegExp(`${regexPattern}`));
            if (!match)
            {
               logger.verbose(`Could not resolve wildcard export for: "${exportPath}: "${globEntryPath}"`);
               continue;
            }

            const resolvedExportPath = exportPath.replaceAll('*', match[1]);
            resolvedPackageName = path.join(packageName, resolvedExportPath);
         }
         else
         {
            resolvedPackageName = path.join(packageName, exportPath);
         }

         // Process dmtModuleReadme ----------------------------------------------------------------------------------

         let readmePath;

         // Default export so look for README.md in package root.
         if (resolvedPackageName === packageJson.name)
         {
            // Only include it when there are multiple packages are being processed otherwise the main index for a
            // single package has the package README.
            if (multiplePackages && isFile(packageReadmePath)) { readmePath = packageReadmePath; }
         }
         else // Sub-path export so look for README in directory of the export path.
         {
            const subReadmePath = path.resolve(`${path.dirname(entryPath)}/README.md`);

            // Verify any sub-path exports located in the root package directory don't pick up the main `README.md`.
            if (subReadmePath !== packageReadmePath && isFile(subReadmePath)) { readmePath = subReadmePath; }
         }

         PkgTypeDocMapping.addMapping(filepath, resolvedPackageName, readmePath);
      }

      process.chdir(origCWD);
   }

   // Internal implementation ----------------------------------------------------------------------------------------

   /**
    * Generically processes `package.json` exports conditions from user supplied condition.
    *
    * @param {import('../data/PackageJson').PackageJson} packageJson - Associated `package.json`.
    *
    * @returns {import('../types').ExportMap} Resolved file paths for given export condition.
    */
   static #createExportMap(packageJson)
   {
      /** @type {import('../types').ExportMap} */
      const exportMap = new Map();
      const exportLog = [];

      const processExport = (pEntryPath, pExportPath, pGlobEntryPath) =>
      {
         const filepath = path.resolve(pEntryPath);

         if (exportMap.has(filepath)) { return; }

         exportMap.set(filepath, { entryPath: pEntryPath, exportPath: pExportPath, globEntryPath: pGlobEntryPath });
         exportLog.push(`"${pExportPath}": ${getRelativePath({ basepath: packageJson.dirpath, filepath })}`);
      };

      // Choose the correct result processing function. The `types` condition has alternate verification.
      const processResult = packageJson.exportCondition === 'types' ? this.#processResultTypes :
       this.#processResultSource;

      if (typeof packageJson.exports === 'string' && packageJson.exportCondition === 'default')
      {
         // The exports field is a single string / default export.
         processResult(packageJson.exports, 'exports', processExport);
      }
      else if (this.#isBasicExports(packageJson))
      {
         // The exports field is a plain object w/ key / value strings.
         processResult(packageJson.exports[packageJson.exportCondition], packageJson.exportCondition, processExport);
      }
      else
      {
         // Iterate over each exported sub-path resolving the export condition.
         for (const exportPath in packageJson.exports)
         {
            let result;

            try
            {
               result = resolvePkg.exports(packageJson.data, exportPath, { conditions: [packageJson.exportCondition] });
            }
            catch (err)
            {
               continue;
            }

            if (!Array.isArray(result) || result.length === 0) { continue; }

            processResult(result[0], exportPath, processExport);
         }
      }

      // Log any entry points found.
      if (exportLog.length)
      {
         logger.verbose(`Loading entry points from 'package.json' export condition '${packageJson.exportCondition}':`);
         for (const entry of exportLog) { logger.verbose(entry); }
      }

      return exportMap;
   }

   /**
    * Detects if the exports object defines a single default export with potential export conditions. In this case the
    * key / value pairs are all strings w/ possible null values.
    *
    * @param {import('../data/PackageJson').PackageJson} packageJson - Associated `package.json`.
    *
    * @returns {boolean} Whether the `exports` field is a basic object with string key / values.
    */
   static #isBasicExports(packageJson)
   {
      const exports = packageJson.exports;

      // Determine if this is a basic exports map describing a single default export.
      for (const exportValue of Object.values(exports))
      {
         if (typeof exportValue !== 'string' && exportValue !== null) { return false; }
      }

      return true;
   }

   /**
    * Processes accepted source files for any export condition that isn't `types`.
    *
    * @param {string}   entryPath - Target file path.
    *
    * @param {string}   exportPath - Target export path.
    *
    * @param {Function} processExport - A function to collect results.
    */
   static #processResultSource(entryPath, exportPath, processExport)
   {
      if (typeof entryPath !== 'string') { return; }

      // Currently `resolve.exports` does not allow filtering out the `default` condition.
      // See: https://github.com/lukeed/resolve.exports/issues/30

      if (!regexAllowedFiles.test(entryPath)) { return; }

      if (isGlob(exportPath) || isGlob(entryPath))
      {
         // Find all local files that match the entry path wildcard.
         const globEntryPaths = globSync(entryPath);
         for (const globEntryPath of globEntryPaths)
         {
            const pEntryPath = path.toUnix(globEntryPath);

            if (!isFile(pEntryPath))
            {
               logger.warn(`Warning: export condition is not a file; "${exportPath}": ${pEntryPath}`);
               continue;
            }

            processExport(pEntryPath, exportPath, entryPath);
         }
      }
      else
      {
         processExport(entryPath, exportPath);
      }
   }

   /**
    * Processes accepted type declaration files for the `types` export condition.
    *
    * @param {string}   entryPath - Target file path.
    *
    * @param {string}   exportPath - Target export path.
    *
    * @param {Function} processExport - A function to collect results.
    */
   static #processResultTypes(entryPath, exportPath, processExport)
   {
      if (typeof entryPath !== 'string') { return; }

      // Currently `resolve.exports` does not allow filtering out the `default` condition.
      // See: https://github.com/lukeed/resolve.exports/issues/30
      if (!regexIsDTSFile.test(entryPath)) { return; }

      if (isGlob(exportPath) || isGlob(entryPath))
      {
         // Find all local files that match the entry path wildcard.
         const globEntryPaths = globSync(entryPath);
         for (const globEntryPath of globEntryPaths)
         {
            const pEntryPath = path.toUnix(globEntryPath);

            if (!isDTSFile(pEntryPath))
            {
               logger.warn(`Warning: export condition is not a DTS file; "${exportPath}": ${pEntryPath}`);
               continue;
            }

            processExport(pEntryPath, exportPath, entryPath);
         }
      }
      else
      {
         processExport(entryPath, exportPath);
      }
   }
}
