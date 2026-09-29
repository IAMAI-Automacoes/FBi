/**
 * get-prices — preços atuais do EasyFeed, lidos do Stripe por lookup_key.
 *
 * Pública (sem JWT): é a landing quem chama. Devolve só o que a tela precisa
 * (ciclo, total, equivalente mensal, desconto). Não devolve price ID: o client
 * nunca envia price nenhum de volta — o checkout resolve o price no servidor
 * pelo ciclo.
 *
 * Por que consultar o Stripe em vez de sincronizar numa tabela via webhook
 * (price.created/updated, product.updated):
 *   - uma fonte só. Tabela sincronizada é uma segunda verdade que pode ficar
 *     defasada (webhook perdido, deploy no meio) e ninguém percebe até um
 *     cliente pagar um valor e ver outro na landing;
 *   - a chamada é barata e cacheada: por instância (memória, 5 min) e por
 *     CDN/navegador (`Cache-Control`). Uma landing com tráfego alto faz
 *     uma chamada ao Stripe a cada 5 min por instância, não por visita;
 *   - trocar o preço é "criar Price novo + mover lookup_key" e a landing
 *     acompanha em até 5 min sem deploy e sem tabela.
 * O caminho de tabela faria sentido com dezenas de produtos/moedas ou
 * necessidade de consultar preço dentro de SQL. Não é o caso.
 *
 * Deploy: `supabase functions deploy get-prices --no-verify-jwt`
 */
import { corsHeaders, json, preflight } from '../_shared/cors.ts'
import { stripe, LOOKUP_KEYS, CICLOS } from '../_shared/stripe/cliente.ts'
import { montarPrecosPublicos, type PrecoPublico } from '../_shared/stripe/mapeamento.ts'

const TTL_MS = 5 * 60 * 1000

interface Cache {
  expiraEm: number
  corpo: { precos: PrecoPublico[]; atualizado_em: string }
}
let cache: Cache | null = null

async function buscarNoStripe(): Promise<Cache['corpo']> {
  const lista = await stripe().prices.list({
    lookup_keys: CICLOS.map((c) => LOOKUP_KEYS[c]),
    active: true,
    limit: 10,
  })
  const precos = montarPrecosPublicos(
    lista.data.map((p) => ({
      id: p.id,
      lookup_key: p.lookup_key,
      unit_amount: p.unit_amount,
      currency: p.currency,
      active: p.active,
      recurring: p.recurring,
      metadata: p.metadata,
    })),
  )
  return { precos, atualizado_em: new Date().toISOString() }
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const agora = Date.now()
    if (!cache || cache.expiraEm < agora) {
      cache = { expiraEm: agora + TTL_MS, corpo: await buscarNoStripe() }
    }
    return new Response(JSON.stringify(cache.corpo), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        // Navegador e CDN seguram 5 min; `stale-while-revalidate` evita a
        // landing ficar em branco na virada do cache.
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (e) {
    // Sem detalhe do Stripe para o público: pode citar IDs internos.
    console.error('[get-prices]', (e as Error).message)
    // Se há cache velho, é melhor servir preço de 5 min atrás do que erro.
    if (cache) return json(cache.corpo, 200)
    return json({ error: 'Não foi possível carregar os preços agora.' }, 503)
  }
})
