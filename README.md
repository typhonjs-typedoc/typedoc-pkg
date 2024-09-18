![@typhonjs-typedoc/typedoc-pkg](https://i.imgur.com/QFyfaxg.jpg)

[![NPM](https://img.shields.io/npm/v/@typhonjs-typedoc/typedoc-pkg.svg?label=npm)](https://www.npmjs.com/package/@typhonjs-typedoc/typedoc-pkg)
[![Code Style](https://img.shields.io/badge/code%20style-allman-yellowgreen.svg?style=flat)](https://en.wikipedia.org/wiki/Indent_style#Allman_style)
[![License](https://img.shields.io/badge/license-MPLv2-yellowgreen.svg?style=flat)](https://github.com/typhonjs-typedoc/typedoc-pkg/blob/main/LICENSE)
[![API Docs](https://img.shields.io/badge/API%20Documentation-476ff0)](https://typhonjs-typedoc.github.io/typedoc-pkg/)
[![Discord](https://img.shields.io/discord/737953117999726592?label=Discord%20-%20TyphonJS&style=plastic)](https://typhonjs.io/discord/)
[![Twitch](https://img.shields.io/twitch/status/typhonrt?style=social)](https://www.twitch.tv/typhonrt)



Provides a zero configuration and self-contained CLI to generate API documentation for Javascript / Typescript projects
with [TypeDoc](https://typedoc.org/) from a well configured `package.json` containing Typescript [type declarations](https://www.typescriptlang.org/docs/handbook/2/type-declarations.html). By default,
`typedoc-pkg` will use the `types` export condition and fallback to `types` / `typings` properties in `package.json`.
Alternatively, a specific export condition can be targeted for documentation generation from specific source files.

## Installation:

It is recommended to install `typedoc-pkg` as a developer dependency in `package.json` as follows:
```json
{
  "devDependencies": {
    "@typhonjs-typedoc/typedoc-pkg": "^0.1.0"
  }
}
```
Presently the CLI and `typedoc-pkg` can not be installed or used globally; this will be addressed in a future update.

`typedoc-pkg` has peer dependencies for Typescript `5.1+` and TypeDoc `0.25.x`. It is not necessary to explicitly
install either supporting package or provide `tsconfig.json` / `typedoc.json` configuration files.

## Overview:

`typedoc-pkg` analyzes a projects `package.json` automatically configuring documentation generation with TypeDoc. This
includes translating the entry point source files used to the actual corresponding package export names in the generated
documentation. No explicit configuration of TypeDoc or Typescript is required. There is full support for sub-path
exports / sub-path patterns in `package.json`. Additionally, `typedoc-pkg` can be configured to generate documentation
for an entire mono-repo and all packages within.

There is a lot to unpack regarding how to set up a modern Node package for efficient distribution that includes
TS declarations. At this time I'll point to the Typescript [handbook description](https://www.typescriptlang.org/docs/handbook/esm-node.html#packagejson-exports-imports-and-self-referencing)
on how to set up `package.json` `exports` with the `types` condition. In time, I will expand the documentation and
resources available about `typedoc-pkg` covering new patterns unlocked from modern use cases. If you have questions
please open a discussion in the [issue tracker](https://github.com/typhonjs-typedoc/typedoc-pkg/issues).
You may also stop by the [TyphonJS Discord server](https://typhonjs.io/discord/) for discussion & support.

A design goal behind `typedoc-pkg` is to provide flexibility and near-zero configuration, so that you may adapt and use
`typedoc-pkg` for a variety of build and usage scenarios. There are three main ways to configure `typedoc-pkg`:
- CLI immediate mode.
- CLI w/ configuration file.
- Programmatically.

## Example use cases:

The following examples demonstrate essential usage patterns. Each example will take into consideration a hypothetical
package that has a primary export and one sub-path export. The resulting `package.json` exports field looks like this:
```json
{
  "exports": {
    ".": {
      "types": "./src/main/index.d.ts",
      "import": "./src/main/index.js"
    },
    "./sub": {
      "types": "./src/sub/index.d.ts",
      "import": "./src/sub/index.js"
    }
  }
}
```

Note: Typescript requires the `types` condition to always be the first entry in a conditional block in `exports`.

### CLI

You may use the CLI via the command line or define a NPM script that invokes it.

To receive help about the CLI use `typedoc-pkg --help`. Please use it to learn about additional CLI options available.

```
Options
  -a, --api-link     Enable Typescript built-in library API linking; provide a colon separated string including 'es' and / or 'dom' / 'worker'.
  -c, --config       Load default 'typedoc-pkg.config.js' or provide a path to custom config.
  -d, --typedoc      Provide a path to custom 'typedoc.json' to load.
  -e, --export       Provide a specific 'package.json' export condition to parse for entry points.  (default types)
  -l, --loglevel     Specify logging level: 'verbose', 'info', 'warn', 'error', or 'off'.  (default info)
  -m, --mono-repo    When set the path must be a directory that will be scanned for all children NPM packages.
  -o, --output       Provide a directory path for generated documentation.  (default docs)
  -p, --path         Path to a file(s) to use as entry points or specific 'package.json' to load. Multiple paths may be separated by colons.
  -t, --tsconfig     Provide a path to custom 'tsconfig.json' to load.
  --dmt-nav-style    [Default Modern Theme] Modify package / module navigation paths to be 'compact', 'flat', or 'full'.  (default full)
  --link-checker     Outputs warnings about unlinked documentation reflections / types during generation.
```

All examples will demonstrate NPM script usage and uses JSON5 to provide additional comments.

There are two ways to use the CLI. The first is "immediate mode" where you directly supply an input / entry point.
It is recommended to use the CLI immediate mode for most standard use cases.

```json5
{
  "scripts": {
    // Bare-bones generation
    "docs": "typedoc-pkg",

    // Will link all symbols from ES2023 APIs.
    "docsWithLinks": "typedoc-pkg --api-link es",

    // Will link all symbols from ES2023 & DOM APIs.
    "docsWithLinks2": "typedoc-pkg --api-link dom:es",

    // Generate combined docs for a mono-repo with all packages under `./packages`.
    "docsMono": "typedoc-pkg --path packages --mono-repo --api-link es"
  }
}
```

------

An alternate way to configure `typedoc-pkg` is through defining a configuration file. You may specify the `--config` or
alias `-c` to load a default config defined as `./typedoc-pkg.config.js` or `./typedoc-pkg.config.mjs`. You may also
provide a specific file path to a config after the `--config` option.

```json
{
  "scripts": {
    "docs": "typedoc-pkg --config"
  }
}
```

The config file should be in ESM format and have a default export that provides one or a list of [GenerateConfig](https://typhonjs-typedoc.github.io/typedoc-pkg/types/GenerateConfig.html)
objects.

```js
/**
 * @type {import('@typhonjs-typedoc/typedoc-pkg').GenerateConfig[]}
 */
const config = [
   // Basic example of API linking configured automatically with the local `package.json`.
   { linkPlugins: ['es'],  },
];

export default config;
```

### Programmatic Usage

You may directly import `generateDocs` which is an asynchronous function that can be invoked with top
level await.

```js
import { generateDocs } from '@typhonjs-typedoc/typedoc-pkg';

// Generates documentation.
await generateDocs([
  // Basic example of API linking configured automatically with the local `package.json`.
  { linkPlugins: ['es'] },
]);
```

[API documentation](https://typhonjs-typedoc.github.io/typedoc-pkg/)

## Automatic Assets

`typedoc-pkg` automatically searches for assets to add to the generated documentation. Presently, there is support for
linking `favicon.ico` from `./favicon.ico` or `./assets/docs/favicon.ico`. In the future linking standard markdown files
like `CHANGELOG.md` may be enabled.

## Synergies

- `typedoc-pkg` utilizes the [Default Modern Theme](https://github.com/typhonjs-typedoc/typedoc-theme-dmt) for TypeDoc.
The DMT provides the additional features for `typedoc-pkg` to map `package.json` exports / sub-paths to documentation
output, but also brings fit and finish to the default TypeDoc theme. There are additional configuration options for the
DMT useful for package documentation. One such is `dmtLinksService` which makes it easy to link common services to the
documentation header. It is easiest to configure that via `typedocOptions` in `package.json`. You can view this
configuration as it used in `typedoc-pkg` itself [here](https://github.com/typhonjs-typedoc/typedoc-pkg/blob/main/package.json#L66-L70).

  ![DMT Service Links](https://i.imgur.com/xC4oa0C.jpg)


- `typedoc-pkg` leverages API linking for all Typescript built-in library declarations covering the entire modern web
including ES2023 / JS, DOM, and Web Worker APIs. This is accomplished through [@typhonjs-typedoc/ts-lib-docs](https://www.npmjs.com/package/@typhonjs-typedoc/ts-lib-docs)
and enabled when the `--api-link` CLI option is used.


- `typedoc-pkg` supports documentation for a variety of Javascript / Typescript projects. For ES Module / JS developers
a related CLI package to easily generate Typescript declarations from ES Module source code is available via
[@typhonjs-build-test/esm-d-ts](https://www.npmjs.com/package/@typhonjs-build-test/esm-d-ts).

## Roadmap
- Elicit feedback from the larger developer community and improve documentation and ease of use as applicable. Please
file an issue or get in touch if `typedoc-pkg` is not working for your project.
