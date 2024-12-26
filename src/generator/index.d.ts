import * as typedoc from 'typedoc';
import * as _typhonjs_utils_logger_color from '@typhonjs-utils/logger-color';

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
   * Modify navigation module paths to be flat or compact
   * singular paths; default: 'full'.
   */
  dmtNavStyle?: 'compact' | 'flat' | 'full';
  /**
   * The export condition to query for `package.json` entry points.
   */
  exportCondition?: string;
  /**
   * Enable debug TypeDoc logging with a unknown symbol link checker.
   */
  linkChecker?: boolean;
  /**
   * All API link plugins to load.
   */
  linkPlugins?: Iterable<'dom' | 'es' | 'worker'>;
  /**
   * Defines the logging level; default:
   * 'info'.
   */
  logLevel?: _typhonjs_utils_logger_color.LogLevel;
  /**
   * Provide a directory path for generated documentation.
   */
  output?: string;
  /**
   * When true a single directory path must be specified that will be scanned for
   * all NPM packages.
   */
  monoRepo?: boolean;
  /**
   * Path to a source file, `package.json`, or directory with a
   * `package.json` to use as entry points; you may provide an iterable list of paths.
   */
  path?: string | Iterable<string>;
  /**
   * Path to custom `tsconfig.json` to load.
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
