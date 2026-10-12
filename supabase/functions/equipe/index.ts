// Feedback da equipe: o que o restaurante manda para a equipe (pedido de
// feedback, manual ou automático, e o aviso de ação concluída). Lógica em
// handler.ts; regras em _shared/equipe.ts; a uazapi em _shared/uazapi.ts.
//
// Quem chama: a página /equipe (login) e a rotina do banco de minuto em minuto
// (ação "tick", com x-cron-secret). O pedido sai pelo WhatsApp do próprio
// restaurante. As respostas da equipe entram pelo n8n ("Feedback
// Restaurante"), não por aqui.

import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { configUazapi, enviarTexto } from '../_shared/uazapi.ts'
import { chamarIA } from '../_shared/openrouter.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { PROMPT_AVISO, SCHEMA_AVISO } from '../_shared/equipe.ts'
import { tratarEquipe } from './handler.ts'

/** O agente que rascunha o aviso de ação concluída (Admin → Agentes). */
const AGENTE_AVISO = 'aviso_equipe'

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  // deno-lint-ignore no-explicit-any
  const db: any = clienteAdmin()
  const corpo = await req.json().catch(() => ({}))
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')

  // A instância de cada restaurante, lida uma vez por chamada.
  const instancias = new Map<number, Promise<{ base: string; token: string; conectado: boolean } | null>>()
  const instancia = (restauranteId: number) => {
    let p = instancias.get(restauranteId)
    if (!p) {
      p = (async () => {
        const { data } = await db.from('restaurantes')
          .select('whatsapp_token, whatsapp_base_url, whatsapp_conectado, excluida_em')
          .eq('id', restauranteId).maybeSingle()
        const token = String(data?.whatsapp_token ?? '').trim()
        if (!data || data.excluida_em || !token) return null
        // Instância antiga pode não ter o endereço gravado: vale o do servidor.
        const base = String(data.whatsapp_base_url ?? '').trim().replace(/\/+$/, '') || (await configUazapi(db))?.base || ''
        return base ? { base, token, conectado: data.whatsapp_conectado === true } : null
      })()
      instancias.set(restauranteId, p)
    }
    return p
  }

  const r = await tratarEquipe(corpo ?? {}, {
    quemPede: async () => {
      const { data } = await db.auth.getUser(jwt)
      const u = data?.user
      if (!u?.email) return null
      const [{ data: rest }, { data: admins }] = await Promise.all([
        db.from('restaurantes').select('id, nome_restaurante').eq('auth_user_id', u.id).maybeSingle(),
        db.from('platform_admins').select('email'),
      ])
      const email = u.email.toLowerCase()
      return {
        restauranteId: rest?.id ? Number(rest.id) : null,
        nomeRestaurante: String(rest?.nome_restaurante ?? '').trim(),
        email,
        ehAdmin: (admins ?? []).some((a: { email: string }) => String(a.email).toLowerCase() === email),
      }
    },
    ehCron: async () => {
      const recebido = req.headers.get('x-cron-secret')
      if (!recebido) return false
      const { data } = await db.from('integracao_config').select('valor').eq('chave', 'PUSH_TRIGGER_SECRET').maybeSingle()
      return Boolean(data?.valor) && recebido === data.valor
    },
    agora: () => Date.now(),
    sorteio: () => Math.random(),
    emSegundoPlano: (trabalho) => {
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(trabalho)
    },

    whatsapp: {
      conectado: async (restauranteId) => (await instancia(restauranteId))?.conectado === true,
      enviar: async (p) => {
        const c = await instancia(p.restauranteId)
        if (!c) return { ok: false, incerto: false, messageId: null, erro: 'O WhatsApp do restaurante não está conectado.' }
        return await enviarTexto(c.base, c.token, { numero: p.numero, texto: p.texto, digitandoMs: p.digitandoMs })
      },
    },

    ia: {
      // null em qualquer falha (agente desligado, sem crédito, IA fora do ar):
      // o handler usa o texto-modelo, e o dono revisa de qualquer jeito.
      rascunhoAviso: async (p) => {
        const params = await paramsDoAgente(db, AGENTE_AVISO, { max_tokens: 300, temperature: 0.4 })
        if (!params) return null
        const prompt = montarPrompt(await carregarPrompts(db), 'ef_equipe_aviso', PROMPT_AVISO, {
          restaurante: p.restaurante || 'o restaurante',
          categoria: p.categoria || 'Outros',
          titulo: p.titulo,
          plano: p.plano || '(sem plano escrito)',
        })
        const { result } = await chamarIA(db, {
          messages: [{ role: 'user', content: prompt }],
          params,
          origem: 'equipe-aviso',
          restauranteId: p.restauranteId,
          agenteId: AGENTE_AVISO,
          calculadora: false,
          saida: { nome: 'registrar_aviso', descricao: 'Registra o texto do aviso para a equipe.', schema: SCHEMA_AVISO },
        })
        return typeof result?.texto === 'string' ? result.texto : null
      },
    },

    db: {
      acaoDaEquipe: async (id) => {
        if (!Number.isInteger(id) || id <= 0) return null
        const { data: a } = await db.from('acoes_operacionais')
          .select('id, restaurante_id, titulo_acao, plano_detalhado, categoria, publico').eq('id', id).maybeSingle()
        if (!a || a.publico !== 'equipe') return null
        // Nasceu de relato grave? (os feedbacks ligados à ação e a autoria deles)
        const { data: ligados } = await db.from('feedback_acao')
          .select('feedback_original_id, feedbacks_restaurante(origem_id)').eq('acao_id', id)
        const origens = [...new Set((ligados ?? []).flatMap((l: { feedback_original_id: string | null; feedbacks_restaurante: { origem_id: string | null } | null }) =>
          [l.feedback_original_id, l.feedbacks_restaurante?.origem_id]).filter(Boolean))]
        let sensivel = false
        if (origens.length) {
          const { data: graves } = await db.from('equipe_autorias').select('id').in('feedback_original_id', origens).eq('sensivel', true).limit(1)
          sensivel = (graves ?? []).length > 0
        }
        return {
          id: Number(a.id), restaurante_id: Number(a.restaurante_id), titulo: String(a.titulo_acao ?? '').trim(),
          plano: String(a.plano_detalhado ?? '').trim().slice(0, 2500), categoria: String(a.categoria ?? ''), sensivel,
        }
      },
      avisoDaAcao: async (acaoId) => {
        const { data } = await db.from('equipe_envios').select('criado_em').eq('acao_id', acaoId).eq('tipo', 'aviso')
          .neq('status', 'cancelado').order('criado_em', { ascending: false }).limit(1)
        return data?.[0]?.criado_em ?? null
      },
      automatico: async (restauranteId) => {
        const { data } = await db.from('equipe_automatico')
          .select('restaurante_id, ativo, cada_dias, dia_do_mes, pergunta, proximo_em, ultimo_em, ultimo_erro').eq('restaurante_id', restauranteId).maybeSingle()
        return data ? { ...data, restaurante_id: Number(data.restaurante_id) } : null
      },
      salvarAutomatico: async (restauranteId, campos) => {
        const { data: existe } = await db.from('equipe_automatico').select('restaurante_id').eq('restaurante_id', restauranteId).maybeSingle()
        const linha = { ...campos, atualizado_em: new Date().toISOString() }
        const { error } = existe
          ? await db.from('equipe_automatico').update(linha).eq('restaurante_id', restauranteId)
          : await db.from('equipe_automatico').insert({ restaurante_id: restauranteId, ...linha })
        if (error) throw error
      },
      automaticosVencidos: async (ate) => {
        const { data, error } = await db.from('equipe_automatico')
          .select('restaurante_id, ativo, cada_dias, dia_do_mes, pergunta, proximo_em, ultimo_em, ultimo_erro')
          .eq('ativo', true).lte('proximo_em', ate).order('proximo_em').limit(5)
        if (error) throw error
        return (data ?? []).map((a: { restaurante_id: number }) => ({ ...a, restaurante_id: Number(a.restaurante_id) }))
      },
      ultimoPedidoEm: async (restauranteId) => {
        const { data } = await db.from('equipe_envios').select('criado_em').eq('restaurante_id', restauranteId).eq('tipo', 'pedido')
          .neq('status', 'cancelado').order('criado_em', { ascending: false }).limit(1)
        return data?.[0]?.criado_em ?? null
      },
      nomeDoRestaurante: async (restauranteId) => {
        const { data } = await db.from('restaurantes').select('nome_restaurante').eq('id', restauranteId).maybeSingle()
        return String(data?.nome_restaurante ?? '')
      },
      prazoIdentidade: async () => {
        const { data } = await db.from('integracao_config').select('valor').eq('chave', 'EQUIPE_PRAZO_IDENTIDADE_HORAS').maybeSingle()
        return data?.valor ?? null
      },
      funcionarios: async (restauranteId) => {
        const { data, error } = await db.from('equipe_funcionarios').select('id, restaurante_id, nome, telefone, ativo, opt_out_em')
          .eq('restaurante_id', restauranteId).order('id')
        if (error) throw error
        return data ?? []
      },
      funcionario: async (id) => {
        const { data } = await db.from('equipe_funcionarios').select('id, restaurante_id, nome, telefone, ativo, opt_out_em').eq('id', id).maybeSingle()
        return data ?? null
      },
      envioAberto: async (restauranteId) => {
        const { data, error } = await db.from('equipe_envios').select('id').eq('restaurante_id', restauranteId)
          .in('status', ['na_fila', 'enviando']).limit(1)
        if (error) throw error
        return (data ?? []).length > 0
      },
      criarEnvio: async (linha) => {
        const { data, error } = await db.from('equipe_envios').insert(linha).select('id').single()
        if (error) throw error
        return Number(data.id)
      },
      criarConvites: async (linhas) => {
        const { error } = await db.from('equipe_convites').insert(linhas)
        if (error) throw error
      },
      envio: async (id) => {
        if (!Number.isInteger(id) || id <= 0) return null
        const { data } = await db.from('equipe_envios').select('id, restaurante_id, pergunta, status').eq('id', id).maybeSingle()
        return data ? { ...data, id: Number(data.id), restaurante_id: Number(data.restaurante_id) } : null
      },
      atualizarEnvio: async (id, campos) => {
        const { error } = await db.from('equipe_envios').update(campos).eq('id', id)
        if (error) throw error
      },
      cancelarConvitesNaFila: async (envioId) => {
        const { error } = await db.from('equipe_convites').update({ status: 'cancelado' }).eq('envio_id', envioId).eq('status', 'na_fila')
        if (error) throw error
      },
      contarConvites: async (envioId) => {
        const { data, error } = await db.from('equipe_convites').select('status').eq('envio_id', envioId)
        if (error) throw error
        const n: Record<string, number> = {}
        for (const c of data ?? []) n[c.status] = (n[c.status] ?? 0) + 1
        return n
      },
      destravar: async (antes) => {
        const { data } = await db.from('equipe_convites')
          .update({ status: 'falhou', erro: 'Não deu para confirmar se a mensagem saiu (o envio não terminou).' })
          .eq('status', 'enviando').lt('tentou_em', antes).select('envio_id')
        return [...new Set((data ?? []).map((c: { envio_id: number }) => Number(c.envio_id)))] as number[]
      },
      ultimoConviteEm: async () => {
        const { data } = await db.from('equipe_convites').select('tentou_em').not('tentou_em', 'is', null)
          .order('tentou_em', { ascending: false }).limit(1)
        return data?.[0]?.tentou_em ?? null
      },
      pegarConvite: async () => {
        const { data, error } = await db.rpc('equipe_pegar_convite')
        if (error) throw error
        const c = data?.[0]
        return c ? { ...c, id: Number(c.id), envio_id: Number(c.envio_id), restaurante_id: Number(c.restaurante_id) } : null
      },
      atualizarConvite: async (id, campos) => {
        const { error } = await db.from('equipe_convites').update(campos).eq('id', id)
        if (error) throw error
      },
    },
  })
  return json(r.corpo, r.status)
})
