import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { csp, cspHeader } from './csp.ts';

const cspMeta = (): Plugin => ({
  name: 'csp-meta',
  transformIndexHtml(html, ctx) {
    if (ctx.server) return html;
    return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
  },
  configurePreviewServer(server) {
    server.middlewares.use((_request, response, next) => {
      response.setHeader('Content-Security-Policy', cspHeader);
      next();
    });
  },
});

export default defineConfig({
  plugins: [
    react(),
    cspMeta(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Кубышка',
        short_name: 'Кубышка',
        description: 'Семейный бюджет',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        background_color: '#F2F2F7',
        theme_color: '#F2F2F7',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /integrity\.json$/],
        globIgnores: ['**/integrity.json'],
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3100', changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3100', changeOrigin: true },
    },
  },
});
