import * as typescript from 'typescript';
import * as typedoc from 'typedoc';

/**
 * Generates docs from given configuration.
 *
 * @param {GenerateConfig | Iterable<GenerateConfig>} config - Generate config.
 *
 * @returns {Promise<void>}
 */
declare function generateDocs(config: GenerateConfig | Iterable<GenerateConfig>): Promise<void>;
type GenerateConfig = {
    /**
     * Modify navigation module paths to be flat or compact singular paths.
     */
    dmtNavStyle?: 'compact' | 'flat';
    /**
     * The export condition to query for `package.json` entry points.
     */
    exportCondition?: string;
    /**
     * All API link plugins to load.
     */
    linkPlugins?: Iterable<'dom' | 'esm' | 'worker'>;
    /**
     * Defines the logging level.
     */
    logLevel?: 'all' | 'verbose' | 'info' | 'warn' | 'error';
    /**
     * Provide a directory path for generated documentation.
     */
    output?: string;
    /**
     * Package name substitution; instead of `name` attribute of `package.json`.
     */
    packageName?: string;
    /**
     * Path to a file to use as a single entry point or specific 'package.json' to load.
     */
    path?: string;
    /**
     * Path to custom 'tsconfig.json' to load.
     */
    tsconfigPath?: string;
    /**
     * Direct TypeDoc options to set.
     */
    typedocOptions?: Partial<typedoc.TypeDocOptions>;
    /**
     * Path to custom `typedoc.json` to load.
     */
    typedocPath?: string;
};
/**
 * Internal TypeDoc configuration.
 */
type PkgTypeDocConfig = {
    /**
     * Typescript compiler options.
     */
    compilerOptions: typescript.CompilerOptions;
    /**
     * Current Working Directory.
     */
    cwd: string;
    /**
     * Modify navigation module paths to be flat or compact singular paths.
     */
    dmtNavStyle?: 'compact' | 'flat';
    /**
     * Module name substitution.
     */
    dmtModuleNames: Record<string, string>;
    /**
     * All files to include in doc generation.
     */
    entryPoints: string[];
    /**
     * True if all entry points are Typescript declarations.
     */
    entryPointsDTS: boolean;
    /**
     * Indicates that the entry point files are from package exports.
     */
    fromPackage: boolean;
    /**
     * When true indicates that compiler options were loaded from CLI option.
     */
    hasCompilerOptions: boolean;
    /**
     * All API link plugins to load.
     */
    linkPlugins: Iterable<string>;
    /**
     * Documentation output directory.
     */
    output: string;
    /**
     * The name attribute from associated package.json or custom name from CLI option.
     */
    packageName: string;
    /**
     * Any found package.json object.
     */
    packageObj: object;
    /**
     * File path of found package.json.
     */
    packageFilepath: string;
    /**
     * Options loaded from `typedocPath` option.
     */
    typedocJSON: object;
    /**
     * Direct TypeDoc options to set.
     */
    typedocOptions?: Partial<typedoc.TypeDocOptions>;
};

export { type GenerateConfig, type PkgTypeDocConfig, generateDocs };
