// Missões de vídeo (página /missoes e aba Vídeos do painel do admin). Sem Deno
// nem banco: o index.ts liga as dependências, e o teste roda isto com tudo de
// mentira.
//
// Ações (POST { acao }), com o login do restaurante:
//   criar_envio → { missao_id, nome_arquivo, tamanho_bytes, duracao_segundos, mime, autorizou_uso }:
//                 confere as regras, abre o envio e devolve onde subir o arquivo
//   analisar    → { envio_id }: o arquivo já subiu; a IA assiste em segundo plano (202)
// Só o admin da plataforma:
//   admin_analisar_de_novo → { envio_id }
//   admin_decidir          → { envio_id, aprovado, motivo? }: passa por cima da IA
//
// O prêmio (degrau da escada) quem dá é o banco, quando o envio vira aprovado.

import {
  ANALISE_TRAVADA_MS, caminhoDoEnvio, contagemDoAno, decidirResultado, hojeSP, inicioDoAnoSP, MENSAGENS_RECUSA,
  mimeDoVideo, podeEnviar, type EnvioResumo, type Missao, type MotivoRecusa,
} from '../_shared/videos-missao.ts'

/**
 * Enquanto a página é só do admin da plataforma. Para liberar aos clientes:
 * false aqui, e tirar o SoAdminPlataforma da rota (App.tsx) e o soAdmin do
 * menu (AppSidebar.tsx).
 */
export const SO_ADMIN = true

export interface EnvioCompleto {
  id: string
  restaurante_id: number
  missao_id: number
  caminho: string
  nome_arquivo: string
  tamanho_bytes: number
  mime: string
  status: string
  criado_em: string
  atualizado_em: string | null
}

export interface DepsVideos {
  /** Quem chamou (pelo login); restauranteId null = login sem restaurante. */
  quemPede: () => Promise<{ restauranteId: number | null; email: string; ehAdmin: boolean } | null>
  missao: (id: number) => Promise<Missao | null>
  enviosDaMissao: (restauranteId: number, missaoId: number) => Promise<EnvioResumo[]>
  /** Envios do restaurante que contam no ano: aprovados desde `desde` e os em análise. */
  enviosDoAno: (restauranteId: number, desde: string) => Promise<EnvioResumo[]>
  /** Vídeos aprovados por ano, por restaurante (video_config); null = sem limite. */
  maxPorAno: () => Promise<number | null>
  /** Envios que ficaram em "enviando" (o upload não terminou): apaga linha e arquivo. */
  descartarAbandonados: (restauranteId: number, missaoId: number) => Promise<void>
  criarEnvio: (linha: Record<string, unknown>) => Promise<void>
  envio: (id: string) => Promise<EnvioCompleto | null>
  /** O arquivo no bucket; null = não chegou. */
  arquivo: (caminho: string) => Promise<{ tamanho: number } | null>
  atualizarEnvio: (id: string, campos: Record<string, unknown>) => Promise<void>
  /** Manda o vídeo para a IA e devolve a resposta dela, crua. */
  assistir: (envio: EnvioCompleto, missao: Missao) => Promise<unknown>
  emSegundoPlano: (trabalho: Promise<unknown>) => void
  novoId: () => string
  agora: () => number
}

export interface Resultado { status: number; corpo: Record<string, unknown> }

const RECUSAS = {
  sem_login: [401, 'Entre de novo na sua conta.'],
  so_admin: [403, 'Disponível só para o admin por enquanto.'],
  sem_restaurante: [403, 'Esta conta não tem restaurante.'],
  pedido_invalido: [400, 'Pedido inválido.'],
  nao_encontrado: [404, 'Envio não encontrado.'],
  ja_enviado: [409, 'Este vídeo já foi mandado para análise.'],
  ja_analisando: [409, 'Este vídeo já está sendo analisado.'],
  sem_arquivo: [409, 'O vídeo não chegou. Tente mandar de novo.'],
  falhou: [500, 'Não foi possível agora. Tente de novo.'],
} as const

function recusa(motivo: keyof typeof RECUSAS): Resultado {
  const [status, mensagem] = RECUSAS[motivo]
  return { status, corpo: { ok: false, motivo, error: mensagem } }
}

function recusaDaMissao(motivo: MotivoRecusa): Resultado {
  return { status: 409, corpo: { ok: false, motivo, error: MENSAGENS_RECUSA[motivo] } }
}

