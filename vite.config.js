import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Amolnama-v2/',
  
  build: {
    // Explicitly disable source maps to protect proprietary code
    sourcemap: false,
    
    // Optimize for modern browsers to reduce polyfill bloat
    target: 'esnext', 
    
    // Use esbuild for fast, aggressive minification
    minify: 'esbuild',
    
    // Rollup/Rolldown chunking strategy
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Isolate Firebase SDKs into a separate vendor chunk.
          if (id.includes('node_modules/firebase')) {
            return 'firebase-vendor';
          }
        }
      }
    }
  },
  
  esbuild: {
    // Automatically strip console.log and console.info in production
    // We leave console.error so critical crashes still report to the DevTools
    pure: ['console.log', 'console.info'],
    // Strip debuggers
    drop: ['debugger']
  }
});