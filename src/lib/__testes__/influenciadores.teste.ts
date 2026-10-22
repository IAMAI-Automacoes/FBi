/**
 * Testes de Admin → Influenciadores e da área /influencers (src/lib/influenciadores.ts).
 *   node --experimental-strip-types src/lib/__testes__/influenciadores.teste.ts
 */
import {
  exemploDaComissao, faixaDosSeguidores, FAIXAS, formatarSeguidores, lerArroba, lerSeguidores, problemaDoCadastro, redeDoVideo,
  situacaoDoInfluenciador, textoDaComissao, urlDoVideo, videosNaJanela, type CadastroDoInfluenciador, type NumerosDoInfluenciador,
} from '../influenciadores.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const AGORA = new Date('2026-10-21T15:00:00Z')
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 24 * 60 * 60 * 1000).toISOString()
const base: NumerosDoInfluenciador = { entrouEm: diasAtras(40), acessos30: 0, visitas30: 0, videos: [], videosPorMes: 2 }
const sit = (n: Partial<NumerosDoInfluenciador>) => situacaoDoInfluenciador({ ...base, ...n }, AGORA)

// ── Vídeos na janela ─────────────────────────────────────────────────────────
ok('vídeo recusado não conta, pendente conta, velho não conta', videosNaJanela([
  { situacao: 'aprovado', criado_em: diasAtras(3) },
  { situacao: 'pendente', criado_em: diasAtras(10) },
  { situacao: 'recusado', criado_em: diasAtras(5) },
  { situacao: 'aprovado', criado_em: diasAtras(31) },
], AGORA) === 2)

// ── A situação ───────────────────────────────────────────────────────────────
ok('nunca entrou', sit({ entrouEm: null, acessos30: 5 }) === 'nao_entrou')
ok('postou o combinado: divulgando', sit({ videos: [{ situacao: 'aprovado', criado_em: diasAtras(2) }, { situacao: 'pendente', criado_em: diasAtras(9) }] }) === 'divulgando')
ok('entra todo dia e não posta nem divulga: só usa os dados', sit({ acessos30: 12 }) === 'so_usa_dados')
ok('postou 1 de 2: abaixo do combinado', sit({ acessos30: 8, videos: [{ situacao: 'aprovado', criado_em: diasAtras(2) }] }) === 'abaixo')
ok('sem vídeo, mas o link teve visitas: abaixo do combinado', sit({ acessos30: 8, visitas30: 30 }) === 'abaixo')
ok('vídeo recusado não tira do "só usa os dados"', sit({ acessos30: 8, videos: [{ situacao: 'recusado', criado_em: diasAtras(2) }] }) === 'so_usa_dados')
ok('nada em 30 dias: parado', sit({}) === 'parado')
ok('entrou há 3 dias e ainda não postou: começando', sit({ entrouEm: diasAtras(3), acessos30: 3 }) === 'comecando')
ok('entrou há 3 dias e já postou o combinado: divulgando', sit({ entrouEm: diasAtras(3), videos: [{ situacao: 'pendente', criado_em: diasAtras(1) }, { situacao: 'pendente', criado_em: diasAtras(1) }] }) === 'divulgando')
ok('sem meta: qualquer vídeo ou visita é divulgando', sit({ videosPorMes: 0, visitas30: 1 }) === 'divulgando' && sit({ videosPorMes: 0, acessos30: 4 }) === 'so_usa_dados')

// ── Seguidores e faixas ──────────────────────────────────────────────────────
ok('lê seguidores do jeito que se fala', [
  ['25000', 25000], ['25.000', 25000], ['25 mil', 25000], ['12,5k', 12500], ['1,2 mi', 1200000], ['2 milhões', 2000000], ['', null],
].every(([t, n]) => lerSeguidores(t as string) === n), ['25000', '25.000', '25 mil', '12,5k', '1,2 mi', '2 milhões'].map(lerSeguidores))
ok('seguidores ilegíveis = NaN', Number.isNaN(lerSeguidores('muitos')) && Number.isNaN(lerSeguidores('-5')))
ok('formata seguidores', formatarSeguidores(980) === '980' && formatarSeguidores(12500) === '12,5 mil' && formatarSeguidores(1_200_000) === '1,2 mi' && formatarSeguidores(25_000) === '25 mil')
ok('faixa pelo tamanho', faixaDosSeguidores(8000) === 0 && faixaDosSeguidores(10_000) === 0 && faixaDosSeguidores(50_000) === 1 && faixaDosSeguidores(300_000) === 2 && faixaDosSeguidores(null) === null)
ok('as faixas sobem a % com o tamanho', FAIXAS.every((f, i) => i === 0 || f.pct > FAIXAS[i - 1].pct))

// ── @ e links ────────────────────────────────────────────────────────────────
ok('@ do perfil', lerArroba('@ana.come') === 'ana.come' && lerArroba('https://www.instagram.com/ana.come/') === 'ana.come' && lerArroba('tiktok.com/@ana_come') === 'ana_come' && lerArroba('  ') === '')
ok('link de vídeo com e sem https', urlDoVideo('instagram.com/reel/abc') === 'https://instagram.com/reel/abc' && urlDoVideo('https://vm.tiktok.com/x1/') === 'https://vm.tiktok.com/x1/')
ok('não é link', [urlDoVideo('olha meu video'), urlDoVideo(''), urlDoVideo('abc'), urlDoVideo('ftp://x.com/a')].every((u) => u === null))
ok('rede do vídeo', redeDoVideo('https://www.instagram.com/reel/a') === 'Instagram' && redeDoVideo('https://vm.tiktok.com/x') === 'TikTok' && redeDoVideo('https://youtu.be/x') === 'YouTube' && redeDoVideo('https://exemplo.com/v') === null)

// ── A comissão ───────────────────────────────────────────────────────────────
ok('texto da comissão', textoDaComissao(15, 12) === '15% de cada mensalidade, da 2ª em diante, por 12 meses' && textoDaComissao(12.5, 1) === '12,5% de cada mensalidade, da 2ª em diante, por 1 mês')
const ex = exemploDaComissao(15, 12, 19700)
ok('exemplo: 15% de R$ 197 por 12 meses = R$ 29,55 × 12', ex.porMes === 2955 && ex.total === 35460, ex)

const bom: CadastroDoInfluenciador = { email: 'ana@exemplo.com', nome: 'Ana', arroba: 'ana', seguidores: 25000, comissaoPct: 15, comissaoMeses: 12, videosPorMes: 2 }
ok('cadastro bom passa', problemaDoCadastro(bom, true) === null)
ok('cadastro com problema não passa', [
  { ...bom, email: 'ana' }, { ...bom, comissaoPct: 101 }, { ...bom, comissaoMeses: 0 }, { ...bom, comissaoMeses: 1.5 },
  { ...bom, videosPorMes: -1 }, { ...bom, seguidores: Number.NaN }, { ...bom, comissaoPct: Number.NaN },
].every((c) => problemaDoCadastro(c, true) !== null))
ok('na edição o e-mail não é conferido (não muda)', problemaDoCadastro({ ...bom, email: '' }, false) === null)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas > 0) process.exit(1)
