/**
 * conectar-afiliado — cria/atualiza a conta Stripe Connect de um afiliado e
 * devolve o link de cadastro (onboarding) hospedado pelo Stripe.
 *
 * Só admin da plataforma (`platform_admins`). O afiliado nunca chama isto:
 * ele recebe o link do admin, preenche os dados no Stripe (identidade, conta
 * bancária) e o Stripe cuida da verificação. Quando a conta fica pronta,
 * `afiliados.stripe_connect_status = 'ativo'` e as comissões passam a ser
 * transferidas automaticamente a cada fatura paga.
 *
 * Tipo de conta: Express (o afiliado tem um painel simplificado do Stripe
 * para ver saques; a IAMAI não precisa cuidar dos dados bancários dele).
 * VERIFICAR: disponibilidade do Connect e do tipo Express para plataforma
 * brasileira na conta da IAMAI. Se o Stripe recusar `type: 'express'`,
 * trocar para `controller` (a forma nova) ou `standard` — a lógica é a mesma.
 *
 * Ações:
 *   { afiliado_id, acao: 'onboarding' }  → cria a conta se faltar, devolve { url }
 *   { afiliado_id, acao: 'status' }      → relê a conta no Stripe, atualiza o status
 *
 * Deploy: `supabase functions deploy conectar-afiliado` (JWT obrigatório).
 */
import { z } from 'npm:zod@4.3.6'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import Stripe, { stripe, PRODUCT_CODE } from '../_shared/stripe/cliente.ts'
import { siteUrl } from '../_shared/stripe/config.ts'

const Entrada = z.object({
  afiliado_id: z.string().uuid(),
  acao: z.enum(['onboarding', 'status']).default('onboarding'),
})

// deno-lint-ignore no-explicit-any
type Db = any

async function exigirAdmin(req: Request, db: Db): Promise<{ email: string } | { erro: string; status: number }> {
  const auth = req.headers.get('Authorization')
  if (!auth) return { erro: 'Autenticação obrigatória', status: 401 }
  const { data, error } = await db.auth.getUser(auth.replace('Bearer ', ''))
  const email = data?.user?.email?.toLowerCase()
  if (error || !email) return { erro: 'Sessão inválida', status: 401 }
  const { data: admin } = await db.from('platform_admins').select('email').ilike('email', email).maybeSingle()
  if (!admin) return { erro: 'Só administradores da plataforma', status: 403 }
  return { email }
}

/** Traduz o estado da conta Connect para o campo do afiliado. */
export function statusDaConta(conta: Stripe.Account): 'pendente' | 'ativo' | 'restrito' {
  if (conta.payouts_enabled && conta.charges_enabled !== false) return 'ativo'
  const pendencias = conta.requirements?.currently_due?.length ?? 0
  const desabilitada = Boolean(conta.requirements?.disabled_reason)
  if (conta.details_submitted && (desabilitada || pendencias > 0)) return 'restrito'
  return 'pendente'
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const entrada = Entrada.safeParse(await req.json().catch(() => ({})))
    if (!entrada.success) return json({ error: 'Dados inválidos' }, 400)
    const { afiliado_id, acao } = entrada.data

    const db = clienteAdmin()
    const quem = await exigirAdmin(req, db)
    if ('erro' in quem) return json({ error: quem.erro }, quem.status)

    const { data: af } = await db
      .from('afiliados')
      .select('id, nome, email, cpf_cnpj, stripe_account_id, stripe_connect_status')
      .eq('id', afiliado_id)
      .maybeSingle()
    if (!af) return json({ error: 'Afiliado não encontrado' }, 404)

    let contaId: string | null = af.stripe_account_id ?? null

    if (acao === 'status') {
      if (!contaId) return json({ status: 'nao_conectado' })
      const conta = await stripe().accounts.retrieve(contaId)
      const status = statusDaConta(conta)
      await db.from('afiliados').update({ stripe_connect_status: status }).eq('id', af.id)
      return json({ status, payouts_enabled: conta.payouts_enabled, pendencias: conta.requirements?.currently_due ?? [] })
    }

    if (!contaId) {
      const conta = await stripe().accounts.create(
        {
          type: 'express',
          country: 'BR',
          email: af.email ?? undefined,
          default_currency: 'brl',
          capabilities: { transfers: { requested: true } },
          business_profile: { name: af.nome, product_description: 'Indicação de clientes para o EasyFeed' },
          metadata: { product_code: PRODUCT_CODE, afiliado_id: af.id },
        },
        { idempotencyKey: `connect-afiliado-${af.id}` },
      )
      contaId = conta.id
      await db
        .from('afiliados')
        .update({ stripe_account_id: contaId, stripe_connect_status: 'pendente' })
        .eq('id', af.id)
    }

    const site = await siteUrl(db)
    const link = await stripe().accountLinks.create({
      account: contaId,
      type: 'account_onboarding',
      // Volta para o painel admin; o status é relido lá (acao: 'status').
      return_url: `${site}/admin?afiliado=${af.id}&connect=retorno`,
      refresh_url: `${site}/admin?afiliado=${af.id}&connect=expirado`,
    })

    return json({ url: link.url, stripe_account_id: contaId })
  } catch (e) {
    console.error('[conectar-afiliado]', (e as Error).message)
    return json({ error: 'Não foi possível conectar o afiliado ao Stripe agora.' }, 500)
  }
})
