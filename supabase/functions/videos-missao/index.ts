// Missões de vídeo: o restaurante manda um vídeo falando do EasyFeed e o
// Gemini confere os requisitos da missão. Lógica em handler.ts; regras em
// _shared/videos-missao.ts; o Gemini em _shared/gemini.ts.
//
// O vídeo vai do Storage (bucket videos-clientes) para o Gemini em blocos, sem
// ficar inteiro na memória. A análise roda em segundo plano (a resposta sai em
// 202) e grava o veredito em video_envios; a página atualiza pelo Realtime.

import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { apagarDoGemini, configGemini, ErroGemini, esperarAtivo, perguntarSobreVideo, subirParaGemini } from '../_shared/gemini.ts'
import { lerRequisitos, montarPromptAnalise, SCHEMA_ANALISE } from '../_shared/videos-missao.ts'
import { tratarVideos, type EnvioCompleto } from './handler.ts'

const BUCKET = 'videos-clientes'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  // deno-lint-ignore no-explicit-any
  const db: any = clienteAdmin()
  const corpo = await req.json().catch(() => ({}))
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const r = await tratarVideos(corpo ?? {}, {
    quemPede: async () => {
      const { data } = await db.auth.getUser(jwt)
      const u = data?.user
      if (!u?.email) return null
      const [{ data: rest }, { data: admins }] = await Promise.all([
        db.from('restaurantes').select('id').eq('auth_user_id', u.id).maybeSingle(),
        db.from('platform_admins').select('email'),
      ])
      const email = u.email.toLowerCase()
      return {
        restauranteId: rest?.id ? Number(rest.id) : null,
        email,
        ehAdmin: (admins ?? []).some((a: { email: string }) => String(a.email).toLowerCase() === email),
      }
    },
    missao: async (id) => {
      const { data } = await db.from('video_missoes').select('id, titulo, descricao, requisitos, ativa').eq('id', id).maybeSingle()
      return data ? { ...data, id: Number(data.id), requisitos: lerRequisitos(data.requisitos) } : null
    },
    enviosDaMissao: async (restauranteId, missaoId) => {
      const { data, error } = await db.from('video_envios').select('id, status, criado_em, atualizado_em')
        .eq('restaurante_id', restauranteId).eq('missao_id', missaoId)
      if (error) throw error
      return data ?? []
    },
    descartarAbandonados: async (restauranteId, missaoId) => {
      const { data } = await db.from('video_envios').select('id, caminho')
        .eq('restaurante_id', restauranteId).eq('missao_id', missaoId).eq('status', 'enviando')
      const velhos = data ?? []
      if (!velhos.length) return
      await db.storage.from(BUCKET).remove(velhos.map((v: { caminho: string }) => v.caminho)).catch(() => undefined)
      await db.from('video_envios').delete().in('id', velhos.map((v: { id: string }) => v.id))
    },
    criarEnvio: async (linha) => {
      const { error } = await db.from('video_envios').insert(linha)
      if (error) throw error
    },
    envio: async (id) => {
      if (!UUID.test(id)) return null
      const { data } = await db.from('video_envios')
        .select('id, restaurante_id, missao_id, caminho, nome_arquivo, tamanho_bytes, mime, status, criado_em, atualizado_em')
        .eq('id', id).maybeSingle()
      return data ? { ...data, restaurante_id: Number(data.restaurante_id), missao_id: Number(data.missao_id), tamanho_bytes: Number(data.tamanho_bytes) } : null
    },
    arquivo: async (caminho) => {
      const i = caminho.lastIndexOf('/')
      const { data } = await db.storage.from(BUCKET).list(caminho.slice(0, i), { search: caminho.slice(i + 1), limit: 5 })
      const achado = (data ?? []).find((o: { name: string }) => o.name === caminho.slice(i + 1))
      if (!achado) return null
      return { tamanho: Number(achado.metadata?.size ?? 0) }
    },
    atualizarEnvio: async (id, campos) => {
      const { error } = await db.from('video_envios').update(campos).eq('id', id)
      if (error) throw error
    },
    assistir: async (envio: EnvioCompleto, missao) => {
      const cfg = configGemini()
      if (!cfg) throw new ErroGemini('sem_chave', 'GEMINI_API_KEY não configurada')
      const baixado = await fetch(`${url}/storage/v1/object/${BUCKET}/${envio.caminho}`, {
        headers: { Authorization: `Bearer ${servico}`, apikey: servico },
      })
      if (!baixado.ok || !baixado.body) throw new Error(`Storage: ${baixado.status}`)
      const tamanho = Number(baixado.headers.get('content-length')) || envio.tamanho_bytes
      const arquivo = await subirParaGemini(cfg, baixado.body, tamanho, envio.mime, envio.nome_arquivo || envio.caminho)
      try {
        const ativo = await esperarAtivo(cfg, arquivo)
        return await perguntarSobreVideo(cfg, ativo, montarPromptAnalise(missao), SCHEMA_ANALISE)
      } finally {
        await apagarDoGemini(cfg, arquivo)
      }
    },
    emSegundoPlano: (trabalho) => {
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(trabalho)
    },
    novoId: () => crypto.randomUUID(),
    agora: () => Date.now(),
  })
  return json(r.corpo, r.status)
})
