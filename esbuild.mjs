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
    entryPoints: await glob('src/**/*.ts'),
    outdir: 'lib',
    outbase: 'src',
    bundle: false, // protoc doesn't handle `bundle` well, so set to false
    sourcemap: true,
    minify: false, // protoc doesn't handle `minify` well, so set to false
    format: 'cjs',
    platform: 'node',
    target: [ 'esnext' ],
});