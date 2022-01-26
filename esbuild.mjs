import { build } from 'esbuild';
import glob from 'fast-glob'

await build({
    entryPoints: await glob('spec/**/*.spec.ts'),
    outdir: 'spec',
    minify: true,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: [ 'esnext' ],
});

await build({
    entryPoints: [ 'src/index.ts' ],
    outdir: 'lib',
    outbase: 'src',
    bundle: true,
    sourcemap: true,
    minify: true,
    format: 'esm',
    platform: 'node',
    target: [ 'esnext' ],
});