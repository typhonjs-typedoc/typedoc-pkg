#!/usr/bin/env node
import { getPackage }   from '@typhonjs-utils/package-json';
import sade             from 'sade';

import { generate }     from './functions.js';

// Retrieve the `typedoc-pkg` package.
const packageObj = getPackage({ filepath: import.meta.url });

const description = `Generate documentation with TypeDoc automatically from 'package.json' export conditions. By default, 'package.json' is analyzed for export conditions with 'types' defined. You may otherwise specify a path where all Typescript declarations within will be used for generation.`;

const program = sade('typedoc-pkg', true)
   .version(packageObj?.version)
   .describe(description)
   .option('-d, --typedoc', `Provide a path to custom 'typedoc.json' file.`)
   .option('-f, --file', `Provide a file path to include a Typescript declaration for documentation generation.`)
   .option('-l, --link', `Enable API linking; provide a comma separated string including 'dom', 'esm', and 'worker'.`)
   .option('-o, --output', `Provide a directory path for generated documentation; default is 'docs'.`)
   .option('-p, --path', `Provide a directory path to include all Typescript declarations for documentation generation.`)
   .option('-t, --tsconfig', `Provide a path to custom 'tsconfig.json' file.`)
   .option('--dmt-flat', `[Default Modern Theme] Package / module navigation paths are flattened.`)
   .option('--verbose', `Verbosely log configuration setup.`)
   .action(generate);

program.parse(process.argv);
