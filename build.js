import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/content.ts'],
  bundle: true,
  outfile: 'dist/content.js',
  format: 'iife',
  platform: 'browser',
  minify: false,
  sourcemap: false,
})

console.log('Build OK → dist/content.js')
