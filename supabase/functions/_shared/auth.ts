/**
 * Autenticação das edge functions: JWT do usuário → restaurante.
 *
 * Segue o molde que já era usado em cancelar-assinatura; existe para que
 * funções que chamam a IA parem de aceitar qualquer requisição anônima.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

export function clienteAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )
}

export interface RestauranteAutenticado {
  id: number
  auth_user_id: string
  assinatura_status: string
  // deno-lint-ignore no-explicit-any
  linha: any
}

export type ResultadoAuth =
  | { ok: true; restaurante: RestauranteAutenticado }
  | { ok: false; status: number; erro: string }

/**
 * Valida o Authorization e devolve o restaurante do usuário.
 *
 * `colunas` permite pedir de uma vez os campos que a função vai usar, evitando
 * uma segunda consulta ao mesmo registro.
 */
export async function autenticarRestaurante(
  req: Request,
  // deno-lint-ignore no-explicit-any
  admin: any,
  colunas = 'id, auth_user_id, assinatura_status',
): Promise<ResultadoAuth> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { ok: false, status: 401, erro: 'Autenticação obrigatória' }

  const jwt = authHeader.replace('Bearer ', '')
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData?.user) return { ok: false, status: 401, erro: 'Sessão inválida' }

  const { data: rest, error: restErr } = await admin
    .from('restaurantes')
    .select(colunas)
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()

  if (restErr || !rest?.id) return { ok: false, status: 403, erro: 'Restaurante não encontrado' }

  return {
    ok: true,
    restaurante: {
      id: Number(rest.id),
      auth_user_id: userData.user.id,
      assinatura_status: rest.assinatura_status,
      linha: rest,
    },
  }
}
