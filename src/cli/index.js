#!/usr/bin/env node
import { getPackage }   from '@typhonjs-utils/package-json';
import sade             from 'sade';

import { generate }     from './functions.js';

// Retrieve the `typedoc-pkg` package.
const packageObj = getPackage({ filepath: import.meta.url });

const description = `Generate documentation with TypeDoc automatically from 'package.json' export conditions. By default, any local 'package.json' is analyzed for export conditions with 'types' defined. You may otherwise specify an export condition providing entry points for documentation generation. You may also specify a 'path' to an entry point or other 'package.json' to load.`;
const program = sade('typedoc-pkg', true)
   .version(packageObj?.version)
   .describe(description)
   .option('-a, --api-link', `Enable API linking; provide a comma separated string including 'dom', 'es', 'worker'.`)
   .option('-c, --config', `Load default 'typedoc-pkg.config.js' or provide a path to custom config.`)
   .option('-d, --typedoc', `Provide a path to custom 'typedoc.json' to load.`)
   .option('-e, --export', `Provide a specific 'package.json' export condition to parse for entry points.`, 'types')
   .option('-l, --loglevel', `Specify logging level: 'verbose', 'info', 'warn', 'error', or 'off'.`, 'info')
   .option('-m, --mono-repo', `When set the path must be a directory that will be scanned for all children NPM packages.`)
   .option('-o, --output', `Provide a directory path for generated documentation.`, 'docs')
   .option('-p, --path', `Path to a file to use as a single entry point or specific 'package.json' to load.`)
   .option('-t, --tsconfig', `Provide a path to custom 'tsconfig.json' to load.`)
   .option('--dmt-nav-style', `[Default Modern Theme] Modify package / module navigation paths to be 'compact', 'flat', or 'full'.`, 'full')
   .option('--link-checker', `Outputs warnings about unlinked documentation reflections / types during generation.`)
   .action(generate);

program.parse(process.argv);
