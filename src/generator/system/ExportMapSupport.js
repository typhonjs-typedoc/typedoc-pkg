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

import { Logger }             from '#util';

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
      return packageJson.exportCondition === 'types' ? this.#createExportMapTypes(packageJson) :
       this.#createExportMapCondition(packageJson);
   }

   /**
    * Processes the `exportsMap` output and creates a `dmtModuleNames` remapping object for the DMT to remap TypeDoc
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
               Logger.verbose(`Could not resolve wildcard export for: "${exportPath}: "${globEntryPath}"`);
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
   //
   // /**
   //  * Processes the `exportsMap` output and creates a `dmtModuleNames` remapping object for the DMT to remap TypeDoc
   //  * module names to match the package.json export based on the parsed condition. Includes support for sub-path export
   //  * patterns.
   //  *
   //  * @param {import('../data/PackageJson').PackageJson[]}  allPackages - All packages.
   //  */
   // static processExportMaps(allPackages)
   // {
   //    for (const packageJson of allPackages)
   //    {
   //       const exportMap = packageJson.exportMap;
   //       if (!exportMap) { continue; }
   //
   //       const origCWD = process.cwd();
   //       process.chdir(packageJson.dirpath);
   //
   //       const packageName = packageJson.name;
   //       const packageReadmePath = path.resolve(`${packageJson.dirpath}/README.md`);
   //
   //       for (const [filepath, exportData] of exportMap.entries())
   //       {
   //          const { entryPath, exportPath, globEntryPath } = exportData;
   //
   //          let resolvedPackageName;
   //
   //          if (isGlob(exportPath) && globEntryPath)
   //          {
   //             // Remove any leading relative path / replace first wildcard occurrence with a capture group.
   //             const regexPattern = globEntryPath.replace(/^(\.+\/)+/g, '').replace(/\*/, '(.*)');
   //
   //             // Match / Capture / Replace wildcard.
   //             const match = entryPath.match(new RegExp(`${regexPattern}`));
   //             if (!match)
   //             {
   //                Logger.verbose(`Could not resolve wildcard export for: "${exportPath}: "${globEntryPath}"`);
   //                continue;
   //             }
   //
   //             const resolvedExportPath = exportPath.replaceAll('*', match[1]);
   //             resolvedPackageName = path.join(packageName, resolvedExportPath);
   //          }
   //          else
   //          {
   //             resolvedPackageName = path.join(packageName, exportPath);
   //          }
   //
   //          // Process dmtModuleReadme ----------------------------------------------------------------------------------
   //
   //          let readmePath;
   //
   //          // Default export so look for README.md in package root.
   //          if (resolvedPackageName === packageJson.name)
   //          {
   //             // Only include it when there are multiple packages are being processed otherwise the main index for a
   //             // single package has the package README.
   //             if (allPackages.length > 1 && isFile(packageReadmePath)) { readmePath = packageReadmePath; }
   //          }
   //          else // Sub-path export so look for README in directory of the export path.
   //          {
   //             const subReadmePath = path.resolve(`${path.dirname(entryPath)}/README.md`);
   //
   //             // Verify any sub-path exports located in the root package directory don't pick up the main `README.md`.
   //             if (subReadmePath !== packageReadmePath && isFile(subReadmePath)) { readmePath = subReadmePath; }
   //          }
   //
   //          PkgTypeDocMapping.addMapping(filepath, resolvedPackageName, readmePath);
   //       }
   //
   //       process.chdir(origCWD);
   //    }
   // }

   // Internal implementation ----------------------------------------------------------------------------------------

   /**
    * Generically processes `package.json` exports conditions from user supplied condition.
    *
    * @param {import('../data/PackageJson').PackageJson} packageJson - Associated `package.json`.
    *
    * @returns {import('../types').ExportMap} Resolved file paths for given export condition.
    */
   static #createExportMapCondition(packageJson)
   {
      /** @type {import('../types').ExportMap} */
      const exportMap = new Map();
      const exportLog = [];

      const processExport = (pEntryPath, pExportPath, pGlobEntryPath) =>
      {
         if (!isFile(pEntryPath))
         {
            Logger.warn(`Warning: export condition is not a file; "${pExportPath}": ${pEntryPath}`);
            return;
         }

         const filepath = path.resolve(pEntryPath);

         if (exportMap.has(filepath)) { return; }

         exportMap.set(filepath, { entryPath: pEntryPath, exportPath: pExportPath, globEntryPath: pGlobEntryPath });
         exportLog.push(`"${pExportPath}": ${getRelativePath({ basepath: packageJson.dirpath, filepath })}`);
      };

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

         const entryPath = result[0];

         if (typeof entryPath !== 'string') { continue; }

         // Currently `resolve.exports` does not allow filtering out the `default` condition.
         // See: https://github.com/lukeed/resolve.exports/issues/30

         if (!regexAllowedFiles.test(entryPath)) { continue; }

         if (isGlob(exportPath) || isGlob(entryPath))
         {
            // Find all local files that match the entry path wildcard.
            const globEntryPaths = globSync(entryPath);
            for (const globEntryPath of globEntryPaths)
            {
               processExport(path.toUnix(globEntryPath), exportPath, entryPath);
            }
         }
         else
         {
            processExport(entryPath, exportPath);
         }
      }

      // Log any entry points found.
      if (exportLog.length)
      {
         Logger.verbose(`Loading entry points from 'package.json' export condition '${packageJson.exportCondition}':`);
         for (const entry of exportLog) { Logger.verbose(entry); }
      }

      return exportMap;
   }

   /**
    * Specifically parse the `types` export condition with a few extra sanity checks.
    *
    * @param {import('../data/PackageJson').PackageJson} packageJson - Associated `package.json`.
    *
    * @returns {import('../types').ExportMap} Resolved file paths for given export condition.
    */
   static #createExportMapTypes(packageJson)
   {
      /** @type {import('../types').ExportMap} */
      const exportMap = new Map();
      const exportLog = [];

      const processExport = (pEntryPath, pExportPath, pGlobEntryPath) =>
      {
         if (!isDTSFile(pEntryPath))
         {
            Logger.warn(`Warning: export condition is not a DTS file; "${pExportPath}": ${pEntryPath}`);
            return;
         }

         const filepath = path.resolve(pEntryPath);

         if (exportMap.has(filepath)) { return; }

         exportMap.set(filepath, { entryPath: pEntryPath, exportPath: pExportPath, globEntryPath: pGlobEntryPath });
         exportLog.push(`"${pExportPath}": ${getRelativePath({ basepath: packageJson.dirpath, filepath })}`);
      };

      for (const exportPath in packageJson.exports)
      {
         let result;

         try
         {
            result = resolvePkg.exports(packageJson.data, exportPath, { conditions: ['types'] });
         }
         catch (err)
         {
            continue;
         }

         if (!Array.isArray(result) || result.length === 0) { continue; }

         const entryPath = result[0];

         if (typeof entryPath !== 'string') { continue; }

         // Currently `resolve.exports` does not allow filtering out the `default` condition.
         // See: https://github.com/lukeed/resolve.exports/issues/30
         if (!regexIsDTSFile.test(entryPath)) { continue; }

         if (isGlob(exportPath) || isGlob(entryPath))
         {
            // Find all local files that match the entry path wildcard.
            const globEntryPaths = globSync(entryPath);
            for (const globEntryPath of globEntryPaths)
            {
               processExport(path.toUnix(globEntryPath), exportPath, entryPath);
            }
         }
         else
         {
            processExport(entryPath, exportPath);
         }
      }

      // Log any entry points found.
      if (exportLog.length)
      {
         Logger.verbose(`Loading entry points from 'package.json' export condition 'types':`);
         for (const entry of exportLog) { Logger.verbose(entry); }
      }

      return exportMap;
   }
}
