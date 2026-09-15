/**
 * Sessão de DEMONSTRAÇÃO: a conta de um vendedor aberta por código em /demo,
 * no computador de outra pessoa.
 *
 * O que mexe na conta de verdade (WhatsApp, assinatura, excluir a conta) já
 * some da tela na demonstração. Esta checagem repete a trava no servidor, para
 * ela não depender só da tela. A regra é a mesma de `meu_acesso` no banco.
 */

// deno-lint-ignore no-explicit-any
type Db = any

interface Claims {
  session_id?: string
  email?: string
  amr?: Array<{ method?: string }>
}

function lerClaims(jwt: string): Claims | null {
  try {
    const parte = jwt.split('.')[1]
    if (!parte) return null
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/')
    const preenchido = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(atob(preenchido)) as Claims
  } catch {
    return null
  }
}

export const MENSAGEM_BLOQUEADO_NA_DEMO = 'Isto fica bloqueado durante a demonstração.'

/** Só chame depois de validar o JWT (`auth.getUser`): aqui ele é apenas lido. */
export async function ehSessaoDemo(db: Db, jwt: string): Promise<boolean> {
  const claims = lerClaims(jwt)
  if (!claims) return false

  if (claims.session_id) {
    const { data } = await db
      .from('sessoes_demo')
      .select('id')
      .eq('session_id', claims.session_id)
      .maybeSingle()
    if (data) return true
  }

  // Link mágico de vendedor ainda não registrado também é demonstração.
  const porLinkMagico = (claims.amr ?? []).some((a) => a?.method === 'magiclink' || a?.method === 'otp')
  if (!porLinkMagico || !claims.email) return false

  const { data: vendedor } = await db
    .from('vendedores')
    .select('email')
    .eq('email', claims.email.toLowerCase())
    .maybeSingle()
  return Boolean(vendedor)
}
