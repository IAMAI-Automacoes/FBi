/**
 * O método de analista do motor (supabase/functions/_shared/raciocinio.ts).
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/raciocinio.teste.ts
 */
import { readFileSync } from 'node:fs'
import { chaveDoRaciocinio, comRaciocinio, RACIOCINIO_CLIENTE, RACIOCINIO_EQUIPE, raciocinioPara } from '../raciocinio.ts'
import { CHAVE_DA_AREA } from '../prompts-equipe.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// ── Onde o bloco entra ──────────────────────────────────────────────────────
const B = '## BLOCO'
const comChame = comRaciocinio('Prompt.\n\n## Regras\n- uma\n\nChame registrar_insight com o resultado.', B)
ok('entra antes do "Chame registrar_…" (o fecho continua sendo o pedido)', comChame.endsWith('\n\n## BLOCO\n\nChame registrar_insight com o resultado.'), comChame)
const comJson = comRaciocinio('Plano.\n\n{conhecimento}\n\nSe houver contexto suficiente, retorne SOMENTE um JSON:\n{ }\nCaso contrário, retorne o outro.', B)
ok('no plano, entra antes do "Se houver contexto suficiente"', comJson.includes('{conhecimento}\n\n## BLOCO\n\nSe houver contexto suficiente') && comJson.endsWith('retorne o outro.'), comJson)
ok('sem fecho conhecido, vai no fim', comRaciocinio('Texto livre.', B) === 'Texto livre.\n\n## BLOCO')
ok('não perde nada do prompt', comChame.replace('\n\n## BLOCO', '') === 'Prompt.\n\n## Regras\n- uma\n\nChame registrar_insight com o resultado.')

// ── Qual texto ──────────────────────────────────────────────────────────────
ok('cliente: o padrão', raciocinioPara({}, 'cliente') === RACIOCINIO_CLIENTE)
ok('equipe: o padrão da equipe', raciocinioPara({}, 'equipe') === RACIOCINIO_EQUIPE)
ok('a edição do admin vale, cada uma na sua chave', raciocinioPara({ ef_raciocinio: 'MEU' }, 'cliente') === 'MEU'
  && raciocinioPara({ ef_raciocinio_equipe: 'DA EQUIPE' }, 'equipe') === 'DA EQUIPE' && raciocinioPara({ ef_raciocinio: 'MEU' }, 'equipe') === RACIOCINIO_EQUIPE)
ok('as chaves do painel', chaveDoRaciocinio('cliente') === 'ef_raciocinio' && chaveDoRaciocinio('equipe') === 'ef_raciocinio_equipe')
const doRh = raciocinioPara({ [CHAVE_DA_AREA]: 'rh' }, 'equipe')
ok('conta RH: fala de empresa, sem a palavra restaurante', !/restaurante/i.test(doRh) && /empresa/.test(doRh), doRh.slice(0, 200))
ok('conta RH no público cliente: continua o do cliente (não existe, mas não quebra)', raciocinioPara({ [CHAVE_DA_AREA]: 'rh' }, 'cliente') === RACIOCINIO_CLIENTE)

// ── O conteúdo ensina o método ──────────────────────────────────────────────
for (const [nome, t] of [['cliente', RACIOCINIO_CLIENTE], ['equipe', RACIOCINIO_EQUIPE]] as const) {
  ok(`${nome}: manda levantar causas, dizer em que se apoia, propor ação e dizer o que falta`, /causas possiveis/.test(t) && /em que (ela )?se apoia/.test(t) && /quem faz/.test(t) && /qual (informacao|dado) faltou/.test(t))
  ok(`${nome}: diz que os exemplos são do método, não respostas prontas`, /METODO, nao respostas prontas/.test(t))
  ok(`${nome}: nunca inventar fato`, /Nunca invente fato/.test(t))
  ok(`${nome}: sem placeholder {…} (entra pronto)`, !/\{\w+\}/.test(t))
}
ok('cliente: tem o exemplo da comida fria com 50 mesas num espaço pequeno', /50 mesas/.test(RACIOCINIO_CLIENTE) && /esfria no trajeto/.test(RACIOCINIO_CLIENTE))
ok('equipe: nenhum exemplo de cliente ou de cozinha (serve para qualquer empresa)', !/comida|garcom|garçom|cardapio|cardápio|mesa|prato/i.test(RACIOCINIO_EQUIPE))
ok('equipe: nunca procurar quem falou', /nunca procurando quem falou/.test(RACIOCINIO_EQUIPE) && /adivinhar quem escreveu/.test(RACIOCINIO_EQUIPE))

// ── As três funções acrescentam o bloco ─────────────────────────────────────
const raiz = new URL('../../', import.meta.url)
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz), 'utf8')
for (const [arquivo, chave] of [
  ['gerar-insights/index.ts', 'ef_gerar_insights'],
  ['sugerir-acoes/index.ts', 'ef_sugerir_acoes'],
  ['gerar-plano-acao/index.ts', 'ef_plano_acao'],
] as const) {
  const codigo = ler(arquivo)
  ok(`${arquivo}: o prompt de ${chave} passa por comRaciocinio com o bloco do público`,
    new RegExp(`comRaciocinio\\(promptPara\\([\\w.]+, '${chave}'`).test(codigo) && /raciocinioPara\([\w.]+, publico\)\)/.test(codigo))
}
ok('o redator de insights recebe as anotações da IA', /memorias: ctx\.memorias/.test(ler('gerar-insights/index.ts').split("'ef_gerar_insights'")[1] ?? ''))

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nmétodo de analista: tudo certo')
process.exit(falhas ? 1 : 0)
