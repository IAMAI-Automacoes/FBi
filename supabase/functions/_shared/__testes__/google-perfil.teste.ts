/**
 * Testes do Google Business Profile (login OAuth + avaliações), sem internet:
 * um fetch de mentira responde no formato da documentação do Google.
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/google-perfil.teste.ts
 */
import {
  criarClienteGoogle, ErroGoogle, ESCOPO, idAvaliacaoValido, lerAvaliacao, LIMITE_RESPOSTA_BYTES, locaisDeTodasAsContas,
  motivoDoErro, notaEmNumero, textoOriginal, urlAutorizacao, URL_TOKEN, validarResposta,
} from '../google-perfil.ts'
import { responderAvaliacao } from '../google-operacoes.ts'
import { criarCallback, VALIDADE_ESTADO_MS, type DepsCallback } from '../../google-oauth-callback/handler.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// ── URL de autorização ──────────────────────────────────────────────────────
{
  const u = new URL(urlAutorizacao({ clientId: 'cli-123', redirectUri: 'https://x.supabase.co/functions/v1/google-oauth-callback', state: 'st-1' }))
  ok('autorização: endereço do Google', u.origin + u.pathname === 'https://accounts.google.com/o/oauth2/v2/auth')
  ok('autorização: code, escopo business.manage e state', u.searchParams.get('response_type') === 'code' && u.searchParams.get('scope') === ESCOPO && u.searchParams.get('state') === 'st-1')
  ok('autorização: offline + consent (garante o token de renovação)', u.searchParams.get('access_type') === 'offline' && u.searchParams.get('prompt') === 'consent')
  ok('autorização: client_id e redirect_uri', u.searchParams.get('client_id') === 'cli-123' && u.searchParams.get('redirect_uri')?.endsWith('/google-oauth-callback') === true)
}

// ── Conversões ──────────────────────────────────────────────────────────────
ok('nota em palavras vira número', notaEmNumero('ONE') === 1 && notaEmNumero('FIVE') === 5 && notaEmNumero('STAR_RATING_UNSPECIFIED') === null)
ok('texto traduzido: fica o original', textoOriginal('Great food! (Translated by Google)\n\n(Original)\nComida ótima!') === 'Comida ótima!')
ok('texto só com a marca da tradução: fica o que vem antes', textoOriginal('Comida ótima (Translated by Google) Great food') === 'Comida ótima')
ok('texto normal: igual', textoOriginal('  Ótimo atendimento ') === 'Ótimo atendimento')
ok('sem texto (só estrelas): null', textoOriginal(undefined) === null && textoOriginal('') === null)

const REVIEW = {
  name: 'accounts/1/locations/2/reviews/r1', reviewId: 'r1',
  reviewer: { displayName: 'Maria S.', profilePhotoUrl: 'https://f', isAnonymous: false },
  starRating: 'FOUR', comment: 'Comida ótima, mas demorou.',
  createTime: '2026-09-14T21:03:11.402Z', updateTime: '2026-09-14T21:03:11.402Z',
  reviewReply: { comment: 'Obrigado, Maria!', updateTime: '2026-09-15T10:00:00Z' },
}
{
  const a = lerAvaliacao(REVIEW)
  ok('avaliação lida no formato da tabela', a?.id === 'r1' && a.nota === 4 && a.comentario === 'Comida ótima, mas demorou.' && a.autor === 'Maria S.'
    && a.criada_em === '2026-09-14T21:03:11.402Z' && a.resposta === 'Obrigado, Maria!' && a.resposta_em === '2026-09-15T10:00:00Z', a)
  ok('anônima: sem autor', lerAvaliacao({ ...REVIEW, reviewer: { isAnonymous: true, displayName: 'Um usuário' } })?.autor === null)
  ok('só estrelas: comentário nulo', lerAvaliacao({ ...REVIEW, comment: undefined })?.comentario === null)
  ok('sem nota válida ou sem data: descartada', lerAvaliacao({ ...REVIEW, starRating: 'STAR_RATING_UNSPECIFIED' }) === null && lerAvaliacao({ ...REVIEW, createTime: undefined }) === null)
}

