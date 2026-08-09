/* Service worker do Easy Feed (PWA).
   Responsabilidades:
   - Tornar o app instalável (junto do manifest).
   - Receber Web Push (notificação de mensagem de cliente) mesmo com o app fechado.
   - Abrir/focar o painel ao clicar na notificação.
   Não faz cache de assets de propósito: o app é online-first (Supabase), e cache
   de bundle costuma servir versão velha. Mantemos simples e sem surpresa. */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Listener de fetch vazio: alguns navegadores exigem um handler de fetch pra
// considerar o app instalável. Não chamamos respondWith → a rede segue normal.
self.addEventListener('fetch', () => {})

// Web Push: o servidor manda { title, body, icon, tag, url }.
self.addEventListener('push', (event) => {
  let dados = {}
  try {
    dados = event.data ? event.data.json() : {}
  } catch (_e) {
    dados = { body: event.data ? event.data.text() : '' }
  }

  const titulo = dados.title || 'Nova mensagem de cliente'
  const opcoes = {
    body: dados.body || '',
    icon: dados.icon || '/icons/icon-192.png', // foto do restaurante (ou ícone do app)
    badge: '/icons/icon-192.png',
    tag: dados.tag || 'easyfeed-msg', // uma por cliente; nova mensagem atualiza a mesma
    renotify: true,
    data: { url: dados.url || '/admin' },
  }

  event.waitUntil(self.registration.showNotification(titulo, opcoes))
})

// Clique na notificação: foca uma aba do app já aberta (e navega) ou abre uma nova.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/admin'

  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const janela of janelas) {
        if ('focus' in janela) {
          try {
            await janela.navigate(url)
          } catch (_e) {
            /* navigate pode falhar em cross-origin; só foca */
          }
          return janela.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })(),
  )
})
