import { defineConfig } from 'vite';

// Hard constraint: the built output must make zero outbound network requests and
// must survive being double-clicked from a file:// path. That drives every choice
// here - relative base, no code splitting, no separate asset files.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    // Inline every asset regardless of size so nothing is ever fetched at runtime.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
      },
    },
  },
});
