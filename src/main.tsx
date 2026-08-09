/* Main entry point for the application - renders the root React component */
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './main.css'

// Mostra no console quando este código foi gerado. Se a data estiver velha,
// o navegador está com bundle antigo (servidor de dev parado no tempo/cache).
// O typeof é obrigatório: quando o define do Vite não é aplicado, ler a
// constante direto lança ReferenceError e derruba o app inteiro (tela branca).
declare const __BUILD_TIME__: string | undefined
const geradoEm = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null
console.info(
  `%c Easy Feed %c ${geradoEm ? `build de ${new Date(geradoEm).toLocaleString('pt-BR')}` : 'desenvolvimento'} `,
  'background:#1D4ED8;color:#fff;border-radius:3px 0 0 3px;padding:2px 4px',
  'background:#e2e8f0;color:#0f172a;border-radius:0 3px 3px 0;padding:2px 4px',
)

createRoot(document.getElementById('root')!).render(<App />)

// Registra o service worker do PWA (instalável + Web Push). Depois do load pra
// não competir com o primeiro render.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('Falha ao registrar o service worker:', err))
  })
}
