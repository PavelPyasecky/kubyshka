import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
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
        navigateFallbackDenylist: [/^\/api\//],
        clientsClaim: true,
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
