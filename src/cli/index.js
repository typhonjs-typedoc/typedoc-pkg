#!/usr/bin/env node
import { getPackage }   from '@typhonjs-utils/package-json';
import sade             from 'sade';

import { generate }     from './functions.js';

// Retrieve the `esm-d-ts` package.
const packageObj = getPackage({ filepath: import.meta.url });

const description = `Generate documentation automatically from Typescript declarations defined in 'package.json'. By default, 'package.json' is analyzed for export conditions with 'types' defined. You may otherwise specify a path where all Typescript declarations within will be used for generation.`;

const program = sade('typedoc-d-ts', true)
   .version(packageObj?.version)
   .describe(description)
   .option('-o, --output', `Provide a directory path for generated documentation; default is 'docs'.`)
   .option('-p, --path', `Provide a directory path to include all Typescript declarations for documentation generation.`)
   .option('--verbose', `Verbosely log configuration setup.`)
   .option('-l, --link', `Enable API linking; provide a comma separated string including 'dom', 'esm', and 'worker'.`)
   .action(generate);

program.parse(process.argv);
