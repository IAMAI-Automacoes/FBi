import { supabase } from '@/lib/supabase/client'

/*
 * Admin da plataforma dentro da conta de um cliente (painel Admin → Contas →
 * "Entrar"). A sessão aberta é de verdade: mesmos dados e permissões do cliente.
 *
 * O login do próprio admin fica guardado neste navegador enquanto ele está lá
 * dentro, para "Voltar para minha conta" não pedir senha. O banco sabe que a
 * sessão é do admin (tabela `acessos_admin`, pelo id da sessão); a marca local
 * só serve para pausar coisas deste aparelho, como o push.
 */

const CHAVE = 'easyfeed:login-do-admin'

interface LoginGuardado {
  access_token: string
  refresh_token: string
  email: string | null
}

export interface AcessoAdmin {
  adminEmail: string
  restauranteId: number
  iniciadoEm: Date
}

function lerGuardado(): LoginGuardado | null {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const l = bruto ? (JSON.parse(bruto) as LoginGuardado) : null
    return l?.access_token && l?.refresh_token ? l : null
  } catch {
    return null
  }
}

function apagarGuardado() {
  try { localStorage.removeItem(CHAVE) } catch { /* sem armazenamento */ }
}

/** Este navegador está com o admin dentro da conta de alguém. */
export function estouDentroDeOutraConta(): boolean {
  return lerGuardado() !== null
}

/** A sessão atual é o admin dentro da conta? Quem decide é o banco. */
export async function buscarAcessoAdmin(): Promise<AcessoAdmin | null> {
  const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  const { data, error } = await rpc('acesso_admin_atual')
  if (error) throw new Error(error.message)
  const linha = (Array.isArray(data) ? data[0] : data) as { admin_email: string; restaurante_id: number; iniciado_em: string } | undefined
  if (!linha) return null
  return { adminEmail: linha.admin_email, restauranteId: Number(linha.restaurante_id), iniciadoEm: new Date(linha.iniciado_em) }
}

/** Entra na conta do restaurante e abre o painel dele (recarrega a página). */
export async function entrarNaConta(restauranteId: number): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Entre de novo na sua conta de admin.')

  const { data, error } = await supabase.functions.invoke('entrar-na-conta', { body: { restauranteId } })
  if (error) {
    let mensagem = 'Não foi possível abrir a conta agora.'
    try {
      const corpo = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.()
      if (corpo?.error) mensagem = corpo.error
    } catch { /* usa a padrão */ }
    throw new Error(mensagem)
  }
  const nova = data as { access_token?: string; refresh_token?: string }
  if (!nova?.access_token || !nova?.refresh_token) throw new Error('Não foi possível abrir a conta agora.')

  // Guarda o login do admin ANTES de trocar: é o caminho de volta.
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, email: session.user.email ?? null }))
  } catch {
    throw new Error('Este navegador não deixa guardar o seu login para voltar depois.')
  }
  const { error: erroTroca } = await supabase.auth.setSession({ access_token: nova.access_token, refresh_token: nova.refresh_token })
  if (erroTroca) {
    apagarGuardado()
    await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
    throw new Error('Não foi possível abrir a conta agora.')
  }
  // Recarrega do zero: nada da tela do admin (listas, canais de tempo real) fica para trás.
  window.location.assign('/')
}

/**
 * Sai da conta do cliente e volta para a do admin. Só esta sessão é encerrada:
 * o cliente continua logado nos aparelhos dele.
 */
export async function voltarParaMinhaConta(): Promise<void> {
  // Ainda com a sessão do cliente: fecha o registro e apaga a sessão no banco.
  try {
    const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string) => PromiseLike<unknown>
    await rpc('encerrar_acesso_admin')
  } catch { /* segue: a limpeza de minuto em minuto fecha o registro */ }

  const guardado = lerGuardado()
  apagarGuardado()
  if (guardado) {
    const { error } = await supabase.auth.setSession({ access_token: guardado.access_token, refresh_token: guardado.refresh_token })
    if (!error) {
      window.location.assign('/admin?aba=contas')
      return
    }
  }
  // Sem o login guardado (ou ele venceu): entra de novo.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  window.location.assign('/login')
}
