// Entrada do EasyFeed Influencers (/influencers): decide se a pessoa digita a
// senha, recebe o link de primeiro acesso ou não tem acesso. Sem Deno nem
// banco: o index.ts liga as dependências, e o teste roda isto com tudo de
// mentira.
//
// Primeiro acesso é por LINK NO E-MAIL, e não "cria a senha aqui": sem
// confirmar o e-mail, quem soubesse o e-mail de um influenciador poderia criar
// a senha antes dele.

import { mandarPelaReserva, normalizarEmail, type DepsRecuperar } from '../recuperar-senha/handler.ts'

/** Consultas da tela de entrada por IP por hora (contra varredura de e-mails). */
export const LIMITE_CONSULTAS_POR_HORA = 30
/** Links por e-mail: no máximo 1 por minuto; por IP: 5 por hora (os mesmos da recuperação de senha). */
export const LIMITE_LINK_EMAIL_SEGUNDOS = 60
export const LIMITE_LINKS_IP_POR_HORA = 5
export const VALIDADE_MINUTOS = 60

export type Acao = 'situacao' | 'esqueci'

export interface DepsAcesso extends Pick<DepsRecuperar, 'enviarPeloSupabase' | 'emSegundoPlano' | 'esperar'> {
  ipHash: string
  contarConsultas: (ipHash: string, desdeIso: string) => Promise<number>
  registrarConsulta: (ipHash: string) => Promise<void>
  /** O e-mail está na lista do admin? Devolve o nome (do onboarding) quando está. */
  naLista: (email: string) => Promise<{ nome: string | null } | null>
  /** Usuário do Supabase com este e-mail e se ele já tem senha. */
  conta: (email: string) => Promise<{ userId: string | null; temSenha: boolean }>
  criarUsuario: (email: string) => Promise<string>
  ligarUsuario: (email: string, userId: string) => Promise<void>
  contarLinksPorEmail: (email: string, desdeIso: string) => Promise<number>
  contarLinksPorIp: (ipHash: string, desdeIso: string) => Promise<number>
  registrarLink: (email: string, ipHash: string) => Promise<void>
  /** Link de criar senha (recuperação do Supabase, voltando para /influencers/criar-senha). */
  gerarLink: (email: string) => Promise<string>
  /** E-mail pelo n8n (domínio do EasyFeed); null = não configurado. Devolve se deu certo. */
  enviarN8n: ((p: { email: string; nome: string | null; link: string; validadeMinutos: number; tipo: 'acesso_influencer' }) => Promise<boolean>) | null
  agora?: () => number
}

export interface Resultado { status: number; corpo: Record<string, unknown> }

const ok = (situacao: 'sem_acesso' | 'entrar' | 'link_enviado'): Resultado => ({ status: 200, corpo: { ok: true, situacao } })

export async function acessoInfluencer(acaoBruta: unknown, emailBruto: unknown, deps: DepsAcesso): Promise<Resultado> {
  const acao: Acao = acaoBruta === 'esqueci' ? 'esqueci' : 'situacao'
  const email = normalizarEmail(emailBruto)
  if (!email) return { status: 400, corpo: { ok: false, motivo: 'email_invalido' } }

  const agora = deps.agora?.() ?? Date.now()
  const umaHora = new Date(agora - 60 * 60_000).toISOString()
  if (await deps.contarConsultas(deps.ipHash, umaHora) >= LIMITE_CONSULTAS_POR_HORA) {
    return { status: 429, corpo: { ok: false, motivo: 'muitas_tentativas' } }
  }
  await deps.registrarConsulta(deps.ipHash)

  const naLista = await deps.naLista(email)
  if (!naLista) return ok('sem_acesso')

  const conta = await deps.conta(email)
  if (acao === 'situacao' && conta.temSenha) return ok('entrar')

  // Daqui em diante manda o link (primeiro acesso ou "esqueci a senha").
  if (await deps.contarLinksPorIp(deps.ipHash, umaHora) >= LIMITE_LINKS_IP_POR_HORA) {
    return { status: 429, corpo: { ok: false, motivo: 'muitas_tentativas' } }
  }
  // Pediu de novo em menos de 1 minuto: o link anterior já foi.
  const umMinuto = new Date(agora - LIMITE_LINK_EMAIL_SEGUNDOS * 1000).toISOString()
  if (await deps.contarLinksPorEmail(email, umMinuto) > 0) return ok('link_enviado')
  await deps.registrarLink(email, deps.ipHash)

  const userId = conta.userId ?? await deps.criarUsuario(email)
  await deps.ligarUsuario(email, userId)

  let link: string
  try {
    link = await deps.gerarLink(email)
  } catch (e) {
    console.error('acesso-influencer: falha ao gerar o link; vai pelo Supabase', e)
    await mandarPelaReserva(email, deps)
    return ok('link_enviado')
  }

  const enviado = deps.enviarN8n
    ? await deps.enviarN8n({ email, nome: naLista.nome, link, validadeMinutos: VALIDADE_MINUTOS, tipo: 'acesso_influencer' }).catch(() => false)
    : false
  if (!enviado) {
    if (deps.enviarN8n) console.error('acesso-influencer: n8n não confirmou o envio; vai pelo Supabase')
    await mandarPelaReserva(email, deps)
  }
  return ok('link_enviado')
}
