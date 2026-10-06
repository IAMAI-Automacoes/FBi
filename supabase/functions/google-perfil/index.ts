// Conexão do restaurante com o perfil da empresa no Google (avaliações).
//
// Ações (POST { acao }), com o login do dono:
//   conectar        → cria o `state` e devolve a URL da tela do Google
//   escolher_local  → { local }: liga o restaurante escolhido (quando o dono tem vários)
//   descobrir       → busca de novo os restaurantes da conta (depois que o Google libera a API)
//   sincronizar     → busca as avaliações agora (no máximo 1 vez por minuto)
//   desconectar     → revoga no Google e apaga token, avaliações e conexão
// Pelo cron, a cada 2 min (cabeçalho x-cron-secret = integracao_config.PUSH_TRIGGER_SECRET):
//   sincronizar_todos → todos os restaurantes conectados, em segundo plano: leitura
//                       rápida (só o novo) e, 1x por dia, a completa

import { json, preflight } from '../_shared/cors.ts'
import { autenticarRestaurante, clienteAdmin } from '../_shared/auth.ts'
import { ErroGoogle, locaisDeTodasAsContas, urlAutorizacao } from '../_shared/google-perfil.ts'
import {
  aplicarLocais, clienteGoogle, configGoogle, escolherLocal, lerToken, marcarAguardandoGoogle, sincronizarRestaurante,
} from '../_shared/google-operacoes.ts'

const INTERVALO_MINIMO_MS = 60_000
/** Leitura começada há menos que isto ainda pode estar rodando: o cron pula. */
const EM_ANDAMENTO_MS = 90_000
/** Quantos restaurantes o cron lê ao mesmo tempo. */
const EM_PARALELO = 5

function novoEstado(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  // deno-lint-ignore no-explicit-any
  const db: any = clienteAdmin()
  const corpo = await req.json().catch(() => ({}))
  const acao = String(corpo?.acao ?? '')
  const cfg = configGoogle()

  // ── Cron ──
  if (acao === 'sincronizar_todos') {
    const { data: segredo } = await db.from('integracao_config').select('valor').eq('chave', 'PUSH_TRIGGER_SECRET').maybeSingle()
    if (!segredo?.valor || req.headers.get('x-cron-secret') !== segredo.valor) return json({ error: 'unauthorized' }, 401)
    if (!cfg) return json({ ok: false, motivo: 'nao_configurado' })
    const google = clienteGoogle(cfg)
    const { data: conectadosTodos } = await db.from('google_conexoes').select('restaurante_id, ultima_tentativa').eq('status', 'conectado')
    // Pula quem ainda está sendo lido pela rodada anterior.
    const conectados = (conectadosTodos ?? []).filter((c: any) => !c.ultima_tentativa || Date.now() - new Date(c.ultima_tentativa).getTime() > EM_ANDAMENTO_MS)
    const trabalho = (async () => {
      const fila = conectados.map((c: any) => Number(c.restaurante_id))
      await Promise.all(Array.from({ length: Math.min(EM_PARALELO, fila.length) }, async () => {
        for (let id = fila.shift(); id !== undefined; id = fila.shift()) await sincronizarRestaurante(db, google, id)
      }))
    })()
    // Responde já e termina em segundo plano (o pg_net corta a conexão em segundos).
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(trabalho)
    else await trabalho
    return json({ ok: true, restaurantes: conectados.length }, 202)
  }

  // ── Dono do restaurante ──
  const auth = await autenticarRestaurante(req, db)
  if (auth.ok === false) return json({ error: auth.erro }, auth.status)
  const restauranteId = auth.restaurante.id
  if (!cfg) return json({ ok: false, motivo: 'nao_configurado' })
  const google = clienteGoogle(cfg)

  try {
    if (acao === 'conectar') {
      const state = novoEstado()
      // Limpa os states velhos deste restaurante (cliques repetidos).
      await db.from('google_oauth_estados').delete().eq('restaurante_id', restauranteId)
      const { error } = await db.from('google_oauth_estados').insert({ state, restaurante_id: restauranteId })
      if (error) throw error
      return json({ ok: true, url: urlAutorizacao({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state }) })
    }

    if (acao === 'escolher_local') {
      const ok = await escolherLocal(db, restauranteId, String(corpo?.local ?? ''))
      if (!ok) return json({ ok: false, motivo: 'local_invalido' }, 400)
      const r = await sincronizarRestaurante(db, google, restauranteId, { completa: true })
      return json({ ok: true, sincronizacao: r })
    }

    if (acao === 'descobrir') {
      const refresh = await lerToken(db, restauranteId)
      if (!refresh) return json({ ok: false, motivo: 'precisa_reconectar' })
      try {
        const access = await google.renovar(refresh)
        const status = await aplicarLocais(db, restauranteId, await locaisDeTodasAsContas(google, access))
        if (status === 'conectado') await sincronizarRestaurante(db, google, restauranteId, { completa: true })
        return json({ ok: true, status })
      } catch (e) {
        if (e instanceof ErroGoogle && e.motivo === 'acesso_nao_liberado') {
          await marcarAguardandoGoogle(db, restauranteId)
          return json({ ok: false, motivo: 'acesso_nao_liberado' })
        }
        throw e
      }
    }

    if (acao === 'sincronizar') {
      const { data: c } = await db.from('google_conexoes').select('ultima_tentativa').eq('restaurante_id', restauranteId).maybeSingle()
      const ultima = c?.ultima_tentativa ? new Date(c.ultima_tentativa).getTime() : 0
      if (Date.now() - ultima < INTERVALO_MINIMO_MS) return json({ ok: false, motivo: 'aguarde' })
      return json(await sincronizarRestaurante(db, google, restauranteId))
    }

    if (acao === 'desconectar') {
      const refresh = await lerToken(db, restauranteId).catch(() => null)
      if (refresh) await google.revogar(refresh)
      await db.rpc('google_apagar_token', { p_restaurante_id: restauranteId })
      await db.from('google_avaliacoes').delete().eq('restaurante_id', restauranteId)
      await db.from('google_conexoes').delete().eq('restaurante_id', restauranteId)
      return json({ ok: true })
    }

    return json({ ok: false, motivo: 'acao_desconhecida' }, 400)
  } catch (e) {
    if (e instanceof ErroGoogle) return json({ ok: false, motivo: e.motivo, mensagem: e.message })
    console.error('google-perfil:', acao, e)
    return json({ ok: false, motivo: 'erro', mensagem: e instanceof Error ? e.message : String(e) }, 500)
  }
})
