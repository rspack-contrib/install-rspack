#!/usr/bin/env node
import { $ } from 'execa'

// as we rely on some CJS dependencies, we need to use `createRequire` to provide a `require` function for them
const banner = `import { createRequire } from "module";\nconst require = createRequire(import.meta.url);\n`
// execa automatically escapes the strings, so we don't need extra escaping
await $`esbuild --bundle index.ts --format=esm --target=node18 --platform=node --banner:js=${banner} --outfile=outfile.mjs`
