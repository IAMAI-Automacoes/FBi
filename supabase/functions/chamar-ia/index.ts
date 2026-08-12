import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { json, preflight } from '../_shared/cors.ts'
import { autenticarRestaurante, clienteAdmin } from '../_shared/auth.ts'
import { paramsDoAgente, type ParamsAgente } from '../_shared/params.ts'
import { chamarIA, ErroCota, ErroIA } from '../_shared/openrouter.ts'
import { avaliarEscopo, ultimaMensagemDoUsuario } from '../_shared/escopo.ts'

/**
 * Proxy de IA do chat.
 *
 * Antes esta função aceitava qualquer requisição sem autenticação e repassava
 * ao OpenRouter o modelo e os limites que o cliente pedisse — ou seja, qualquer
 * pessoa com a URL podia gastar a chave da plataforma. Agora ela exige sessão,
 * resolve o restaurante, aplica a cota mensal e decide os parâmetros no
 * servidor a partir de `agentes_ia`.
 */

/** Teto de segurança: nem o admin consegue configurar um agente acima disto. */
const MAX_TOKENS_TETO = 4000

serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const { messages, options = {}, agente_id: agenteId = 'assistente' } = await req.json()

    if (!Array.isArray(messages) || !messages.length) {
      return json({ error: 'Nenhuma mensagem enviada' }, 400)
    }

    const admin = clienteAdmin()

    // ── Quem está pedindo ──
    const auth = await autenticarRestaurante(
      req,
      admin,
      'id, auth_user_id, assinatura_status, excluida_em',
    )
    if (!auth.ok) return json({ error: auth.erro }, auth.status)
    const { restaurante } = auth

    if (restaurante.linha.excluida_em) {
      return json({ error: 'Conta encerrada' }, 403)
    }

    // O paywall existia apenas como redirect no React, o que não impedia
    // chamadas diretas à função.
    if (restaurante.assinatura_status !== 'ativa') {
      return json({ error: 'Assinatura inativa', codigo: 'sem_assinatura' }, 403)
    }

    // ── Escopo: barra o off-topic antes de gastar token ──
    const veredicto = avaliarEscopo(ultimaMensagemDoUsuario(messages))
    if (!veredicto.permitido) {
      return json({ result: veredicto.motivo, fontes: [], fora_de_escopo: true }, 200)
    }

    // ── Parâmetros: decididos aqui, não pelo cliente ──
    const padrao: ParamsAgente = {}
    if (options.response_format?.type === 'json_object') {
      padrao.response_format = { type: 'json_object' }
    }
    if (typeof options.temperature === 'number') padrao.temperature = options.temperature
    if (typeof options.max_tokens === 'number') padrao.max_tokens = options.max_tokens
    if (options.web === true) {
      padrao.web = true
      padrao.web_max_results = Number(options.web_max_results) || 4
    }

    const params = await paramsDoAgente(admin, String(agenteId), padrao)
    if (!params) {
      return json({ error: 'Este agente está desativado pelo administrador' }, 503)
    }

    // `options.model` do cliente é ignorado de propósito: era o caminho para
    // escolher um modelo caro por fora do painel.
    params.max_tokens = Math.min(params.max_tokens ?? 1000, MAX_TOKENS_TETO)

    const { result, fontes } = await chamarIA(admin, {
      messages,
      params,
      origem: 'chat',
      restauranteId: restaurante.id,
      agenteId: String(agenteId),
    })

    return json({ result, fontes })
  } catch (err) {
    if (err instanceof ErroCota) {
      return json(
        {
          error: 'Crédito de IA esgotado neste ciclo',
          codigo: 'sem_credito',
          gasto: err.gasto,
          limite: err.limite,
        },
        402,
      )
    }
    if (err instanceof ErroIA) {
      return json({ error: err.message, detail: err.detalhe }, err.status)
    }
    return json({ error: String(err) }, 500)
  }
})
