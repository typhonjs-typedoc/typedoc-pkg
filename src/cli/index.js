#!/usr/bin/env node
import { getPackage }   from '@typhonjs-utils/package-json';
import sade             from 'sade';

import { generate }     from './functions.js';

// Retrieve the `typedoc-pkg` package.
const packageObj = getPackage({ filepath: import.meta.url });

const description = `Generate documentation with TypeDoc automatically from 'package.json' export conditions. By default, any local 'package.json' is analyzed for export conditions with 'types' defined. You may otherwise specify an export condition providing entry points for documentation generation. You may also specify a 'path' to an entry point or other 'package.json' to load.;`;
const program = sade('typedoc-pkg', true)
   .version(packageObj?.version)
   .describe(description)
   .option('-a, --api-link', `Enable API linking; provide a comma separated string including 'dom', 'esm', and / or 'worker'.`)
   .option('-c, --config', `Provide a path to custom config.`)
   .option('-d, --typedoc', `Provide a path to custom 'typedoc.json' to load.`)
   .option('-e, --export', `Provide a specific 'package.json' export condition to parse for entry points.`, 'types')
   .option('-l, --loglevel', `Specify logging level: 'all', 'verbose', 'info', 'warn', or 'error'`)
   .option('-n, --name', `Package name substitution; instead of 'name' attribute of 'package.json'.`)
   .option('-o, --output', `Provide a directory path for generated documentation.`, 'docs')
   .option('-p, --path', `Path to a file to use as a single entry point or specific 'package.json' to load.`)
   .option('-t, --tsconfig', `Provide a path to custom 'tsconfig.json' to load.`)
   .option('--dmt-nav-compact', `[Default Modern Theme] Package / module navigation singular paths are compacted.`)
   .option('--dmt-nav-flat', `[Default Modern Theme] Package / module navigation paths are flattened.`)
   .action(generate);

program.parse(process.argv);
