import { supabase } from '@/lib/supabase/client'
import { PREFIXO_DEMO } from '@/lib/demo'

/*
 * As funções de vendedor e demonstração são novas no banco (migration
 * 20260914010000) e os tipos gerados em `types.ts` ainda não as conhecem. Este
 * cast troca só a checagem do NOME da função por uma assinatura genérica; o
 * formato de cada resposta é tipado em cada chamada abaixo.
 */
type RespostaRpc = { data: unknown; error: { message: string } | null }
const rpcSemTipo = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<RespostaRpc>

function primeiraLinha<T>(data: unknown): T | undefined {
  return (Array.isArray(data) ? data[0] : data ?? undefined) as T | undefined
}

/** Mensagem que a edge function mandou no corpo, em vez do "non-2xx" genérico. */
async function mensagemDoErro(error: unknown, padrao: string): Promise<string> {
  try {
    const corpo = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.()
    if (corpo?.error) return corpo.error
  } catch {
    /* usa o padrão */
  }
  return padrao
}

// ── A conta ───────────────────────────────────────────────────────────────────

export interface SessaoDemo {
  expiraEm: Date
  duracaoMinutos: number
}

export interface AcessoConta {
  ehVendedor: boolean
  /** Preenchido só quando ESTA sessão é uma demonstração. */
  demo: SessaoDemo | null
}

export async function buscarMeuAcesso(): Promise<AcessoConta> {
  const { data, error } = await rpcSemTipo('meu_acesso')
  if (error) throw new Error(error.message)
  const linha = primeiraLinha<{
    eh_vendedor: boolean
    em_demonstracao: boolean
    demo_expira_em: string | null
    demo_duracao_minutos: number | null
  }>(data)
  if (!linha) return { ehVendedor: false, demo: null }
  return {
    ehVendedor: linha.eh_vendedor === true,
    demo:
      linha.em_demonstracao && linha.demo_expira_em
        ? { expiraEm: new Date(linha.demo_expira_em), duracaoMinutos: linha.demo_duracao_minutos ?? 120 }
        : null,
  }
}

// ── O painel do vendedor ──────────────────────────────────────────────────────

export interface CodigoDemo {
  codigo: string
  segundosRestantes: number
  proximoAcessoTeste: boolean
}

export async function buscarCodigoDemo(): Promise<CodigoDemo | null> {
  const { data, error } = await rpcSemTipo('meu_codigo_demo')
  if (error) throw new Error(error.message)
  const linha = primeiraLinha<{ codigo: string; segundos_restantes: number; proximo_acesso_teste: boolean }>(data)
  if (!linha) return null
  return {
    codigo: linha.codigo,
    segundosRestantes: linha.segundos_restantes,
    proximoAcessoTeste: linha.proximo_acesso_teste,
  }
}

export async function definirTesteDemo(ligado: boolean): Promise<void> {
  const { error } = await rpcSemTipo('definir_teste_demo', { p_ligado: ligado })
  if (error) throw new Error(error.message)
}

// ── Entrar e sair ─────────────────────────────────────────────────────────────

export async function entrarNaDemo(codigo: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('entrar-demo', { body: { codigo } })
  if (error) throw new Error(await mensagemDoErro(error, 'Não foi possível conferir o código.'))

  const resposta = data as { token_hash?: string; sessao_demo_id?: string } | null
  if (!resposta?.token_hash || !resposta.sessao_demo_id) {
    throw new Error('Não foi possível abrir a demonstração. Digite o próximo código.')
  }

  const { error: erroLogin } = await supabase.auth.verifyOtp({
    token_hash: resposta.token_hash,
    type: 'magiclink',
  })
  if (erroLogin) throw new Error('O código venceu antes de abrir. Digite o próximo.')

  // Sem o registro a demonstração ainda fecha (em 2 h, contadas do login), mas o
  // teste de 3 min e a hora exata do fim dependem dele.
  const { error: erroRegistro } = await rpcSemTipo('registrar_sessao_demo', {
    p_sessao_demo_id: resposta.sessao_demo_id,
  })
  if (erroRegistro) console.error('Falha ao registrar a demonstração:', erroRegistro)
}

/** Vira `true` quando esta aba começa a fechar a demonstração, para quem ouve o
    logout (`ControleDemo`) não disparar uma segunda navegação por cima desta. */
let encerrando = false
export function demoEstaEncerrando(): boolean {
  return encerrando
}

/** Fecha a demonstração SÓ nesta aba. `scope: 'local'` é o ponto: o padrão do
    supabase-js desconecta a conta em todos os aparelhos — o do vendedor junto. */
export async function encerrarDemo(): Promise<void> {
  if (encerrando) return
  encerrando = true
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  window.location.replace(`${PREFIXO_DEMO}/encerrada`)
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface VendedorAdmin {
  email: string
  restauranteId: number | null
  nomeRestaurante: string | null
  temConta: boolean
  ultimaDemoEm: string | null
}

export async function buscarVendedores(): Promise<VendedorAdmin[]> {
  const { data, error } = await rpcSemTipo('admin_listar_vendedores')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<{
    email: string
    restaurante_id: number | null
    nome_restaurante: string | null
    tem_conta: boolean
    ultima_demo_em: string | null
  }>).map((v) => ({
    email: v.email,
    restauranteId: v.restaurante_id,
    nomeRestaurante: v.nome_restaurante,
    temConta: v.tem_conta,
    ultimaDemoEm: v.ultima_demo_em,
  }))
}

/** Marca ou desmarca um email como vendedor. Vale antes de a conta existir. */
export async function definirVendedor(email: string, vendedor: boolean): Promise<void> {
  const { error } = await rpcSemTipo('admin_definir_vendedor', { p_email: email, p_vendedor: vendedor })
  if (error) throw new Error(error.message)
}
