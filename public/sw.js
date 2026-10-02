/* Service worker do Easy Feed (PWA).
   Responsabilidades:
   - Tornar o app instalável (junto do manifest).
   - Receber Web Push (WhatsApp, suporte do dono e suporte do admin) mesmo com o app fechado.
   - Abrir/focar o painel ao clicar na notificação.
   - Manter o badge do ícone do app (celular) com o total de não lidas.
   Não faz cache de assets de propósito: o app é online-first (Supabase), e cache
   de bundle costuma servir versão velha. Mantemos simples e sem surpresa. O
   único cache é o das logos já quadradas das notificações (easyfeed-icones-v1). */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Listener de fetch vazio: alguns navegadores exigem um handler de fetch pra
// considerar o app instalável. Não chamamos respondWith → a rede segue normal.
self.addEventListener('fetch', () => {})

// Qual conversa cada janela aberta está mostrando agora, enquanto visível
// ('wa:<chat>', 'suporte' ou o usuario_id no admin) — avisado pelo React via
// `avisarConversaAtiva` (src/lib/notificacoes-app.ts) toda vez que abre/troca/
// fecha uma conversa, ou a aba sai/volta de foco. Guardado por client.id
// (pode haver mais de uma janela/aba); null = a janela não está em conversa.
// O worker não fica sempre vivo: ao reiniciar, o mapa volta vazio, e antes de
// decidir um push ele pergunta às janelas visíveis (QUAL_CONVERSA).
const conversasAtivasPorCliente = new Map()
const esperandoResposta = new Map() // client.id → resolve da pergunta

self.addEventListener('message', (event) => {
  const dados = event.data || {}
  if (dados.type !== 'CONVERSA_ATIVA') return
  const clientId = event.source && event.source.id
  if (!clientId) return
  conversasAtivasPorCliente.set(clientId, dados.usuarioId || null)
  const responder = esperandoResposta.get(clientId)
  if (responder) {
    esperandoResposta.delete(clientId)
    responder()
  }
})

/** Pergunta a conversa às janelas visíveis que este worker (recém-iniciado) ainda não conhece. */
async function perguntarConversas(janelas) {
  const desconhecidas = janelas.filter((j) => j.visibilityState === 'visible' && !conversasAtivasPorCliente.has(j.id))
  await Promise.all(
    desconhecidas.map(
      (j) =>
        new Promise((resolver) => {
          esperandoResposta.set(j.id, resolver)
          j.postMessage({ type: 'QUAL_CONVERSA' })
          setTimeout(resolver, 500) // página antiga (sem resposta): não segura o aviso
        }),
    ),
  )
}

function atualizarBadge(total) {
  if (typeof total !== 'number') return
  // Badging API: existe em `navigator` tanto na janela quanto no worker.
  // Suporte real hoje é Chrome/Edge (Android e desktop instalado); em quem
  // não suporta (ex.: Safari/iOS) o `if` abaixo já sai sem fazer nada.
  if (!('setAppBadge' in self.navigator)) return
  if (total > 0) self.navigator.setAppBadge(total).catch(() => {})
  else if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge().catch(() => {})
}

// ── Web Push ───────────────────────────────────────────────────────────────
// O servidor (supabase/functions/enviar-push) manda, por mensagem:
//   { title, linha, icon?, logo?, url, tag, chaves[], timestamp, totalNaoLido? }
// (e `body`/`usuarioId`, o formato antigo, que este worker ainda entende).
//
// Regras:
//  - MOSTRA sempre, menos quando alguma janela visível está exatamente numa
//    das `chaves` (a conversa já está aberta na tela). Antes, qualquer aba em
//    foco calava tudo — e o suporte "não chegava" para quem testava no PC.
//  - Uma janela do site em foco: a notificação vai SEM som, porque quem toca é
//    a página (somCabeAEstaAba em src/lib/notificacoes-app.ts). Sem janela em
//    foco, vai com o som do sistema. Sempre um som só.
//  - AGRUPA por conversa (tag), como o WhatsApp: mensagem nova na mesma
//    conversa substitui a notificação, juntando as últimas linhas, e o título
//    ganha a contagem ("Raver (3 mensagens)"). Conversas diferentes ficam em
//    notificações separadas (o Android junta todas sob o app).
//  - Imagem (à direita no Android; à esquerda no PC): `icon` (foto do
//    contato/grupo, já quadrada) entra direto; `logo` é deixada QUADRADA aqui
//    (centralizada num quadrado branco) — o Android espreme imagem retangular;
//    sem as duas, ou se algo falhar, a logo do EasyFeed.
//  - `badge` (bolinha da esquerda e barra de status no Android): só aceita uma
//    cor, com fundo transparente — o símbolo do EasyFeed em branco.

const ICONE_EASYFEED = '/icons/icon-192.png'
const BADGE = '/icons/badge-96.png'
const MAX_LINHAS = 5
const CACHE_ICONES = 'easyfeed-icones-v1'

function paraBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// Logo no Storage público do Supabase: pede a versão pequena (192 px), bem
// mais leve que a original (a do Camelo tem 1600×1200).
function versaoPequena(url) {
  const marca = '/storage/v1/object/public/'
  const i = url.indexOf(marca)
  if (i < 0) return null
  const caminho = url.slice(i + marca.length).split('?')[0]
  return url.slice(0, i) + '/storage/v1/render/image/public/' + caminho + '?width=192&height=192&resize=contain'
}

async function baixarImagem(url) {
  const r = await fetch(url, { mode: 'cors', credentials: 'omit' })
  if (!r.ok) throw new Error('imagem ' + r.status)
  return createImageBitmap(await r.blob())
}

/** A logo centralizada num quadrado branco de 192 px, como data URL (guardada em cache por URL). */
async function logoQuadrada(url) {
  const cache = await caches.open(CACHE_ICONES)
  const chave = '/__icone-quadrado?u=' + encodeURIComponent(url)
  const salvo = await cache.match(chave)
  if (salvo) return salvo.text()

  const pequena = versaoPequena(url)
  let imagem
  try {
    imagem = await baixarImagem(pequena || url)
  } catch (e) {
    if (!pequena) throw e
    imagem = await baixarImagem(url)
  }
  const LADO = 192
  const MARGEM = 14
  const tela = new OffscreenCanvas(LADO, LADO)
  const g = tela.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, LADO, LADO)
  const escala = Math.min((LADO - 2 * MARGEM) / imagem.width, (LADO - 2 * MARGEM) / imagem.height)
  const w = Math.round(imagem.width * escala)
  const h = Math.round(imagem.height * escala)
  g.imageSmoothingQuality = 'high'
  g.drawImage(imagem, Math.round((LADO - w) / 2), Math.round((LADO - h) / 2), w, h)
  if (imagem.close) imagem.close()
  const png = await tela.convertToBlob({ type: 'image/png' })
  const dataUrl = 'data:image/png;base64,' + paraBase64(await png.arrayBuffer())
  await cache.put(chave, new Response(dataUrl, { headers: { 'content-type': 'text/plain' } }))
  return dataUrl
}

async function escolherIcone(dados) {
  if (dados.icon) return dados.icon
  if (dados.logo) {
    try {
      return await logoQuadrada(dados.logo)
    } catch (_e) {
      /* logo quebrada ou navegador sem OffscreenCanvas: a do EasyFeed, nunca espremida */
    }
  }
  return ICONE_EASYFEED
}

self.addEventListener('push', (event) => {
  let dados = {}
  try {
    dados = event.data ? event.data.json() : {}
  } catch (_e) {
    dados = { linha: event.data ? event.data.text() : '' }
  }

  event.waitUntil(
    (async () => {
      // Badge do ícone: sempre atualiza, independente de mostrar a notificação
      // ou não (outras conversas podem seguir não lidas mesmo que esta suma).
      atualizarBadge(dados.totalNaoLido)

      const chaves = Array.isArray(dados.chaves) ? dados.chaves : dados.usuarioId ? [dados.usuarioId] : []
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      await perguntarConversas(janelas)
      const olhandoAConversa = janelas.some(
        (j) => j.visibilityState === 'visible' && chaves.includes(conversasAtivasPorCliente.get(j.id)),
      )
      if (olhandoAConversa) return
      const paginaEmFoco = janelas.some((j) => j.visibilityState === 'visible' && j.focused)

      // Junta com a notificação que já está na tela para esta conversa.
      const tag = dados.tag || 'easyfeed-msg'
      const anterior = (await self.registration.getNotifications({ tag }))[0]
      const antes = anterior && anterior.data && Array.isArray(anterior.data.linhas) ? anterior.data : null
      const linha = String(dados.linha ?? dados.body ?? '').trim() || 'Nova mensagem'
      const linhas = (antes ? antes.linhas : []).concat(linha).slice(-MAX_LINHAS)
      const total = (antes ? antes.total || antes.linhas.length : 0) + 1
      const tituloBase = dados.title || 'EasyFeed'
      const titulo = total > 1 ? `${tituloBase} (${total} mensagens)` : tituloBase

      await self.registration.showNotification(titulo, {
        body: linhas.join('\n'),
        icon: await escolherIcone(dados),
        badge: BADGE,
        tag,
        renotify: true,
        silent: paginaEmFoco,
        timestamp: typeof dados.timestamp === 'number' ? dados.timestamp : Date.now(),
        data: { url: dados.url || '/', chaves, linhas, total },
      })
    })(),
  )
})

// Clique na notificação: foca uma aba do app já aberta (e navega) ou abre uma nova.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Prefere a janela que já está na mesma página (ex.: o app "Whatsapp
      // EasyFeed" instalado, para uma mensagem do WhatsApp).
      const caminho = new URL(url, self.location.origin).pathname
      const naPagina = (j) => Number(new URL(j.url).pathname === caminho)
      janelas.sort((a, b) => naPagina(b) - naPagina(a))
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
