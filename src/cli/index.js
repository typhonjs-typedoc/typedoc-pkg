#!/usr/bin/env node
import { getPackage }   from '@typhonjs-utils/package-json';
import sade             from 'sade';

import { generate }     from './functions.js';

// Retrieve the `typedoc-pkg` package.
const packageObj = getPackage({ filepath: import.meta.url });

const description = `Generate documentation with TypeDoc automatically from 'package.json' export conditions. By default, 'package.json' is analyzed for export conditions with 'types' defined. You may otherwise specify an export condition providing entry points for documentation generation.`;

const program = sade('typedoc-pkg', true)
   .version(packageObj?.version)
   .describe(description)
   .option('-d, --typedoc', `Provide a path to custom 'typedoc.json' file.`)
   .option('-e, --export', `Provide a specific 'package.json' export condition to parse for entry points.`, 'types')
   .option('-l, --link', `Enable API linking; provide a comma separated string including 'dom', 'esm', and 'worker'.`)
   .option('-n, --name', `Package name substitution; instead of 'name' attribute of 'package.json'.`)
   .option('-o, --output', `Provide a directory path for generated documentation.`, 'docs')
   .option('-p, --path', `Provide a file or directory path to configure as entry points for documentation generation.`)
   .option('-t, --tsconfig', `Provide a path to custom 'tsconfig.json' file.`)
   .option('--dmt-nav-compact', `[Default Modern Theme] Package / module navigation singular paths are compacted.`)
   .option('--dmt-nav-flat', `[Default Modern Theme] Package / module navigation paths are flattened.`)
   .option('--verbose', `Verbosely log configuration setup.`)
   .action(generate);

program.parse(process.argv);
