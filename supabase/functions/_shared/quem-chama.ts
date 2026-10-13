/**
 * Quem está chamando a função, e se pode mexer na conta pedida.
 *
 * As funções do motor usam a chave de serviço por dentro, então enxergam e
 * gravam em qualquer conta. O portão da Supabase (`verify_jwt`) só confere que o
 * token é do projeto, e a chave PÚBLICA do site (anon) é um token do projeto:
 * sem conferir aqui, qualquer pessoa com a chave pública chamava a função
 * dizendo o id de uma ação ou de um insight de outra conta, e a IA trabalhava
 * (e cobrava) em nome dela.
 *
 * Passa:
 *   - o próprio servidor (outra função ou rotina, com a chave de serviço);
 *   - o dono da conta, logado;
 *   - o admin da plataforma, logado.
 * A chave pública sozinha (ninguém logado) não passa.
 *
 * Sem import de fora: dá para testar com `node --experimental-strip-types`.
 */

// deno-lint-ignore no-explicit-any
type Banco = any

export type QuemChama =
  | { ok: true; servico: true }
  | { ok: true; servico: false; restauranteId: number | null; ehAdmin: boolean; email: string }
  | { ok: false; status: number; erro: string }

function chaveDeServicoDoAmbiente(): string {
  // deno-lint-ignore no-explicit-any
  return String((globalThis as any).Deno?.env?.get?.('SUPABASE_SERVICE_ROLE_KEY') ?? '')
}

export async function quemChama(req: Request, admin: Banco, chaveDeServico = chaveDeServicoDoAmbiente()): Promise<QuemChama> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return { ok: false, status: 401, erro: 'Autenticação obrigatória' }
  if (chaveDeServico && jwt === chaveDeServico) return { ok: true, servico: true }

  let usuario: { id: string; email?: string | null } | null = null
  try {
    const { data, error } = await admin.auth.getUser(jwt)
    if (!error) usuario = data?.user ?? null
  } catch { /* token que não é de usuário (a chave pública, por exemplo) */ }
  if (!usuario?.id) return { ok: false, status: 401, erro: 'Entre na sua conta para continuar.' }

  const email = String(usuario.email ?? '').toLowerCase()
  const [{ data: rest }, { data: admins }] = await Promise.all([
    admin.from('restaurantes').select('id').eq('auth_user_id', usuario.id).maybeSingle(),
    admin.from('platform_admins').select('email'),
  ])
  return {
    ok: true,
    servico: false,
    restauranteId: rest?.id != null ? Number(rest.id) : null,
    ehAdmin: !!email && (admins ?? []).some((a: { email: string }) => String(a.email).toLowerCase() === email),
    email,
  }
}

/** Quem chamou pode mexer nos dados desta conta? */
export function podeMexerNaConta(quem: QuemChama, restauranteId: unknown): boolean {
  if (quem.ok === false) return false
  if (quem.servico === true) return true
  if (quem.ehAdmin) return true
  const id = Number(restauranteId)
  return Number.isFinite(id) && quem.restauranteId != null && quem.restauranteId === id
}
