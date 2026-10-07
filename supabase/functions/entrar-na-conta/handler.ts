// Admin da plataforma entra na conta de um cliente (painel Admin → Contas →
// "Entrar"). Sem Deno nem banco: o index.ts liga as dependências, e o teste
// roda isto com tudo de mentira.
//
// A sessão aberta é de verdade (mesmos dados e permissões do cliente) e fica
// registrada em `acessos_admin` pelo id dela — é assim que o banco diferencia
// o admin dentro da conta do próprio cliente.

export interface SessaoAberta {
  access_token: string
  refresh_token: string
}

export interface DepsEntrar {
  /** Quem está pedindo (pelo login do admin); null = login inválido. */
  quemPede: () => Promise<{ userId: string; email: string } | null>
  /** E-mails dos admins da plataforma. */
  emailsAdmins: () => Promise<string[]>
  restaurante: (id: number) => Promise<{ auth_user_id: string | null; nome_restaurante: string | null; excluida_em: string | null } | null>
  emailDoUsuario: (userId: string) => Promise<string | null>
  /** Cria o registro do acesso e devolve o id dele. */
  registrar: (r: { admin_email: string; admin_user_id: string; alvo_user_id: string; restaurante_id: number }) => Promise<string>
  /** Link mágico da conta trocado por uma sessão (sem mandar e-mail). */
  abrirSessao: (email: string) => Promise<SessaoAberta>
  /** Liga o registro à sessão aberta. */
  gravarSessao: (registroId: string, sessionId: string) => Promise<void>
}

export interface Resultado { status: number; corpo: Record<string, unknown> }

const RECUSAS = {
  sem_login: [401, 'Entre de novo na sua conta de admin.'],
  so_admin: [403, 'Só o admin da plataforma entra em outras contas.'],
  pedido_invalido: [400, 'Conta não informada.'],
  nao_encontrada: [404, 'Conta não encontrada.'],
  conta_excluida: [409, 'Esta conta está excluída. Restaure antes de entrar.'],
  sem_email: [409, 'Esta conta não tem e-mail de login.'],
  conta_de_admin: [409, 'É a conta de um admin da plataforma.'],
  falhou: [500, 'Não foi possível abrir a conta agora. Tente de novo.'],
} as const

function recusa(motivo: keyof typeof RECUSAS): Resultado {
  const [status, mensagem] = RECUSAS[motivo]
  return { status, corpo: { ok: false, motivo, error: mensagem } }
}

/** O id da sessão vem dentro do próprio token (claim `session_id`). */
export function idDaSessao(accessToken: string): string | null {
  try {
    const parte = accessToken.split('.')[1] ?? ''
    const b64 = parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '=')
    const id = JSON.parse(atob(b64))?.session_id
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

export async function entrarNaConta(restauranteIdBruto: unknown, deps: DepsEntrar): Promise<Resultado> {
  const quem = await deps.quemPede()
  if (!quem?.email) return recusa('sem_login')
  const admins = (await deps.emailsAdmins()).map((e) => e.toLowerCase())
  if (!admins.includes(quem.email.toLowerCase())) return recusa('so_admin')

  const restauranteId = Number(restauranteIdBruto)
  if (!Number.isInteger(restauranteId) || restauranteId <= 0) return recusa('pedido_invalido')
  const rest = await deps.restaurante(restauranteId)
  if (!rest?.auth_user_id) return recusa('nao_encontrada')
  if (rest.excluida_em) return recusa('conta_excluida')
  const email = await deps.emailDoUsuario(rest.auth_user_id)
  if (!email) return recusa('sem_email')
  if (admins.includes(email.toLowerCase())) return recusa('conta_de_admin')

  try {
    const registroId = await deps.registrar({
      admin_email: quem.email.toLowerCase(),
      admin_user_id: quem.userId,
      alvo_user_id: rest.auth_user_id,
      restaurante_id: restauranteId,
    })
    const sessao = await deps.abrirSessao(email)
    const sessionId = idDaSessao(sessao.access_token)
    // Sem o id não dá para marcar a sessão como do admin: melhor não entrar.
    if (!sessionId) throw new Error('token sem session_id')
    await deps.gravarSessao(registroId, sessionId)
    return {
      status: 200,
      corpo: { ok: true, access_token: sessao.access_token, refresh_token: sessao.refresh_token, email, nome: rest.nome_restaurante },
    }
  } catch (e) {
    console.error('entrar-na-conta: falhou', e)
    return recusa('falhou')
  }
}
