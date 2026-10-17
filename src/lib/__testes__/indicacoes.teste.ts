/**
 * Testes das regras de Descontos e da indicação entre restaurantes
 * (src/lib/indicacoes.ts, src/lib/descontos.ts e src/lib/subpaginas.ts).
 *   node --experimental-strip-types src/lib/__testes__/indicacoes.teste.ts
 */
import {
  CODIGO_VALIDO, codigoParaCopia, faltamParaONivel, lerNiveis, lerNumeros, linkDeIndicacao, nivelAlcancado, premiosPendentes, RECUSA_QUE_TRAVA,
  ROTULO_PREMIO, ROTULO_PREMIO_ADMIN, textoDaPorcentagem,
} from '../indicacoes.ts'
import { conviteDoEndereco } from '../areas.ts'
import { ehRotaDeDescontos, ROTA_DESCONTOS, ROTA_DESCONTOS_HISTORICO, ROTA_INDICACOES } from '../descontos.ts'
import { subpaginaAberta } from '../subpaginas.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// ── O menu de subpáginas ─────────────────────────────────────────────────────
const EQUIPE = ['/equipe', '/equipe/feedbacks', '/equipe/insights', '/equipe/acoes', '/equipe/relatorios', '/equipe/funcionarios']
ok('equipe: a raiz é a Visão Geral', subpaginaAberta(EQUIPE, '/equipe') === '/equipe')
ok('equipe: cada subpágina marca a si mesma', EQUIPE.every((h) => subpaginaAberta(EQUIPE, h) === h))
ok('equipe: /acoes/arquivadas ainda é Ações', subpaginaAberta(EQUIPE, '/equipe/acoes/arquivadas') === '/equipe/acoes')
ok('endereço parecido não confunde (/equipe/acoesx não é Ações)', subpaginaAberta(EQUIPE, '/equipe/acoesx') === '/equipe')
const DESCONTOS = [ROTA_DESCONTOS, ROTA_INDICACOES]
ok('descontos: a raiz é Vídeos e o histórico dos vídeos também', subpaginaAberta(DESCONTOS, ROTA_DESCONTOS) === ROTA_DESCONTOS && subpaginaAberta(DESCONTOS, ROTA_DESCONTOS_HISTORICO) === ROTA_DESCONTOS)
ok('descontos: Indicações marca Indicações', subpaginaAberta(DESCONTOS, ROTA_INDICACOES) === ROTA_INDICACOES)
ok('a ordem da lista não muda o resultado', subpaginaAberta([ROTA_INDICACOES, ROTA_DESCONTOS], ROTA_INDICACOES) === ROTA_INDICACOES)

// ── A área Descontos ─────────────────────────────────────────────────────────
ok('rotas de descontos', ehRotaDeDescontos('/descontos') && ehRotaDeDescontos('/descontos/historico') && ehRotaDeDescontos('/descontos/indicacoes'))
ok('o que não é de descontos', !ehRotaDeDescontos('/') && !ehRotaDeDescontos('/descontosx') && !ehRotaDeDescontos('/missoes') && !ehRotaDeDescontos('/equipe'))

// ── O benefício (o texto que o admin escreve) ────────────────────────────────
// O benefício deixou de ser um texto do admin (15/10/2026): é a % do afiliado.

// ── O link ───────────────────────────────────────────────────────────────────
const link = linkDeIndicacao('https://easyfeed.com.br/', 'CAMELO-R2UF')
ok('o link abre a CRIAÇÃO DE CONTA com o código', link === 'https://easyfeed.com.br/cadastro?ref=CAMELO-R2UF')
ok('sem barra dobrada, com ou sem barra no fim do site', linkDeIndicacao('https://easyfeed.com.br', 'AB') === 'https://easyfeed.com.br/cadastro?ref=AB' && linkDeIndicacao('https://easyfeed.com.br///', 'AB') === 'https://easyfeed.com.br/cadastro?ref=AB')
ok('o código do link é o que o site lê de volta', CODIGO_VALIDO.test(new URL(link).searchParams.get('ref') ?? ''))
const linkRh = linkDeIndicacao('https://easyfeed.com.br', 'CLINICA-AB12', 'rh')
ok('no RH, o mesmo código vai como convite do RH', linkRh === 'https://easyfeed.com.br/cadastro?ref=CLINICA-AB12&area=rh&convite=CLINICA-AB12'
  && JSON.stringify(conviteDoEndereco(new URL(linkRh).search)) === JSON.stringify({ area: 'rh', convite: 'CLINICA-AB12' }))
ok('o código curto de um afiliado criado à mão também vira convite', conviteDoEndereco(new URL(linkDeIndicacao('https://x.com', 'JOAO10', 'rh')).search)?.convite === 'JOAO10')
ok('formato do código: o mesmo do checkout', ['AB', 'CAMELO-R2UF', 'EASYFEED-N3B4', 'A_B-9'].every((c) => CODIGO_VALIDO.test(c))
  && !['', 'A', 'abc', 'COM ESPACO', 'AÇAÍ', 'A'.repeat(31)].some((c) => CODIGO_VALIDO.test(c)))

