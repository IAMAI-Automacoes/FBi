/*
 * Build SÓ da página pública `/f/:slug` — a que o cliente abre ao escanear.
 *
 * Existe separado do `vite.config.ts` por causa de uma linha: o alias que troca
 * o React pelo Preact. `resolve.alias` vale para o build inteiro, e o app não
 * pode ser tocado (são dezenas de bibliotecas contando com o React de verdade),
 * então a única forma de aplicar o alias a uma entrada só é compilá-la à parte.
 *
 * Por que trocar: medido em 4G com a CPU 4x mais lenta (um celular comum na
 * mesa do restaurante), a página levava 3,5 s até aparecer. O download do JS
 * respondia por 1,6 s — o resto, quase dois segundos, era o navegador
 * EXECUTANDO o react-dom. Ele tem 178 kB; o Preact faz o mesmo trabalho, para
 * esta página, em cerca de 11 kB.
 *
 * A página é uma tela só, sem rotas, sem contexto, sem bibliotecas de
 * componentes: usa `useState`, `useEffect`, `useMemo` e JSX. É exatamente o
 * que `preact/compat` cobre. Os dois builds compartilham o MESMO LandingView,
 * então o que o dono vê na prévia continua sendo o que o cliente recebe — é
 * o mesmo componente, compilado duas vezes.
 *
 * Roda depois do build do app e escreve no mesmo `dist`, sem limpá-lo.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  build: {
    outDir: 'dist',
    // O build do app roda antes e já encheu o dist; apagar aqui levaria junto
    // o index.html e todos os assets dele.
    emptyOutDir: false,
    minify: true,
    rolldownOptions: {
      input: { landing: path.resolve(__dirname, 'f.html') },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        warn(warning)
      },
    },
  },
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: [
      // A troca. `preact/compat` expõe a API do React (hooks, forwardRef,
      // createRoot) sobre o núcleo do Preact.
      { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
      { find: /^react-dom$/, replacement: 'preact/compat' },
      { find: /^react\/jsx-runtime$/, replacement: 'preact/jsx-runtime' },
      { find: /^react$/, replacement: 'preact/compat' },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
})