// ── Erros ───────────────────────────────────────────────────────────────────
ok('invalid_grant: precisa reconectar', motivoDoErro(400, { error: 'invalid_grant' }) === 'precisa_reconectar')
ok('cota 0 (429 RESOURCE_EXHAUSTED): acesso não liberado', motivoDoErro(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: "Quota exceeded for quota metric 'Requests' ... limit '0'" } }) === 'acesso_nao_liberado')
ok('API desativada no projeto: acesso não liberado', motivoDoErro(403, { error: { status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] } }) === 'acesso_nao_liberado')
ok('403 comum: sem permissão', motivoDoErro(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'The caller does not have permission' } }) === 'sem_permissao')

// ── Cliente com fetch de mentira ────────────────────────────────────────────
type Resp = { status?: number; corpo: unknown }
function googleFalso(rotas: Record<string, Resp | Resp[]>) {
  const chamadas: Array<{ url: string; init?: RequestInit }> = []
  const fetchFalso = (async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init })
    const u = new URL(url)
    const chave = Object.keys(rotas).find((k) => (u.origin + u.pathname).endsWith(k))
    let r: Resp = { status: 404, corpo: { error: { code: 404 } } }
    if (chave) {
      const v = rotas[chave]
      r = Array.isArray(v) ? (v.shift() ?? r) : v
    }
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 })
  }) as unknown as typeof fetch
  return { chamadas, cliente: criarClienteGoogle({ clientId: 'cli', clientSecret: 'seg', fetch: fetchFalso, maxPaginas: 5 }) }
}

