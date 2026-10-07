// "Esqueci a senha": decide se manda o e-mail e por onde. Sem Deno nem banco:
// o index.ts liga as dependências, e o teste roda isto com tudo de mentira.
//
// Caminho normal: gera o link oficial de recuperação do Supabase e entrega ao
// n8n, que manda o e-mail pelo domínio do EasyFeed (nao-responda@easyfeed.com.br,
// Hostinger). Se o n8n não estiver configurado ou falhar, manda pelo próprio
// Supabase, como antes — a recuperação de senha nunca fica fora do ar.

export const LIMITE_EMAIL_SEGUNDOS = 60
export const LIMITE_IP_POR_HORA = 5
/** Validade do link de recuperação (padrão do Supabase Auth: 1 hora). */
export const VALIDADE_MINUTOS = 60

export interface DepsRecuperar {
  /** IP de quem pediu, já embaralhado. */
  ipHash: string
  contarPorEmail: (email: string, desdeIso: string) => Promise<number>
  contarPorIp: (ipHash: string, desdeIso: string) => Promise<number>
  registrar: (email: string, ipHash: string) => Promise<void>
  /** Link de recuperação e nome da pessoa; null quando não existe conta com esse e-mail. */
  gerarLink: (email: string) => Promise<{ link: string; nome: string | null } | null>
  /** Entrega ao n8n; null = n8n não configurado. Devolve se deu certo. */
  enviarN8n: ((p: { email: string; nome: string | null; link: string; validadeMinutos: number }) => Promise<boolean>) | null
  /** O e-mail padrão do Supabase (reserva). */
  enviarPeloSupabase: (email: string) => Promise<void>
  agora?: () => number
}

export interface Resultado { status: number; corpo: Record<string, unknown> }

export function normalizarEmail(valor: unknown): string | null {
  const e = String(valor ?? '').trim().toLowerCase()
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

/**
 * Responde sempre "ok" para e-mail válido, exista conta ou não — senão a tela
 * viraria um jeito de descobrir quem tem conta no EasyFeed.
 */
export async function pedirRecuperacao(emailBruto: unknown, deps: DepsRecuperar): Promise<Resultado> {
  const email = normalizarEmail(emailBruto)
  if (!email) return { status: 400, corpo: { ok: false, motivo: 'email_invalido' } }

  const agora = deps.agora?.() ?? Date.now()
  const umaHora = new Date(agora - 60 * 60_000).toISOString()
  if (await deps.contarPorIp(deps.ipHash, umaHora) >= LIMITE_IP_POR_HORA) {
    return { status: 429, corpo: { ok: false, motivo: 'muitas_tentativas' } }
  }
  // Pediu de novo para o mesmo e-mail em menos de 1 minuto: o anterior já foi.
  const umMinuto = new Date(agora - LIMITE_EMAIL_SEGUNDOS * 1000).toISOString()
  if (await deps.contarPorEmail(email, umMinuto) > 0) return { status: 200, corpo: { ok: true } }

  await deps.registrar(email, deps.ipHash)

  if (!deps.enviarN8n) {
    await deps.enviarPeloSupabase(email)
    return { status: 200, corpo: { ok: true } }
  }

  let gerado: { link: string; nome: string | null } | null
  try {
    gerado = await deps.gerarLink(email)
  } catch (e) {
    console.error('recuperar-senha: falha ao gerar o link; vai pelo Supabase', e)
    await deps.enviarPeloSupabase(email)
    return { status: 200, corpo: { ok: true } }
  }
  if (!gerado) return { status: 200, corpo: { ok: true } } // sem conta com esse e-mail

  const enviado = await deps.enviarN8n({ email, nome: gerado.nome, link: gerado.link, validadeMinutos: VALIDADE_MINUTOS }).catch(() => false)
  if (!enviado) {
    console.error('recuperar-senha: n8n não confirmou o envio; vai pelo Supabase')
    await deps.enviarPeloSupabase(email)
  }
  return { status: 200, corpo: { ok: true } }
}
