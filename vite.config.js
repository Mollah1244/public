import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Proxy for Circle App Kit SDK internal API calls (swap quotes, rates, execution)
      // SDK calls https://api.circle.com/v1/stablecoinKits/* which gets CORS-blocked in browser
      '/stablecoin-api': {
        target: 'https://api.circle.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/stablecoin-api/, ''),
        secure: true
      },
      '/circle-api': {
        target: 'https://api-sandbox.circle.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/circle-api/, '')
      },
      '/polymarket-api': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/polymarket-api/, '')
      }
    }
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: './index.html',
        docs: './docs.html'
      }
    }
  }
});
