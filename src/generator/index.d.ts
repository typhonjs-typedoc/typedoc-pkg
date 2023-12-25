import * as typedoc from 'typedoc';

/**
 * Generates docs from given configuration.
 *
 * @param {GenerateConfig | Iterable<GenerateConfig>} configs - Generate config(s).
 *
 * @returns {Promise<void>}
 */
declare function generateDocs(configs: GenerateConfig | Iterable<GenerateConfig>): Promise<void>;
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
     * Path to a source file, `package.json`, or directory with a
     * `package.json` to use as entry points; you may provide an iterable list of paths.
     */
    path?: string | Iterable<string>;
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

export { type GenerateConfig, generateDocs };
