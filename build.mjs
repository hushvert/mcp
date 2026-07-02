// Build the runnable bundles. esbuild resolves the extensionless TypeScript
// imports (so the source stays vitest- and tsc(bundler)-friendly) and inlines
// our own modules into one file per entry, leaving node_modules external so
// `npx -y @hushvert/mcp` resolves the SDK + zod from the installed tree. The
// shebang banner makes dist/cli.js directly executable as the `bin`. tsc then
// emits the .d.ts separately (see package.json build script).
import { build } from 'esbuild'

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  packages: 'external',
  sourcemap: true,
}

await build({
  ...common,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  banner: { js: '#!/usr/bin/env node' },
})

await build({
  ...common,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
})

console.error('[build] wrote dist/cli.js and dist/index.js')