{
  const g = googleFalso({ '/token': { corpo: { access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 3599, scope: ESCOPO, token_type: 'Bearer' } } })
  const t = await g.cliente.trocarCodigo('cod-1', 'https://cb')
  const corpo = new URLSearchParams(String(g.chamadas[0].init?.body))
  ok('troca do código: POST no endpoint de token com os campos certos', g.chamadas[0].url === URL_TOKEN && corpo.get('grant_type') === 'authorization_code'
    && corpo.get('code') === 'cod-1' && corpo.get('redirect_uri') === 'https://cb' && corpo.get('client_secret') === 'seg')
  ok('troca do código: tokens e escopos', t.accessToken === 'acc-1' && t.refreshToken === 'ref-1' && t.escopos.includes(ESCOPO))
}
{
  const g = googleFalso({ '/token': { status: 400, corpo: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } })
  let erro: unknown = null
  try { await g.cliente.renovar('ref-velho') } catch (e) { erro = e }
  ok('renovação com token revogado: ErroGoogle precisa_reconectar', erro instanceof ErroGoogle && erro.motivo === 'precisa_reconectar')
}
{
  const g = googleFalso({
    '/v1/accounts': { corpo: { accounts: [{ name: 'accounts/1', accountName: 'Raver' }, { name: 'accounts/2', accountName: 'Org' }] } },
    '/v1/accounts/1/locations': { corpo: { locations: [{ name: 'locations/10', title: 'Camelo', storefrontAddress: { addressLines: ['Rua A, 1'], locality: 'São Paulo' }, metadata: { placeId: 'pl-10', mapsUri: 'https://maps/10' } }] } },
    '/v1/accounts/2/locations': { corpo: { locations: [{ name: 'locations/10', title: 'Camelo' }, { name: 'locations/20', title: 'Camelo Filial' }] } },
  })
  const locais = await locaisDeTodasAsContas(g.cliente, 'acc')
  ok('locais de todas as contas, sem repetir', locais.length === 2 && locais[0].local === 'locations/10' && locais[1].titulo === 'Camelo Filial', locais)
  ok('local com endereço, placeId e link do Maps', locais[0].endereco === 'Rua A, 1, São Paulo' && locais[0].placeId === 'pl-10' && locais[0].mapsUri === 'https://maps/10')
  const reqLocais = new URL(g.chamadas.find((c) => c.url.includes('/accounts/1/locations'))!.url)
  ok('locais: readMask obrigatório enviado', reqLocais.searchParams.get('readMask') === 'name,title,storefrontAddress,metadata')
  ok('chamadas com o token de acesso', (g.chamadas[0].init?.headers as Record<string, string>)?.Authorization === 'Bearer acc')
}
{
  const pagina = (n: number, prox?: string) => ({
    corpo: {
      reviews: Array.from({ length: n }, (_, i) => ({ ...REVIEW, reviewId: `r${prox ?? 'fim'}-${i}` })),
      averageRating: 4.3, totalReviewCount: 812, ...(prox ? { nextPageToken: prox } : {}),
    },
  })
  const g = googleFalso({ '/v4/accounts/1/locations/10/reviews': [pagina(50, 'p2'), pagina(50, 'p3'), pagina(7)] })
  const r = await g.cliente.avaliacoes('acc', 'accounts/1', 'locations/10')
  ok('avaliações: lê todas as páginas', r.avaliacoes.length === 107 && !r.cortado)
  ok('avaliações: nota média e total do Google', r.notaMedia === 4.3 && r.total === 812)
  const u2 = new URL(g.chamadas[1].url)
  ok('avaliações: 50 por página, pageToken na seguinte', u2.searchParams.get('pageSize') === '50' && u2.searchParams.get('pageToken') === 'p2')
  ok('avaliações: caminho v4 accounts/{conta}/locations/{local}/reviews', new URL(g.chamadas[0].url).pathname === '/v4/accounts/1/locations/10/reviews')
}
{
  // Leitura rápida: vem da mais recente para a mais antiga (updateTime desc) e
  // para na primeira que já tinha sido lida.
  const r = (id: string, quando: string) => ({ ...REVIEW, reviewId: id, createTime: quando, updateTime: quando })
  const g = googleFalso({
    '/reviews': [
      { corpo: { reviews: [r('novo1', '2026-10-06T11:50:00Z'), r('novo2', '2026-10-06T11:40:00Z'), r('velho', '2026-10-06T09:00:00Z'), r('maisvelho', '2026-10-05T09:00:00Z')], averageRating: 4.4, totalReviewCount: 900, nextPageToken: 'p2' } },
      { corpo: { reviews: [r('nunca', '2026-01-01T00:00:00Z')] } },
    ],
  })
  const res = await g.cliente.avaliacoes('acc', 'accounts/1', 'locations/10', '2026-10-06T10:00:00Z')
  ok('leitura rápida: só as criadas/editadas depois da última leitura', JSON.stringify(res.avaliacoes.map((a) => a.id)) === '["novo1","novo2"]', res.avaliacoes.map((a) => a.id))
  ok('leitura rápida: uma chamada só (não vai para a página seguinte)', g.chamadas.length === 1)
  ok('leitura rápida: não conta como completa (não apaga nada)', res.completo === false && res.notaMedia === 4.4 && res.total === 900)
}
{
  const g = googleFalso({ '/reviews': { corpo: { reviews: [REVIEW], averageRating: 4, totalReviewCount: 1 } } })
  ok('leitura sem "desde" e até o fim: completa', (await g.cliente.avaliacoes('acc', 'accounts/1', 'locations/10')).completo === true)
}
{
  const infinita = Array.from({ length: 10 }, (_, i) => ({ corpo: { reviews: [{ ...REVIEW, reviewId: `x${i}` }], nextPageToken: `t${i}` } }))
  const g = googleFalso({ '/reviews': infinita })
  const r = await g.cliente.avaliacoes('acc', 'accounts/1', 'locations/10')
  ok('avaliações: para no teto de páginas e avisa que cortou (não é completa)', r.cortado && !r.completo && r.avaliacoes.length === 5)
}
{
  const g = googleFalso({ '/reviews': { status: 429, corpo: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded ... limit 0' } } } })
  let erro: unknown = null
  try { await g.cliente.avaliacoes('acc', 'accounts/1', 'locations/10') } catch (e) { erro = e }
  ok('cota 0 nas avaliações: ErroGoogle acesso_nao_liberado', erro instanceof ErroGoogle && erro.motivo === 'acesso_nao_liberado')
}

// ── Resposta do dono a uma avaliação ────────────────────────────────────────
ok('404: não encontrado', motivoDoErro(404, { error: { code: 404, status: 'NOT_FOUND' } }) === 'nao_encontrado')
{
  const v = validarResposta('  Obrigado pela visita, Maria!\r\nVolte sempre.  ')
  ok('resposta: tira os espaços das pontas e normaliza a quebra de linha', v.ok && v.texto === 'Obrigado pela visita, Maria!\nVolte sempre.', v)
  ok('resposta vazia ou só espaços: recusada', [undefined, null, '', '   \n '].every((t) => { const r = validarResposta(t); return !r.ok && r.motivo === 'resposta_vazia' }))
  ok('resposta no limite de bytes passa; 1 a mais, não', validarResposta('a'.repeat(LIMITE_RESPOSTA_BYTES)).ok && !validarResposta('a'.repeat(LIMITE_RESPOSTA_BYTES + 1)).ok)
  const acentos = validarResposta('é'.repeat(LIMITE_RESPOSTA_BYTES / 2 + 1))
  ok('acento conta 2 bytes (o limite do Google é em bytes)', !acentos.ok && acentos.motivo === 'resposta_longa')
  ok('id da avaliação: só letras, números, - e _', idAvaliacaoValido('AbC-12_x') && !idAvaliacaoValido('a/b') && !idAvaliacaoValido('../x') && !idAvaliacaoValido('') && !idAvaliacaoValido(12))
}
{
  const g = googleFalso({ '/v4/accounts/1/locations/10/reviews/r1/reply': { corpo: { comment: 'Valeu, Maria!', updateTime: '2026-10-16T12:00:00Z' } } })
  const r = await g.cliente.responder('acc', 'accounts/1', 'locations/10', 'r1', 'Valeu, Maria!')
  const ch = g.chamadas[0]
  ok('responder: PUT no …/reviews/{id}/reply com o texto em JSON', ch.init?.method === 'PUT' && new URL(ch.url).pathname === '/v4/accounts/1/locations/10/reviews/r1/reply'
    && JSON.parse(String(ch.init?.body)).comment === 'Valeu, Maria!' && (ch.init?.headers as Record<string, string>)['Content-Type'] === 'application/json', ch)
  ok('responder: devolve como o Google gravou', r.comentario === 'Valeu, Maria!' && r.atualizadaEm === '2026-10-16T12:00:00Z')
}
{
  const g = googleFalso({ '/reviews/r1/reply': { corpo: {} } })
  await g.cliente.apagarResposta('acc', 'accounts/1', 'locations/10', 'r1')
  ok('apagar resposta: DELETE no mesmo endereço', g.chamadas[0].init?.method === 'DELETE' && g.chamadas[0].url.endsWith('/reviews/r1/reply'))
  const sem = googleFalso({ '/reviews/r1/reply': { status: 404, corpo: { error: { code: 404 } } } })
  let erro: unknown = 'nenhum'
  try { await sem.cliente.apagarResposta('acc', 'accounts/1', 'locations/10', 'r1') } catch (e) { erro = e }
  ok('apagar resposta que já não existia (404): está feito', erro === 'nenhum')
  const proibido = googleFalso({ '/reviews/r1/reply': { status: 403, corpo: { error: { code: 403, status: 'PERMISSION_DENIED' } } } })
  try { await proibido.cliente.apagarResposta('acc', 'accounts/1', 'locations/10', 'r1') } catch (e) { erro = e }
  ok('apagar resposta sem permissão: erro', erro instanceof ErroGoogle && erro.motivo === 'sem_permissao')
}
{
  // Banco de mentira: só o que responderAvaliacao usa.
  function dbFalso(estado: { conexao: Record<string, unknown> | null; avaliacoes: Record<string, Record<string, unknown>>; token: string | null }) {
    const gravado: Array<{ tabela: string; campos: Record<string, unknown>; filtros: Record<string, unknown> }> = []
    const db = {
      rpc: async (fn: string) => ({ data: fn === 'google_ler_token' ? estado.token : null, error: null }),
      from(tabela: string) {
        const filtros: Record<string, unknown> = {}
        let campos: Record<string, unknown> | null = null
        // deno-lint-ignore no-explicit-any
        const q: any = {
          select: () => q,
          update: (c: Record<string, unknown>) => { campos = c; return q },
          eq: (col: string, v: unknown) => { filtros[col] = v; return q },
          maybeSingle: async () => ({
            data: tabela === 'google_conexoes' ? estado.conexao : (estado.avaliacoes[String(filtros.id)] ?? null),
          }),
          // `await` de um update
          then: (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) => {
            if (campos) gravado.push({ tabela, campos, filtros: { ...filtros } })
            return Promise.resolve({ error: null }).then(ok, falha)
          },
        }
        return q
      },
    }
    return { db, gravado }
  }
  const conectado = { status: 'conectado', conta: 'accounts/1', local: 'locations/10' }
  const token = { '/token': { corpo: { access_token: 'acc-2' } } }

  let b = dbFalso({ conexao: null, avaliacoes: {}, token: 'ref' })
  ok('responder sem conexão: recusa', (await responderAvaliacao(b.db, googleFalso(token).cliente, 29, 'r1', 'Oi')).ok === false)

  b = dbFalso({ conexao: conectado, avaliacoes: {}, token: 'ref' })
  let g = googleFalso(token)
  const fora = await responderAvaliacao(b.db, g.cliente, 29, 'r-de-outro', 'Oi')
  ok('avaliação que não está na cópia deste restaurante: recusa sem falar com o Google', !fora.ok && fora.motivo === 'avaliacao_nao_encontrada' && g.chamadas.length === 0)

  b = dbFalso({ conexao: conectado, avaliacoes: { r1: { id: 'r1' } }, token: 'ref' })
  g = googleFalso({ ...token, '/reviews/r1/reply': { corpo: { comment: 'Valeu!', updateTime: '2026-10-16T12:00:00Z' } } })
  const pub = await responderAvaliacao(b.db, g.cliente, 29, 'r1', 'Valeu!')
  ok('publica no Google e acerta a cópia daqui na hora', pub.ok && pub.resposta === 'Valeu!' && pub.resposta_em === '2026-10-16T12:00:00Z'
    && b.gravado.some((x) => x.tabela === 'google_avaliacoes' && x.campos.resposta === 'Valeu!' && x.filtros.restaurante_id === 29 && x.filtros.id === 'r1'), { pub, gravado: b.gravado })

  b = dbFalso({ conexao: conectado, avaliacoes: { r1: { id: 'r1' } }, token: 'ref' })
  g = googleFalso({ ...token, '/reviews/r1/reply': { corpo: {} } })
  const apagou = await responderAvaliacao(b.db, g.cliente, 29, 'r1', null)
  ok('apagar: tira a resposta da cópia também', apagou.ok && apagou.resposta === null
    && b.gravado.some((x) => x.tabela === 'google_avaliacoes' && x.campos.resposta === null) && g.chamadas.some((c) => c.init?.method === 'DELETE'))

  b = dbFalso({ conexao: conectado, avaliacoes: { r1: { id: 'r1' } }, token: 'ref' })
  g = googleFalso({ '/token': { status: 400, corpo: { error: 'invalid_grant' } } })
  const caiu = await responderAvaliacao(b.db, g.cliente, 29, 'r1', 'Oi')
  ok('conexão desfeita no Google: avisa e marca para reconectar', !caiu.ok && caiu.motivo === 'precisa_reconectar'
    && b.gravado.some((x) => x.tabela === 'google_conexoes' && x.campos.status === 'precisa_reconectar'))

  b = dbFalso({ conexao: conectado, avaliacoes: { r1: { id: 'r1' } }, token: 'ref' })
  g = googleFalso({ ...token, '/reviews/r1/reply': { status: 404, corpo: { error: { code: 404 } } } })
  const sumiu = await responderAvaliacao(b.db, g.cliente, 29, 'r1', 'Oi')
  ok('avaliação apagada no Google: avisa', !sumiu.ok && sumiu.motivo === 'avaliacao_nao_encontrada')
}

// ── Volta do Google (callback) ──────────────────────────────────────────────
const AGORA = Date.UTC(2026, 9, 6, 12, 0, 0)
function cenario(over: Partial<DepsCallback> & { tokens?: any; locais?: any[]; estado?: { restauranteId: number; criadoEm: string } | null; erroLocais?: unknown } = {}) {
  const feito: string[] = []
  const deps: DepsCallback = {
    google: {
      trocarCodigo: async () => over.tokens ?? { accessToken: 'acc', refreshToken: 'ref', escopos: [ESCOPO] },
      revogar: async () => { feito.push('revogou') },
      contas: async () => { if (over.erroLocais) throw over.erroLocais; return [{ name: 'accounts/1', nome: 'R' }] },
      locais: async () => (over.locais ?? [{ conta: 'accounts/1', local: 'locations/10', titulo: 'Camelo', endereco: null, placeId: null, mapsUri: null }]) as any,
    },
    redirectUri: 'https://cb',
    site: 'https://site',
    consumirEstado: async () => (over.estado === undefined ? { restauranteId: 7, criadoEm: new Date(AGORA - 60_000).toISOString() } : over.estado),
    guardarToken: async (id, t) => { feito.push(`token:${id}:${t}`) },
    aplicarLocais: async (_id, locais) => { feito.push(`locais:${locais.length}`); return locais.length === 1 ? 'conectado' : locais.length ? 'escolher_local' : 'sem_local' },
    marcarAguardandoGoogle: async () => { feito.push('aguardando') },
    sincronizar: async () => { feito.push('sincronizou') },
    agora: () => AGORA,
    ...over,
  }
  return { feito, cb: criarCallback(deps) }
}
const volta = (q: string) => new Request(`https://x.supabase.co/functions/v1/google-oauth-callback?${q}`)
const destino = (r: Response) => new URL(r.headers.get('location') ?? 'https://vazio/')

{
  const c = cenario()
  const r = await c.cb(volta('code=c1&state=s1&scope=' + encodeURIComponent(ESCOPO)))
  ok('callback: um local → conecta, guarda token e sincroniza', r.status === 302 && destino(r).pathname === '/google' && destino(r).searchParams.get('conectado') === '1'
    && c.feito.join() === 'token:7:ref,locais:1,sincronizou', c.feito)
}
{
  const c = cenario({ locais: [{ local: 'locations/1' }, { local: 'locations/2' }] })
  const r = await c.cb(volta('code=c1&state=s1'))
  ok('callback: vários locais → escolher', destino(r).searchParams.get('escolher') === '1' && !c.feito.includes('sincronizou'))
}
{
  const c = cenario({ locais: [] })
  ok('callback: nenhum local → avisa', destino(await c.cb(volta('code=c1&state=s1'))).searchParams.get('erro') === 'sem_local')
}
{
  const c = cenario()
  const r = await c.cb(volta('error=access_denied&state=s1'))
  ok('callback: dono recusou → erro negado, nada guardado', destino(r).searchParams.get('erro') === 'negado' && c.feito.length === 0)
}
{
  const c = cenario({ estado: null })
  const r = await c.cb(volta('code=c1&state=forjado'))
  ok('callback: state desconhecido → recusa sem trocar o código', destino(r).searchParams.get('erro') === 'estado' && c.feito.length === 0)
}
{
  const c = cenario({ estado: { restauranteId: 7, criadoEm: new Date(AGORA - VALIDADE_ESTADO_MS - 1000).toISOString() } })
  ok('callback: state vencido (mais de 10 min) → recusa', destino(await c.cb(volta('code=c1&state=s1'))).searchParams.get('erro') === 'estado' && c.feito.length === 0)
}
{
  const c = cenario()
  ok('callback: sem state → recusa', destino(await c.cb(volta('code=c1'))).searchParams.get('erro') === 'estado')
}
{
  const c = cenario({ tokens: { accessToken: 'acc', refreshToken: 'ref', escopos: ['openid'] } })
  const r = await c.cb(volta('code=c1&state=s1'))
  ok('callback: dono desmarcou a permissão → revoga e avisa', destino(r).searchParams.get('erro') === 'permissao' && c.feito.join() === 'revogou')
}
{
  const c = cenario({ tokens: { accessToken: 'acc', refreshToken: null, escopos: [ESCOPO] } })
  ok('callback: sem token de renovação → avisa', destino(await c.cb(volta('code=c1&state=s1'))).searchParams.get('erro') === 'sem_token')
}
{
  const c = cenario({ erroLocais: new ErroGoogle(429, 'acesso_nao_liberado', 'cota 0') })
  const r = await c.cb(volta('code=c1&state=s1'))
  ok('callback: API ainda não liberada → token guardado, conexão aguardando', destino(r).searchParams.get('erro') === 'acesso_nao_liberado' && c.feito.join() === 'token:7:ref,aguardando')
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas > 0) process.exit(1)
