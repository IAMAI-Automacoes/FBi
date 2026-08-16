/* Service worker do Easy Feed (PWA).
   Responsabilidades:
   - Tornar o app instalável (junto do manifest).
   - Receber Web Push (notificação de mensagem de cliente) mesmo com o app fechado.
   - Abrir/focar o painel ao clicar na notificação.
   - Manter o badge do ícone do app (celular) com o total de não lidas.
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

// Qual conversa (usuario_id) cada janela aberta está mostrando agora, enquanto
// visível — avisado pelo React via `avisarConversaAtiva` (src/lib/notificacoes-app.ts)
// toda vez que o admin abre/troca/fecha uma conversa, ou a aba sai/volta de foco.
// Guardado por client.id porque pode haver mais de uma janela/aba aberta.
// Se o worker reiniciar (é normal — não fica sempre vivo), este mapa some e volta
// vazio: o pior caso é notificar de novo uma conversa que já estava aberta (chato,
// não perigoso) — nunca o contrário, que seria deixar de avisar algo importante.
const conversasAtivasPorCliente = new Map()

self.addEventListener('message', (event) => {
  const dados = event.data || {}
  if (dados.type !== 'CONVERSA_ATIVA') return
  const clientId = event.source && event.source.id
  if (!clientId) return
  if (dados.usuarioId) conversasAtivasPorCliente.set(clientId, dados.usuarioId)
  else conversasAtivasPorCliente.delete(clientId)
})

function atualizarBadge(total) {
  if (typeof total !== 'number') return
  // Badging API: existe em `navigator` tanto na janela quanto no worker.
  // Suporte real hoje é Chrome/Edge (Android e desktop instalado); em quem
  // não suporta (ex.: Safari/iOS) o `if` abaixo já sai sem fazer nada.
  if (!('setAppBadge' in self.navigator)) return
  if (total > 0) self.navigator.setAppBadge(total).catch(() => {})
  else if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge().catch(() => {})
}

// Web Push: o servidor manda { title, body, icon, tag, url, usuarioId, totalNaoLido }.
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
    data: { url: dados.url || '/admin', usuarioId: dados.usuarioId || null },
  }

  event.waitUntil(
    (async () => {
      // Badge do ícone: sempre atualiza, independente de mostrar a notificação
      // ou não (outras conversas podem seguir não lidas mesmo que esta suma).
      atualizarBadge(dados.totalNaoLido)

      // Só suprime a notificação quando a conversa DESTA mensagem está aberta
      // e visível em alguma janela — qualquer outra conversa aberta, ou o app
      // minimizado/fechado, ainda notifica (diferente do comportamento antigo,
      // que suprimia sempre que o app estivesse visível, mesmo noutra conversa).
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const conversaAlvo = dados.usuarioId || null
      let suprimir
      if (conversaAlvo) {
        suprimir = janelas.some(
          (j) => j.visibilityState === 'visible' && conversasAtivasPorCliente.get(j.id) === conversaAlvo,
        )
      } else {
        // Não sabemos de qual conversa é (payload antigo/incompleto): mantém o
        // comportamento conservador anterior — qualquer janela visível suprime.
        suprimir = janelas.some((j) => j.visibilityState === 'visible')
      }
      if (suprimir) return

      await self.registration.showNotification(titulo, opcoes)
    })(),
  )
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
