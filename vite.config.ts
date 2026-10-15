import { resolve } from 'path';
import fs from 'node:fs';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      include: ['src'],
      tsconfigPath: './tsconfig.json'
    }),
    {
      name: 'copy-wasm-after-build',
      closeBundle() {
        const srcFile = resolve(import.meta.dirname, './vendor/libktx/libktx.wasm');
        const destFile = resolve(import.meta.dirname, './dist/libktx.wasm');

        if (fs.existsSync(srcFile)) {
          fs.copyFileSync(srcFile, destFile);
          console.log('✓ Successfully copied libktx.wasm to dist/');
        }
      }
    }
  ],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        cli: resolve(import.meta.dirname, 'src/cli/bundler.ts')
      },
      name: 'CathlametBundler',
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`
    },
    rollupOptions: {
      external: [
        '@cathlamet/library',
        'three',
        'crypto', 'node:crypto',
        'child_process', 'node:child_process',
        'fs', 'node:fs',
        'opentype.js',
        'path', 'node:path',
        'node:util',
        'sharp',
        'zlib'
      ],
      output: {
        format: 'es'
      }
    },
    target: 'esnext',
    sourcemap: true,
    minify: false
  }
});