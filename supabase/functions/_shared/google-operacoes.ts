// Operações do Google Business Profile que mexem no banco: configuração,
// aplicar o local escolhido e sincronizar as avaliações de um restaurante.
//
// As avaliações vão para `google_avaliacoes`, uma CÓPIA TEMPORÁRIA (política
// da API: até 30 dias, sem agregar). Cada sincronização renova a cópia; o que
// some do Google sai daqui na hora, e o que ficar 30 dias sem renovar o cron
// apaga. As médias do gráfico são calculadas na consulta (google_medias_mensais).

import { criarClienteGoogle, ErroGoogle, type ClienteGoogle, type LocalGoogle } from './google-perfil.ts'

// deno-lint-ignore no-explicit-any
type Db = any

export interface ConfigGoogle { clientId: string; clientSecret: string; redirectUri: string }

/** Credenciais do cliente OAuth (segredos do Supabase). Sem elas: null. */
export function configGoogle(): ConfigGoogle | null {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')?.trim()
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')?.trim()
  const base = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/+$/, '')
  if (!clientId || !clientSecret || !base) return null
  return { clientId, clientSecret, redirectUri: `${base}/functions/v1/google-oauth-callback` }
}

export function clienteGoogle(cfg: ConfigGoogle): ClienteGoogle {
  return criarClienteGoogle({ clientId: cfg.clientId, clientSecret: cfg.clientSecret })
}

export async function lerToken(db: Db, restauranteId: number): Promise<string | null> {
  const { data, error } = await db.rpc('google_ler_token', { p_restaurante_id: restauranteId })
  if (error) throw error
  return typeof data === 'string' && data ? data : null
}

export async function guardarToken(db: Db, restauranteId: number, refreshToken: string): Promise<void> {
  const { error } = await db.rpc('google_guardar_token', { p_restaurante_id: restauranteId, p_token: refreshToken })
  if (error) throw error
}

async function atualizarConexao(db: Db, restauranteId: number, campos: Record<string, unknown>) {
  const { error } = await db
    .from('google_conexoes')
    .update({ ...campos, atualizado_em: new Date().toISOString() })
    .eq('restaurante_id', restauranteId)
  if (error) throw error
}

const camposDoLocal = (l: LocalGoogle) => ({
  conta: l.conta,
  local: l.local,
  local_nome: l.titulo,
  endereco: l.endereco,
  place_id: l.placeId,
  maps_uri: l.mapsUri,
})

/**
 * Um local só: conecta. Vários: o dono escolhe na tela. Nenhum: avisa.
 * A linha de google_conexoes já existe (nasce ao guardar o token).
 */
export async function aplicarLocais(
  db: Db,
  restauranteId: number,
  locais: LocalGoogle[],
): Promise<'conectado' | 'escolher_local' | 'sem_local'> {
  if (locais.length === 1) {
    await atualizarConexao(db, restauranteId, { ...camposDoLocal(locais[0]), status: 'conectado', locais_disponiveis: null, erro: null })
    return 'conectado'
  }
  if (locais.length === 0) {
    await atualizarConexao(db, restauranteId, { status: 'sem_local', locais_disponiveis: null, erro: null })
    return 'sem_local'
  }
  await atualizarConexao(db, restauranteId, { status: 'escolher_local', locais_disponiveis: locais, erro: null })
  return 'escolher_local'
}

/** O dono escolheu um dos locais da lista. */
export async function escolherLocal(db: Db, restauranteId: number, local: string): Promise<boolean> {
  const { data } = await db.from('google_conexoes').select('locais_disponiveis').eq('restaurante_id', restauranteId).maybeSingle()
  const lista = (Array.isArray(data?.locais_disponiveis) ? data.locais_disponiveis : []) as LocalGoogle[]
  const escolhido = lista.find((l) => l.local === local)
  if (!escolhido) return false
  await atualizarConexao(db, restauranteId, { ...camposDoLocal(escolhido), status: 'conectado', locais_disponiveis: null, erro: null })
  return true
}

/** Antes de o Google liberar a API: o token fica guardado e a conexão espera. */
export async function marcarAguardandoGoogle(db: Db, restauranteId: number): Promise<void> {
  await atualizarConexao(db, restauranteId, { status: 'aguardando_google', erro: 'acesso_nao_liberado' })
}

export type ResultadoSincronizacao =
  | { ok: true; quantidade: number }
  | { ok: false; motivo: string }

/** Busca todas as avaliações do local no Google e renova a cópia temporária. */
export async function sincronizarRestaurante(db: Db, google: ClienteGoogle, restauranteId: number): Promise<ResultadoSincronizacao> {
  const { data: c } = await db
    .from('google_conexoes')
    .select('status, conta, local')
    .eq('restaurante_id', restauranteId)
    .maybeSingle()
  if (!c || c.status !== 'conectado' || !c.conta || !c.local) return { ok: false, motivo: 'nao_conectado' }

  const inicio = new Date().toISOString()
  await atualizarConexao(db, restauranteId, { ultima_tentativa: inicio })
  try {
    const refresh = await lerToken(db, restauranteId)
    if (!refresh) throw new ErroGoogle(401, 'precisa_reconectar', 'Sem token guardado.')
    const accessToken = await google.renovar(refresh)
    const r = await google.avaliacoes(accessToken, c.conta, c.local)

    // Grava em lotes; `buscada_em` = agora renova a cópia.
    const linhas = r.avaliacoes.map((a) => ({ ...a, restaurante_id: restauranteId, buscada_em: inicio }))
    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await db.from('google_avaliacoes').upsert(linhas.slice(i, i + 500), { onConflict: 'restaurante_id,id' })
      if (error) throw error
    }
    // Leu tudo: o que não veio desta vez foi apagado no Google — sai daqui também.
    if (!r.cortado) {
      const { error } = await db.from('google_avaliacoes').delete().eq('restaurante_id', restauranteId).lt('buscada_em', inicio)
      if (error) throw error
    }
    await atualizarConexao(db, restauranteId, {
      nota_media: r.notaMedia,
      total_avaliacoes: r.total,
      ultima_sincronizacao: new Date().toISOString(),
      erro: null,
    })
    return { ok: true, quantidade: linhas.length }
  } catch (e) {
    const motivo = e instanceof ErroGoogle ? e.motivo : 'outro'
    await atualizarConexao(db, restauranteId, {
      erro: motivo,
      ...(motivo === 'precisa_reconectar' ? { status: 'precisa_reconectar' } : {}),
    }).catch(() => {})
    if (!(e instanceof ErroGoogle)) console.error('google: falha ao sincronizar', restauranteId, e)
    return { ok: false, motivo }
  }
}
