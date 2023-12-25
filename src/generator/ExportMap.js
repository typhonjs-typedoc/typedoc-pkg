import {
   commonPath,
   getRelativePath,
   isFile }             from '@typhonjs-utils/file-util';
import { globSync }     from 'glob';
import isGlob           from 'is-glob';
import * as resolvePkg  from "resolve.exports";
import path             from 'upath';

import {
   isDTSFile,
   regexAllowedFiles,
   regexIsDTSFile }     from './validation.js';

import { Logger }       from '#util';

/**
 * @augments {Map<string, { entryPath: string, exportPath: string, globEntryPath: string }>}
 */
export class ExportMap extends Map
{
   /** @type {string} */
   #cwd;

   /** @type {string} */
   #packageName;

   /**
    * @param {string} packageName - Package name.
    *
    * @param {string} cwd - The working directory for this package.
    */
   constructor(packageName, cwd)
   {
      super();

      this.#packageName = packageName;
      this.#cwd = cwd;
   }

   /**
    * @returns {string} The working directory for this package.
    */
   get cwd() { return this.#cwd; }

   /**
    * @returns {string} Package name.
    */
   get packageName() { return this.#packageName; }

   /**
    * Processes the `exportsMap` output and creates a `dmtModuleNames` remapping object for the DMT to remap TypeDoc
    * module names to match the package.json export based on the parsed condition. Includes support for sub-path export
    * patterns.
    *
    * @param {import('./').GenerateConfig}   config - Generate config.
    *
    * @param {import('./').PkgTypeDocConfig} pkgConfig - PkgTypeDocConfig.
    *
    * @param {Set<string>}                   allFilepaths - All entry point file paths.
    *
    * @param {Iterable<ExportMap>}           exportMaps - All export maps to process.
    */
   static processExportMaps(config, pkgConfig, allFilepaths, exportMaps)
   {
      processExportMaps(config, pkgConfig, allFilepaths, exportMaps);
   }

   /**
    * Attempt to parse any `package.json` exports conditions.
    *
    * @param {import('./').GenerateConfig} config - Processed Options.
    *
    * @param {object}         packageObj - Package object.
    *
    * @returns {ExportMap | undefined} The resolved export map.
    */
   static processPathExports(config, packageObj)
   {
      if (typeof packageObj?.exports !== 'object')
      {
         Logger.verbose(`No 'exports' conditions found in 'package.json'.`);
         return;
      }

      return config.exportCondition === 'types' ? processExportsTypes(config, packageObj) :
       processExportsCondition(config, packageObj);
   }
}

/**
 * Processes the `exportsMap` output and creates a `dmtModuleNames` remapping object for the DMT to remap TypeDoc
 * module names to match the package.json export based on the parsed condition. Includes support for sub-path export
 * patterns.
 *
 * @param {import('./').GenerateConfig}   config - Generate config.
 *
 * @param {import('./').PkgTypeDocConfig} pkgConfig - PkgTypeDocConfig.
 *
 * @param {Set<string>}                   allFilepaths - All entry point file paths.
 *
 * @param {Iterable<ExportMap>}           exportMaps - All export maps to process.
 */
function processExportMaps(config, pkgConfig, allFilepaths, exportMaps)
{
   const dmtModuleNames = {};
   const basepath = commonPath(...allFilepaths);

   for (const exportMap of exportMaps)
   {
      const origCWD = process.cwd();
      process.chdir(exportMap.cwd);

      const filepaths = [...exportMap.keys()];
      const exportData = [...exportMap.values()];

      const packageName = config.packageName ?? exportMap.packageName;

      for (let cntr = 0; cntr < filepaths.length; cntr++)
      {
         const filepath = filepaths[cntr];
         const { entryPath, exportPath, globEntryPath } = exportData[cntr];

         if (isGlob(exportPath) && globEntryPath)
         {
            const relativeDir = path.dirname(getRelativePath({ basepath, filepath }));

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

            if (relativeDir === '.')
            {
               // Path is at the common root, so use filename without extension as package / module name.
               const filename = path.basename(filepath).split('.')[0];

               // Join any resolved export path from the wildcard substitution.
               dmtModuleNames[filename] = path.join(packageName, resolvedExportPath);
            }
            else
            {
               // Attempt a best mapping attempt for how TypeDoc generates the associated module name. The relative path
               // including file name without extension is used except for file names that are `index` which is removed.
               const relativePath = getRelativePath({ basepath, filepath })?.split('.')?.[0]?.replace(/\/index$/, '');

               if (!relativePath) { continue; }

               // Join any resolved export path from the wildcard substitution.
               dmtModuleNames[relativePath] = path.join(packageName, resolvedExportPath);
            }
         }
         else
         {
            const relativeDir = path.dirname(getRelativePath({ basepath, filepath }));

            if (relativeDir === '.')
            {
               // Path is at the common root, so use filename without extension as package / module name.
               const filename = path.basename(filepath).split('.')[0];

               dmtModuleNames[filename] = path.join(packageName, exportPath);
            }
            else
            {
               // Attempt a best mapping attempt for how TypeDoc generates the associated module name. The relative path
               // including file name without extension is used except for file names that are `index` which is removed.
               const relativePath = getRelativePath({ basepath, filepath })?.split('.')?.[0]?.replace(/\/index$/, '');

               if (!relativePath) { continue; }

               // Path is located in a sub-directory, so join it with package name.
               dmtModuleNames[relativePath] = path.join(packageName, exportPath);
            }
         }
      }

      process.chdir(origCWD);
   }

   pkgConfig.dmtModuleNames = dmtModuleNames;
}

// -------------------------------------------------------------------------------------------------------------------

/**
 * Generically processes `package.json` exports conditions from user supplied condition.
 *
 * @param {import('./').GenerateConfig}  config - Processed Options.
 *
 * @param {object}   packageObj - Package object.
 *
 * @returns {ExportMap} Resolved file paths for given export condition.
 */
function processExportsCondition(config, packageObj)
{
   const exportMap = new ExportMap(packageObj.name, process.cwd());
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
      exportLog.push(`"${pExportPath}": ${getRelativePath({ basepath: process.cwd(), filepath })}`);
   };

   for (const exportPath in packageObj.exports)
   {
      let result;

      try
      {
         result = resolvePkg.exports(packageObj, exportPath, { conditions: [config.exportCondition] });
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
      Logger.verbose(`Loading entry points from 'package.json' export condition '${config.exportCondition}':`);
      for (const entry of exportLog) { Logger.verbose(entry); }
   }

   return exportMap;
}

/**
 * Specifically parse the `types` export condition with a few extra sanity checks.
 *
 * @param {import('./').GenerateConfig}  config - Processed Options.
 *
 * @param {object}   packageObj - Package object.
 *
 * @returns {ExportMap} Resolved file paths for given export condition.
 */
function processExportsTypes(config, packageObj)
{
   const exportMap = new ExportMap(packageObj.name, process.cwd());
   const exportLog = [];

   const processExport = (pEntryPath, pExportPath, pGlobEntryPath) =>
   {
      if (!isDTSFile(pEntryPath))
      {
         Logger.warn(`Warning: export condition is not a DTS file; "${pExportPath}": ${pEntryPath}`);
         return;
      }

      const filepath = path.resolve(pEntryPath);

      if (exportMap.has(filepath)) { false; }

      exportMap.set(filepath, { entryPath: pEntryPath, exportPath: pExportPath, globEntryPath: pGlobEntryPath });
      exportLog.push(`"${pExportPath}": ${getRelativePath({ basepath: process.cwd(), filepath })}`);
   };

   for (const exportPath in packageObj.exports)
   {
      let result;

      try
      {
         result = resolvePkg.exports(packageObj, exportPath, { conditions: ['types'] });
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

