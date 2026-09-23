// Entrada da demonstração por código.
//
// Quem chama é a página /demo/login, de um navegador SEM login: o único dado é
// o código de 6 dígitos que aparece no perfil do vendedor. A conferência — o
// cálculo do código, o limite de tentativas e o "vale uma vez só" — mora no
// banco, em `validar_codigo_demo`. Aqui um código aceito vira um link mágico da
// conta do vendedor, gerado pela API de admin, que NÃO manda email. O navegador
// troca o link por uma sessão (`verifyOtp`) e a registra.
import { clienteAdmin } from '../_shared/auth.ts'

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

// Quem lê é o dono do restaurante, não o vendedor: frases para ele.
const RECUSAS: Record<string, [number, string]> = {
  invalido: [401, 'Código incorreto ou vencido. Confira o código que está aparecendo agora.'],
  usado: [409, 'Este código já foi usado. Espere o próximo aparecer e digite de novo.'],
  bloqueado: [429, 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.'],
  sem_conta: [409, 'A conta de quem está apresentando não está disponível.'],
  conta_incompleta: [409, 'Quem está apresentando precisa terminar a configuração inicial da conta antes.'],
}

function ipDe(req: Request): string {
  const encaminhado = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return encaminhado || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'desconhecido'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const corpo = await req.json().catch(() => ({}))
    const codigo = String(corpo?.codigo ?? '').replace(/\D/g, '')
    const db = clienteAdmin()

    const { data, error } = await db.rpc('validar_codigo_demo', { p_codigo: codigo, p_ip: ipDe(req) })
    if (error) {
      console.error('[entrar-demo] validar_codigo_demo:', error)
      return json({ error: 'Não foi possível conferir o código agora. Tente de novo.' }, 500)
    }

    const linha = Array.isArray(data) ? data[0] : data
    if (!linha || linha.resultado !== 'ok') {
      const [status, mensagem] = RECUSAS[linha?.resultado] ?? RECUSAS.invalido
      return json({ error: mensagem, motivo: linha?.resultado ?? 'invalido' }, status)
    }

    const { data: link, error: erroLink } = await db.auth.admin.generateLink({
      type: 'magiclink',
      email: linha.email,
    })
    const tokenHash = link?.properties?.hashed_token
    if (erroLink || !tokenHash) {
      console.error('[entrar-demo] generateLink:', erroLink)
      return json({ error: 'Não foi possível abrir a demonstração. Digite o próximo código.' }, 500)
    }

    return json({
      token_hash: tokenHash,
      sessao_demo_id: linha.sessao_demo_id,
      duracao_minutos: linha.duracao_minutos,
    })
  } catch (err) {
    console.error('[entrar-demo]', err)
    return json({ error: 'Não foi possível abrir a demonstração agora.' }, 500)
  }
})
