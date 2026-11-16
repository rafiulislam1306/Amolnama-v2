import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',

  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },

  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  
  build: {
    // Explicitly disable source maps to protect proprietary code
    sourcemap: false,
    
    // Optimize for broad mobile browser compatibility
    target: 'es2020',
    chunkSizeWarningLimit: 750,
    
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