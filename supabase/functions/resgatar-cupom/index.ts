// Resgata um cupom: libera o acesso (assinatura ativa por `dias_validade` dias,
// ou sem data de fim) e/ou guarda um desconto para a cobrança.
//
// Desde 15/10/2026 (decisões do Raver, regra em _shared/cupom.ts):
//   - o cupom é de UM software: conta de outro software recebe "Cupom inválido";
//   - desconto em % ou R$ fica guardado em `cupons_usos` e entra na cobrança
//     quando o pagamento novo (Asaas) chegar. Cupom só de desconto parcial não
//     libera o acesso; sem desconto, com 100% ou com dias grátis, libera;
//   - o cupom escolhe o tipo de conta: vendedor entra em `vendedores`, admin em
//     `platform_admins` (o de admin sempre tem limite de usos e validade, o
//     banco garante).
//
// Cupom com `somente_vendedores` só é resgatado por conta cujo email está
// marcado como vendedor: é o cupom do vendedor, e o nome é fácil de adivinhar.
//
// Estava publicada só no painel do Supabase, sem fonte no repositório. Este
// arquivo partiu do que estava rodando (versão 16), trazido para cá para que
// um deploy geral não a apague.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cupomDaArea, oQueOCupomDa } from '../_shared/cupom.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
    const jwt = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    // Quem está resgatando
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401)
    const userId = userData.user.id

    const { data: rest, error: restErr } = await admin
      .from('restaurantes')
      .select('id, assinatura_status, area')
      .eq('auth_user_id', userId)
      .single()
    if (restErr || !rest?.id) return json({ error: 'Restaurante não encontrado' }, 403)

    const body = await req.json().catch(() => ({}))
    const codigo = String(body.codigo ?? '').trim()
    if (!codigo) return json({ error: 'Informe o código do cupom.' }, 400)

    // `ilike` trata `%`, `*` e `_` como curinga: um código "%" casava com o
    // primeiro cupom ativo e liberava acesso de graça. Só letras, números, hífen
    // e sublinhado — e o sublinhado vai escapado, para valer como ele mesmo.
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(codigo)) return json({ error: 'Cupom inválido ou inativo.' }, 404)

    // Busca o cupom (sem diferenciar maiúscula/minúscula)
    const { data: cupons } = await admin
      .from('cupons')
      .select('*')
      .ilike('cupom', codigo.replace(/_/g, '\\_'))
      .limit(1)
    const cupom = cupons?.[0]
    if (!cupom || cupom.ativo !== true) return json({ error: 'Cupom inválido ou inativo.' }, 404)
    // Cupom de outro software: a mesma resposta de cupom inexistente.
    if (!cupomDaArea(cupom.area, rest.area)) return json({ error: 'Cupom inválido ou inativo.' }, 404)

    // O que o cupom dá: acesso, desconto guardado, ou os dois.
    const da = oQueOCupomDa(cupom)

    // TODO(asaas): com a cobrança recorrente, recusar cupom de acesso para quem
    // tem assinatura que ainda cobra (acesso grátis com o cartão sendo cobrado).

    // Cupom de vendedor: só para email marcado como vendedor.
    if (cupom.somente_vendedores === true) {
      const email = String(userData.user.email ?? '').trim().toLowerCase()
      const { data: vendedor } = await admin
        .from('vendedores')
        .select('email')
        .eq('email', email)
        .maybeSingle()
      if (!vendedor) return json({ error: 'Este cupom é exclusivo para vendedores do Easy Feed.' }, 403)
    }

    // Passou do último dia em que podia ser resgatado?
    if (cupom.data_expiracao) {
      const hoje = new Date().toISOString().slice(0, 10)
      if (String(cupom.data_expiracao) < hoje) return json({ error: 'Este cupom expirou.' }, 410)
    }

    // Esgotado? (vezes_uso_maximo nulo = ilimitado)
    const max = cupom.vezes_uso_maximo
    const usado = Number(cupom.vezes_usado ?? 0)
    if (max != null && usado >= Number(max)) return json({ error: 'Este cupom já atingiu o limite de usos.' }, 410)

    // Reserva o uso de forma atômica (lock otimista pelo valor atual): o
    // `.eq('vezes_usado', usado)` só deixa passar quem leu o valor mais
    // recente, então dois resgates simultâneos não gastam o mesmo uso.
    const { data: claim, error: claimErr } = await admin
      .from('cupons')
      .update({ vezes_usado: usado + 1 })
      .eq('id', cupom.id)
      .eq('vezes_usado', usado)
      .select('id')
    if (claimErr) return json({ error: claimErr.message }, 500)
    if (!claim?.length) return json({ error: 'Cupom em uso agora, tente novamente.' }, 409)

    // Quantos dias de acesso o cupom libera (vazio/0 = sem expiração)
    const dias = parseInt(String(cupom.dias_validade ?? '').replace(/\D/g, ''), 10)
    let expira: string | null = null
    if (Number.isFinite(dias) && dias > 0) {
      const d = new Date()
      d.setDate(d.getDate() + dias)
      expira = d.toISOString()
    }

    if (da.acesso) {
      // Libera o acesso (service_role passa pelo trigger de proteção).
      const { data: upd, error: updErr } = await admin
        .from('restaurantes')
        .update({
          assinatura_status: 'ativa',
          assinatura_expira_em: expira,
          assinatura_cancelada_em: null,
        })
        .eq('id', rest.id)
        .select('id')
      if (updErr || !upd?.length) {
        // Devolve o uso reservado, para o cupom não ser consumido à toa
        await admin.from('cupons').update({ vezes_usado: usado }).eq('id', cupom.id)
        return json({ error: 'Não consegui liberar o acesso. Tente de novo.' }, 500)
      }
    }

    // O tipo de conta que o cupom cria.
    const email = String(userData.user.email ?? '').trim().toLowerCase()
    const tipoConta = cupom.tipo_conta === 'vendedor' || cupom.tipo_conta === 'admin' ? cupom.tipo_conta : 'normal'
    if (tipoConta === 'vendedor' && email) {
      await admin.from('vendedores').upsert({ email, criado_por: `cupom ${cupom.cupom}` }, { onConflict: 'email', ignoreDuplicates: true })
    }
    if (tipoConta === 'admin' && email) {
      await admin.from('platform_admins').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })
    }

    // Quem usou, e o desconto que fica guardado para a cobrança.
    await admin.from('cupons_usos').insert({
      cupom_id: cupom.id,
      cupom: cupom.cupom,
      restaurante_id: rest.id,
      email: email || null,
      area: rest.area === 'rh' ? 'rh' : 'restaurante',
      tipo_conta: tipoConta,
      dias_validade: da.acesso ? da.dias : null,
      porcentagem_desconto: da.desconto?.tipo === 'porcentagem' ? da.desconto.valor : null,
      valor_desconto: da.desconto?.tipo === 'valor' ? da.desconto.valor : null,
    })

    return json({
      ok: true,
      acesso: da.acesso,
      expira_em: da.acesso ? expira : null,
      dias: da.acesso && dias > 0 ? dias : null,
      desconto: da.desconto,
      tipo_conta: tipoConta,
    })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
