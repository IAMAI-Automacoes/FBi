// Feedback da equipe: o pedido de feedback. Lógica em handler.ts; regras em
// _shared/equipe.ts; a uazapi em _shared/uazapi.ts.
//
// Quem chama: a página /equipe (login) e a rotina do banco de minuto em minuto
// (ação "tick", com x-cron-secret). O pedido sai pelo WhatsApp do próprio
// restaurante. As respostas da equipe entram pelo n8n ("Feedback
// Restaurante"), não por aqui.

import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { configUazapi, enviarTexto } from '../_shared/uazapi.ts'
import { tratarEquipe } from './handler.ts'

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

    db: {
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
