/* Vite config for building the frontend react app: https://vite.dev/config/ */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
// @ts-expect-error - uidPlugin is a custom plugin
import uidPlugin from './vite-plugin-react-uid'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: '::',
    port: 8080,
  },
  build: {
    outDir: mode === 'development' ? 'dev-dist' : 'dist',
    minify: mode !== 'development',
    sourcemap: mode === 'development',
    rolldownOptions: {
      // Só o app. A landing pública (f.html), que o cliente abre ao escanear
      // o QR, é compilada à parte por `vite.landing.config.ts`: ela troca o
      // React pelo Preact, e `resolve.alias` vale para o build inteiro — não
      // dá pra aplicar a uma entrada só dentro do mesmo build. O `.htaccess`
      // reescreve /f/:slug → /f.html, que sai do outro build no mesmo dist.
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
          return
        }
        warn(warning)
      },
    },
  },
  plugins: [mode === 'development' ? uidPlugin() : undefined, react()].filter(Boolean),
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode ?? process.env.NODE_ENV ?? 'production'),
    // Marca quando este bundle foi gerado, para saber se o navegador está
    // rodando código atual ou um servidor de desenvolvimento antigo.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /zod\/v4\/core/,
        replacement: path.resolve(__dirname, 'node_modules', 'zod', 'v4', 'core'),
      }
    ],
  },
}))