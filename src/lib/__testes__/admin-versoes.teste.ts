/**
 * Testes do painel do admin nas duas versões (src/lib/admin-versoes.ts).
 *   node --experimental-strip-types src/lib/__testes__/admin-versoes.teste.ts
 */
import {
  abaDaVersao, abasDaVersao, agenteNaVersao, alcanceDoAgente, blocosDaVersao, daVersao, EXPLICACAO_DO_PROMPT_DO_RH,
  ROTULO_DO_ALCANCE, TODAS_AS_ABAS, versaoDaConta,
} from '../admin-versoes.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// ── Abas ─────────────────────────────────────────────────────────────────────
ok('o restaurante continua com todas as abas, na mesma ordem', abasDaVersao('restaurante').join() === TODAS_AS_ABAS.join())
const doRh = abasDaVersao('rh')
ok('o RH não tem vendedores, influenciadores nem motor de resposta', !['vendedores', 'influenciadores', 'motor'].some((a) => doRh.includes(a as never)), doRh)
ok('o RH mantém o que controla as duas versões', ['pagamentos', 'cupons', 'afiliados', 'videos', 'agentes', 'conhecimento'].every((a) => doRh.includes(a as never)), doRh)
ok('o RH mantém o que é de cada conta', ['suporte', 'whatsapp', 'contas', 'uso_ia'].every((a) => doRh.includes(a as never)), doRh)
ok('o RH segue a ordem do menu', doRh.join() === TODAS_AS_ABAS.filter((a) => doRh.includes(a)).join())
ok('aba pedida que existe na versão abre', abaDaVersao('contas', 'rh') === 'contas' && abaDaVersao('motor', 'restaurante') === 'motor')
ok('aba que não existe na versão cai na padrão', abaDaVersao('motor', 'rh') === 'suporte' && abaDaVersao('vendedores', 'rh', 'contas') === 'contas')
ok('lixo no endereço cai na padrão', [null, undefined, '', 'xyz', 3, {}].every((v) => abaDaVersao(v, 'restaurante') === 'suporte'))

// ── Contas por versão ────────────────────────────────────────────────────────
ok('conta sem versão conta como restaurante', versaoDaConta(null) === 'restaurante' && versaoDaConta('') === 'restaurante' && versaoDaConta('rh') === 'rh')
const contas = [{ id: 1, area: 'restaurante' }, { id: 2, area: 'rh' }, { id: 3, area: null }, { id: 4, area: 'rh' }]
ok('só as contas do RH', daVersao(contas, 'rh', (c) => c.area).map((c) => c.id).join() === '2,4')
ok('só as contas do restaurante (inclusive as sem versão)', daVersao(contas, 'restaurante', (c) => c.area).map((c) => c.id).join() === '1,3')

// ── Agentes ──────────────────────────────────────────────────────────────────
ok('banner e perguntas aos clientes são só do restaurante', alcanceDoAgente('banner') === 'restaurante' && alcanceDoAgente('perguntas_direcionadas') === 'restaurante')
ok('o aviso para a equipe é só do RH', alcanceDoAgente('aviso_equipe') === 'rh')
ok('o resto vale para as duas', ['assistente', 'classificador_feedback', 'gerador_insights', 'relatorio_estruturado', 'resumo_executivo'].every((id) => alcanceDoAgente(id) === 'as_duas'))
ok('agente some da versão que não é dele', !agenteNaVersao('banner', 'rh') && !agenteNaVersao('aviso_equipe', 'restaurante') && agenteNaVersao('assistente', 'rh'))
ok('todo alcance tem rótulo', Object.values(ROTULO_DO_ALCANCE).every((t) => t.length > 0))

const blocos = [
  { chave: 'sobre_sistema', titulo: 'Sobre o sistema', explicacao: 'a' },
  { chave: 'sobre_equipe', titulo: 'Sobre a equipe', explicacao: 'b' },
  { chave: 'sobre_versao_rh', titulo: 'Sobre a versão RH', explicacao: 'c' },
  { chave: 'ef_gerar_insights', titulo: 'Prompt', explicacao: 'd' },
  { chave: 'ef_gerar_insights_equipe', titulo: 'Prompt da EQUIPE', explicacao: 'e' },
  { titulo: 'Sem chave', explicacao: 'f' },
]
const noRest = blocosDaVersao(blocos, 'restaurante')
ok('restaurante: sem os prompts da equipe', noRest.map((b) => b.chave ?? '-').join() === 'sobre_sistema,ef_gerar_insights,-', noRest)
ok('restaurante: o prompt de cliente com irmão da equipe é só dele', noRest.find((b) => b.chave === 'ef_gerar_insights')?.alcance === 'restaurante')
ok('restaurante: o que não tem irmão vale para as duas', noRest.find((b) => b.chave === 'sobre_sistema')?.alcance === 'as_duas' && noRest[2].alcance === 'as_duas')
const noRh = blocosDaVersao(blocos, 'rh')
ok('RH: sem o prompt de cliente que tem irmão', noRh.map((b) => b.chave ?? '-').join() === 'sobre_sistema,sobre_equipe,sobre_versao_rh,ef_gerar_insights_equipe,-', noRh)
const daEquipe = noRh.find((b) => b.chave === 'ef_gerar_insights_equipe')
ok('RH: o prompt da equipe perde o "da EQUIPE" e explica a troca de palavras', daEquipe?.titulo === 'Prompt' && daEquipe.explicacao === EXPLICACAO_DO_PROMPT_DO_RH && daEquipe.alcance === 'rh', daEquipe)
ok('RH: o do chat da equipe continua com a explicação dele', noRh.find((b) => b.chave === 'sobre_equipe')?.explicacao === 'b')
ok('não mexe na lista original', blocos[4].titulo === 'Prompt da EQUIPE' && !('alcance' in blocos[0]))

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.')
if (falhas) process.exit(1)
