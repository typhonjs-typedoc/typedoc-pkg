import fs   from 'node:fs';

import path from 'upath';

/**
 * @param {string}   filepath - Path to check.
 *
 * @returns {boolean} Returns if the given path is a file.
 */
export function isFile(filepath)
{
   try
   {
      const stats = fs.statSync(filepath);
      return stats.isFile();
   }
   catch (err)
   {
      return false;
   }
}

/**
 * @param {string}   filepath - Path to check.
 *
 * @returns {boolean} Returns if the given path is a file.
 */
export function isDTSFile(filepath)
{
   return isFile(filepath) &&
    !(!filepath.endsWith('.d.ts') && !filepath.endsWith('.d.mts') && !filepath.endsWith('.d.cts'));
}

/**
 * @param {string}   dirpath - Path to check.
 *
 * @returns {boolean} Returns if the given path is a directory.
 */
export function isDirectory(dirpath)
{
   try
   {
      const stats = fs.statSync(dirpath);
      return stats.isDirectory();
   }
   catch (err)
   {
      return false;
   }
}

/**
 * Returns relative path from provided current working directory.
 *
 * @param {string}   filepath - Path to make relative.
 *
 * @param {string}   [cwd=process.cwd()] Current working directory.
 *
 * @returns {string} Relative path.
 */
export function relativePath(filepath, cwd = process.cwd())
{
   return path.relative(cwd, filepath);
}
