/**
 * @returns {Promise<void>}
 */
export async function generateDocs()
{

}

/**
 * @typedef {object} PkgTypeDocConfig Internal configuration data.
 *
 * @property {import('typescript').CompilerOptions} compilerOptions Typescript compiler options.
 *
 * @property {string} cwd Current Working Directory.
 *
 * @property {boolean} dmtNavCompact Module paths should compact singular paths in navigation.
 *
 * @property {boolean} dmtNavFlat Module paths should be flattened in navigation.
 *
 * @property {Record<string, string>} dmtModuleNames Module name substitution.
 *
 * @property {string[]} entryPoints All files to include in doc generation.
 *
 * @property {boolean} entryPointsDTS True if all entry points are Typescript declarations.
 *
 * @property {boolean} fromPackage Indicates that the entry point files are from package exports.
 *
 * @property {boolean} hasCompilerOptions When true indicates that compiler options were loaded from CLI option.
 *
 * @property {string[]} linkPlugins All API link plugins to load.
 *
 * @property {string} out Documentation output directory.
 *
 * @property {string} packageName The name attribute from associated package.json or custom name from CLI option.
 *
 * @property {object} packageObj Any found package.json object.
 *
 * @property {string} packageFilepath File path of found package.json.
 *
 * @property {object} typedocJSON Options loaded from --typedoc CLI option.
 */