// ── Os benefícios ganhos ─────────────────────────────────────────────────────
ok('situação por extenso, para o restaurante e para o admin', ROTULO_PREMIO.pendente === 'A receber' && ROTULO_PREMIO.aplicado === 'Recebido' && ROTULO_PREMIO.cancelado === 'Cancelado'
  && ROTULO_PREMIO_ADMIN.pendente === 'Pendente' && ROTULO_PREMIO_ADMIN.aplicado === 'Aplicado')
ok('pendentes: só os que faltam dar', premiosPendentes([{ status: 'pendente' }, { status: 'aplicado' }, { status: 'cancelado' }, { status: 'pendente' }]) === 2 && premiosPendentes([]) === 0)
ok('números: lê o que veio do banco', JSON.stringify(lerNumeros({ entraram: 5, nao_pagaram: 1, a_caminho: 2, contam: 2, liberados: 1 }))
  === JSON.stringify({ entraram: 5, nao_pagaram: 1, a_caminho: 2, contam: 2, liberados: 1 }))
ok('números: o que falta ou não é número vira zero', JSON.stringify(lerNumeros({ entraram: '3', contam: -1, a_caminho: 'x' })) === JSON.stringify({ entraram: 3, nao_pagaram: 0, a_caminho: 0, contam: 0, liberados: 0 })
  && lerNumeros(null).entraram === 0)

// A escada de benefícios (17/10/2026).
{
  const niveis = lerNiveis([
    { indicacoes: 3, beneficio: '1 mês grátis', status: null },
    { indicacoes: 1, beneficio: ' 10% de desconto na mensalidade ', status: 'aplicado', liberado_em: '2026-10-01T00:00:00Z', aplicado_em: '2026-10-05T00:00:00Z' },
    { indicacoes: 3, beneficio: 'repetido', status: null },
    { indicacoes: 0, beneficio: 'zero' },
    { indicacoes: 5, beneficio: '' },
    { indicacoes: 10, beneficio: '1 ano grátis', status: 'qualquer' },
  ])
  ok('escada: em ordem, sem repetir nível, sem nível vazio ou zero', niveis.map((n) => n.indicacoes).join() === '1,3,10' && niveis[0].beneficio === '10% de desconto na mensalidade', niveis)
  ok('escada: situação estranha vira "ainda não alcançou"', niveis[2].status === null)
  ok('escada: lixo vira lista vazia', lerNiveis(null).length === 0 && lerNiveis('x').length === 0)
  ok('nível alcançado: com o benefício liberado', nivelAlcancado({ indicacoes: 1, status: 'pendente' }, 0) && nivelAlcancado({ indicacoes: 1, status: 'aplicado' }, 0))
  ok('nível cancelado pelo admin não conta como alcançado', !nivelAlcancado({ indicacoes: 1, status: 'cancelado' }, 5))
  ok('sem benefício ainda: vale quantas já contam', nivelAlcancado({ indicacoes: 3, status: null }, 3) && !nivelAlcancado({ indicacoes: 3, status: null }, 2))
  ok('quantas faltam', faltamParaONivel({ indicacoes: 5 }, 2) === 3 && faltamParaONivel({ indicacoes: 5 }, 7) === 0)
}
ok('porcentagem com vírgula', textoDaPorcentagem(10) === '10%' && textoDaPorcentagem(12.5) === '12,5%')
ok('copiar afiliado: código novo, com o sufixo do software', codigoParaCopia('joao10', 'rh', new Set()) === 'JOAO10RH' && codigoParaCopia('MARIA', 'restaurante', new Set()) === 'MARIAR')
ok('copiar afiliado: não repete código que já existe', codigoParaCopia('JOAO10', 'rh', new Set(['JOAO10RH', 'JOAO10RH2'])) === 'JOAO10RH3')
ok('copiar afiliado: o código novo cabe no formato', CODIGO_VALIDO.test(codigoParaCopia('A'.repeat(30), 'rh', new Set())))

// ── Na hora de assinar ───────────────────────────────────────────────────────
ok('só o próprio código trava a compra', Object.keys(RECUSA_QUE_TRAVA).join() === 'proprio_codigo' && RECUSA_QUE_TRAVA.proprio_codigo.includes('próprio código'))
ok('código inválido e quem já assinou seguem para o checkout', RECUSA_QUE_TRAVA.codigo_invalido === undefined && RECUSA_QUE_TRAVA.ja_assinou === undefined && RECUSA_QUE_TRAVA.erro === undefined)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nindicações e descontos (tela): tudo certo')
process.exit(falhas ? 1 : 0)