const ERRO_DA_ANALISE = 'A análise automática não terminou. A equipe do EasyFeed vai olhar o seu vídeo.'
const frase = (v: unknown, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export async function tratarVideos(corpo: Record<string, unknown>, deps: DepsVideos): Promise<Resultado> {
  const quem = await deps.quemPede()
  if (!quem?.email) return recusa('sem_login')
  if (SO_ADMIN && !quem.ehAdmin) return recusa('so_admin')
  const acao = String(corpo?.acao ?? '')
  const iso = () => new Date(deps.agora()).toISOString()

  // A IA assiste em segundo plano e grava o veredito; falhou = erro (o admin roda de novo).
  const rodarAnalise = async (envio: EnvioCompleto, missao: Missao) => {
    try {
      const v = decidirResultado(missao, await deps.assistir(envio, missao))
      await deps.atualizarEnvio(envio.id, {
        status: v.status, analise: v.analise ?? { erro: 'Resposta da IA fora do formato' }, motivo: v.motivo, analisado_em: iso(),
      })
    } catch (e) {
      await deps.atualizarEnvio(envio.id, {
        status: 'erro', analise: { erro: frase((e as Error)?.message ?? e, 500) }, motivo: ERRO_DA_ANALISE, analisado_em: iso(),
      }).catch(() => undefined)
    }
  }

  const comecarAnalise = async (envio: EnvioCompleto): Promise<Resultado> => {
    const arquivo = await deps.arquivo(envio.caminho)
    if (!arquivo) return recusa('sem_arquivo')
    const missao = await deps.missao(envio.missao_id)
    if (!missao) return recusaDaMissao('missao_inativa')
    // O tamanho que vale é o do arquivo que chegou (não o que a tela disse).
    const pronto = { ...envio, tamanho_bytes: arquivo.tamanho, status: 'analisando' }
    await deps.atualizarEnvio(envio.id, { status: 'analisando', tamanho_bytes: arquivo.tamanho, analise: null, motivo: null, analisado_em: null })
    deps.emSegundoPlano(rodarAnalise(pronto, missao))
    return { status: 202, corpo: { ok: true, status: 'analisando' } }
  }

  try {
    if (acao === 'criar_envio') {
      if (!quem.restauranteId) return recusa('sem_restaurante')
      const missaoId = Number(corpo.missao_id)
      if (!Number.isInteger(missaoId) || missaoId <= 0) return recusa('pedido_invalido')
      const missao = await deps.missao(missaoId)
      const mime = mimeDoVideo(corpo.mime, corpo.nome_arquivo)
      const tamanho = Number(corpo.tamanho_bytes)
      const duracaoBruta = Number(corpo.duracao_segundos)
      const duracao = Number.isFinite(duracaoBruta) && duracaoBruta > 0 ? Math.round(duracaoBruta * 100) / 100 : null
      const agora = deps.agora()
      const [envios, doAno, maxPorAno] = missao
        ? await Promise.all([
          deps.enviosDaMissao(quem.restauranteId, missaoId),
          deps.enviosDoAno(quem.restauranteId, inicioDoAnoSP(agora)),
          deps.maxPorAno(),
        ])
        : [[], [], null] as [EnvioResumo[], EnvioResumo[], number | null]
      const pode = podeEnviar({
        missao, envios, ano: contagemDoAno(doAno, inicioDoAnoSP(agora), agora), maxPorAno, hoje: hojeSP(agora),
        mime, tamanho, duracao, autorizou: corpo.autorizou_uso === true, agora,
      })
      if (pode.ok === false) return recusaDaMissao(pode.motivo)

      await deps.descartarAbandonados(quem.restauranteId, missaoId)
      const id = deps.novoId()
      const caminho = caminhoDoEnvio(quem.restauranteId, id, mime)
      await deps.criarEnvio({
        id,
        restaurante_id: quem.restauranteId,
        missao_id: missaoId,
        caminho,
        nome_arquivo: frase(corpo.nome_arquivo, 200),
        tamanho_bytes: Math.round(tamanho),
        duracao_segundos: duracao,
        mime,
        autorizou_uso: true,
        status: 'enviando',
      })
      return { status: 200, corpo: { ok: true, envio_id: id, caminho, mime } }
    }

    if (acao === 'analisar') {
      if (!quem.restauranteId) return recusa('sem_restaurante')
      const envio = await deps.envio(String(corpo.envio_id ?? ''))
      if (!envio || envio.restaurante_id !== quem.restauranteId) return recusa('nao_encontrado')
      if (envio.status !== 'enviando') return recusa('ja_enviado')
      return await comecarAnalise(envio)
    }

    if (acao === 'admin_analisar_de_novo' || acao === 'admin_decidir') {
      if (!quem.ehAdmin) return recusa('so_admin')
      const envio = await deps.envio(String(corpo.envio_id ?? ''))
      if (!envio) return recusa('nao_encontrado')

      if (acao === 'admin_analisar_de_novo') {
        const travada = deps.agora() - new Date(envio.atualizado_em ?? envio.criado_em).getTime() > ANALISE_TRAVADA_MS
        if (envio.status === 'analisando' && !travada) return recusa('ja_analisando')
        return await comecarAnalise(envio)
      }

      if (envio.status === 'enviando') return recusa('sem_arquivo')
      const aprovado = corpo.aprovado === true
      const motivo = frase(corpo.motivo) || (aprovado
        ? 'Missão cumprida! Aprovado pela equipe do EasyFeed.'
        : 'A equipe do EasyFeed revisou e o vídeo não foi aceito.')
      try {
        await deps.atualizarEnvio(envio.id, {
          status: aprovado ? 'aprovado' : 'reprovado', motivo, revisado_por: quem.email.toLowerCase(), revisado_em: iso(),
        })
      } catch (e) {
        // Já existe outro vídeo aprovado desta missão para o restaurante.
        if ((e as { code?: string })?.code === '23505') return recusaDaMissao('ja_aprovada')
        throw e
      }
      return { status: 200, corpo: { ok: true, status: aprovado ? 'aprovado' : 'reprovado' } }
    }

    return recusa('pedido_invalido')
  } catch {
    return recusa('falhou')
  }
}
