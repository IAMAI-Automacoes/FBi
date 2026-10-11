// Feedback da equipe: cadastro, envios e análise do que os funcionários
// respondem pelo número só do EasyFeed. Lógica em handler.ts; regras em
// _shared/equipe.ts; o número em _shared/equipe-numero.ts; a uazapi em
// _shared/uazapi.ts.
//
// Quem chama: a página /equipe e a aba Equipe do admin (login), e a rotina do
// banco de minuto em minuto (ação "tick", com x-cron-secret). As mensagens que
// chegam entram por outra função, a equipe-webhook.

import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, ErroCota } from '../_shared/openrouter.ts'
import { configGemini, transcreverAudio } from '../_shared/gemini.ts'
import {
  CATEGORIAS_EQUIPE, PROMPT_ANALISE, PROMPT_RESUMO, SCHEMA_ANALISE, SCHEMA_RESUMO, variantesDoNumero,
} from '../_shared/equipe.ts'
import { conectarNumero, desconectarNumero, ErroNumero, lerConfigNumero, statusDoNumero } from '../_shared/equipe-numero.ts'
import { baixarAudio, configUazapi, enviarTexto, marcarLidas } from '../_shared/uazapi.ts'
import { ErroEquipe, tratarEquipe } from './handler.ts'

const AGENTE_ANALISE = 'analisador_equipe'
const AGENTE_RESUMO = 'resumo_equipe'

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  // deno-lint-ignore no-explicit-any
  const db: any = clienteAdmin()
  const corpo = await req.json().catch(() => ({}))
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const urlDoWebhook = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/equipe-webhook`

  // A instância do número do EasyFeed, lida uma vez por chamada.
  let conexao: Promise<{ base: string; token: string } | null> | null = null
  const ligado = () => (conexao ??= (async () => {
    const [u, cfg] = await Promise.all([configUazapi(db), lerConfigNumero(db)])
    return u && cfg.token ? { base: u.base, token: cfg.token } : null
  })())

  // Erro do número (limite da uazapi, configuração) vira mensagem para a tela.
  const doNumero = async <T>(f: () => Promise<T>): Promise<T> => {
    try {
      return await f()
    } catch (e) {
      if (e instanceof ErroNumero) throw new ErroEquipe(e.motivo, e.message, e.motivo === 'limite' ? 429 : 500)
      throw e
    }
  }

  // Uma chamada à IA com a saída no formato do schema. null = agente desligado no painel.
  const perguntar = async (
    agente: string, chave: string, padrao: string, vars: Record<string, string>,
    saida: { nome: string; descricao: string; schema: Record<string, unknown> }, restauranteId: number, maxTokens: number,
  ): Promise<unknown> => {
    const params = await paramsDoAgente(db, agente, { temperature: 0, max_tokens: maxTokens })
    if (!params) return null
    const prompt = montarPrompt(await carregarPrompts(db), chave, padrao, vars)
    try {
      const { result } = await chamarIA(db, {
        messages: [{ role: 'user', content: prompt }], params, origem: 'equipe', restauranteId, agenteId: agente, calculadora: false, saida,
      })
      return result ?? {}
    } catch (e) {
      if (e instanceof ErroCota) throw new ErroEquipe('sem_credito', 'O crédito de IA deste restaurante acabou.', 402)
      throw e
    }
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
    novoId: () => crypto.randomUUID(),
    emSegundoPlano: (trabalho) => {
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(trabalho)
    },

    numero: {
      status: () => doNumero(() => statusDoNumero(db)),
      conectar: () => doNumero(() => conectarNumero(db, urlDoWebhook)),
      desconectar: () => doNumero(() => desconectarNumero(db)),
      enviar: async (p) => {
        const c = await ligado()
        if (!c) return { ok: false, incerto: false, messageId: null, erro: 'O número do EasyFeed não está conectado.' }
        return await enviarTexto(c.base, c.token, p)
      },
      marcarLidas: async (ids) => {
        const c = await ligado()
        if (c) await marcarLidas(c.base, c.token, ids)
      },
      baixarAudio: async (messageId) => {
        const c = await ligado()
        return c ? await baixarAudio(c.base, c.token, messageId) : null
      },
    },

    ia: {
      transcrever: async (base64, mime) => {
        const cfg = configGemini()
        if (!cfg) throw new Error('GEMINI_API_KEY não configurada')
        return await transcreverAudio(cfg, base64, mime)
      },
      analisar: (p) => perguntar(
        AGENTE_ANALISE, 'ef_equipe_analisar', PROMPT_ANALISE,
        { restaurante: p.restaurante || 'o restaurante', pergunta: p.pergunta, mensagens: p.mensagens, categorias: CATEGORIAS_EQUIPE.join(', ') },
        { nome: 'registrar_analise', descricao: 'Registra a análise do que o funcionário escreveu.', schema: SCHEMA_ANALISE },
        p.restauranteId, 1200,
      ),
      resumir: (p) => perguntar(
        AGENTE_RESUMO, 'ef_equipe_resumo', PROMPT_RESUMO,
        { restaurante: p.restaurante || 'o restaurante', pergunta: p.pergunta, total: String(p.total), pontos: p.pontos },
        { nome: 'registrar_resumo', descricao: 'Registra o resumo do que a equipe respondeu.', schema: SCHEMA_RESUMO },
        p.restauranteId, 1200,
      ),
    },

    db: {
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
      pontosDoEnvio: async (envioId) => {
        const { data: respostas, error } = await db.from('equipe_respostas').select('id').eq('envio_id', envioId)
        if (error) throw error
        const ids = (respostas ?? []).map((x: { id: string }) => x.id)
        if (!ids.length) return []
        const { data, error: e2 } = await db.from('equipe_pontos').select('categoria, sentimento, resumo, texto_original').in('resposta_id', ids)
        if (e2) throw e2
        return data ?? []
      },
      respostasDoEnvio: async (envioId) => {
        const { count, error } = await db.from('equipe_respostas').select('id', { count: 'exact', head: true }).eq('envio_id', envioId)
        if (error) throw error
        return count ?? 0
      },
      nomeDoRestaurante: async (id) => {
        const { data } = await db.from('restaurantes').select('nome_restaurante').eq('id', id).maybeSingle()
        return String(data?.nome_restaurante ?? '').trim()
      },

      destravar: async (antes) => {
        await db.from('equipe_mensagens').update({ status: 'pendente' }).eq('status', 'processando').lt('pegou_em', antes)
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
        return data?.[0] ?? null
      },
      atualizarConvite: async (id, campos) => {
        const { error } = await db.from('equipe_convites').update(campos).eq('id', id)
        if (error) throw error
      },
      registrarSaida: async (linha) => {
        const { error } = await db.from('equipe_mensagens').insert({
          ...linha, direcao: 'saida', tipo: 'texto', status: 'processada', processada_em: new Date().toISOString(),
        })
        if (error) throw error
      },

      pegarMensagens: async (esperaSegundos, telefones) => {
        const { data, error } = await db.rpc('equipe_pegar_mensagens_prontas', { p_espera_segundos: esperaSegundos, p_telefones: telefones })
        if (error) throw error
        return data ?? []
      },
      atualizarMensagens: async (ids, campos) => {
        if (!ids.length) return
        const { error } = await db.from('equipe_mensagens').update(campos).in('id', ids)
        if (error) throw error
      },
      funcionariosDoNumero: async (telefone) => {
        const { data, error } = await db.from('equipe_funcionarios').select('id, restaurante_id, ativo, criado_em').in('telefone', variantesDoNumero(telefone))
        if (error) throw error
        return data ?? []
      },
      convitesDoNumero: async (telefone) => {
        const { data, error } = await db.from('equipe_convites').select('id, envio_id, restaurante_id, funcionario_id, enviado_em')
          .eq('status', 'enviado').in('telefone', variantesDoNumero(telefone)).order('enviado_em', { ascending: false }).limit(5)
        if (error) throw error
        return data ?? []
      },
      saiuDesde: async (telefone, desde) => {
        const { data } = await db.from('equipe_mensagens').select('id').eq('direcao', 'saida')
          .in('telefone', variantesDoNumero(telefone)).gte('recebida_em', desde).limit(1)
        return (data ?? []).length > 0
      },
      criarResposta: async (linha) => {
        const { data, error } = await db.from('equipe_respostas').insert(linha).select('id').single()
        if (error) throw error
        return String(data.id)
      },
      criarPontos: async (linhas) => {
        const { error } = await db.from('equipe_pontos').insert(linhas)
        if (error) throw error
      },
      marcarRespondeu: async (conviteId, quando) => {
        await db.from('equipe_convites').update({ respondeu_em: quando }).eq('id', conviteId).is('respondeu_em', null)
      },
      pararNumero: async (telefone, motivo, quando) => {
        const { data, error } = await db.from('equipe_funcionarios')
          .update({ opt_out_em: quando, opt_out_motivo: motivo })
          .in('telefone', variantesDoNumero(telefone)).is('opt_out_em', null).select('id')
        if (error) throw error
        return (data ?? []).length > 0
      },
    },
  })
  return json(r.corpo, r.status)
})
