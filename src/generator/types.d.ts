import type { TypeDocOptions }   from 'typedoc';
import type { CompilerOptions }  from 'typescript';

// Any types defined in `types.d.ts` file are not included in public package types.

/**
 * Defines the data for `package.json` export conditions.
 */
export type ExportMap = Map<string, { entryPath: string, exportPath: string, globEntryPath: string }>;

/**
 * Internal TypeDoc configuration.
 */
export type PkgTypeDocConfig = {
   /**
    * Typescript compiler options.
    */
   compilerOptions: CompilerOptions;

   /**
    * Current Working Directory.
    */
   cwd: string;

   /**
    * Modify navigation module paths to be flat or compact singular paths.
    */
   dmtNavStyle?: 'compact' | 'flat' | 'full';

   /**
    * Module name substitution.
    */
   dmtModuleNames: Record<string, string>;

   /**
    * Module name to associated `README.md` from package exports parsing.
    */
   dmtModuleReadme: Record<string, string>;

   /**
    * All entry point files to include in doc generation.
    */
   entryPoints: string[];

   /**
    * True if all entry points are Typescript declarations.
    */
   entryPointsDTS: boolean;

   /**
    * Indicates that the entry point files are from `package.json`.
    */
   isPackage: boolean;

   /**
    * When true indicates that custom compiler options were loaded from `tsconfig` option.
    */
   hasCompilerOptions: boolean;

   /**
    * Enables the link checker plugin.
    */
   linkChecker: boolean;

   /**
    * All API link plugins to load.
    */
   linkPlugins: Iterable<string>;

   /**
    * Documentation output directory.
    */
   output: string;

   /**
    * Options loaded from `typedocPath` option.
    */
   typedocJSON: Partial<TypeDocOptions>;

   /**
    * Direct TypeDoc options to set.
    */
   typedocOptions?: Partial<TypeDocOptions>;
};
