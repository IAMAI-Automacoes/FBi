/**
 * Testes das regras de Descontos e da indicação entre restaurantes
 * (src/lib/indicacoes.ts, src/lib/descontos.ts e src/lib/subpaginas.ts).
 *   node --experimental-strip-types src/lib/__testes__/indicacoes.teste.ts
 */
import {
  BENEFICIO_MAX, BENEFICIO_MIN, CODIGO_VALIDO, limparBeneficio, linkDeIndicacao, linkDoWhatsapp, mensagemDeIndicacao,
  premiosPendentes, problemaDoBeneficio, RECUSA_QUE_TRAVA, resumoDasIndicacoes, ROTULO_PREMIO, ROTULO_PREMIO_ADMIN,
} from '../indicacoes.ts'
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
ok('limpa espaço sobrando e quebra de linha', limparBeneficio('  1 mês \n grátis   na próxima  ') === '1 mês grátis na próxima')
ok('desligado aceita texto vazio', problemaDoBeneficio('', false) === null && problemaDoBeneficio('   ', false) === null)
ok('ligar sem texto: não deixa', problemaDoBeneficio('', true) !== null && problemaDoBeneficio('oi', true) !== null && problemaDoBeneficio('a'.repeat(BENEFICIO_MIN - 1), true) !== null)
ok('ligar com texto: deixa', problemaDoBeneficio('1 mês grátis', true) === null && problemaDoBeneficio('a'.repeat(BENEFICIO_MIN), true) === null)
ok('texto comprido demais: não deixa, ligado ou não', problemaDoBeneficio('a'.repeat(BENEFICIO_MAX + 1), true) !== null && problemaDoBeneficio('a'.repeat(BENEFICIO_MAX + 1), false) !== null
  && problemaDoBeneficio('a'.repeat(BENEFICIO_MAX), true) === null)
ok('o limite conta o texto limpo, não os espaços', problemaDoBeneficio(`${'a'.repeat(BENEFICIO_MAX)}      `, true) === null)

// ── O link ───────────────────────────────────────────────────────────────────
const link = linkDeIndicacao('https://easyfeed.com.br/', 'CAMELO-R2UF')
ok('o link abre a página de vendas com o código', link === 'https://easyfeed.com.br/vendas?ref=CAMELO-R2UF')
ok('sem barra dobrada, com ou sem barra no fim do site', linkDeIndicacao('https://easyfeed.com.br', 'AB') === 'https://easyfeed.com.br/vendas?ref=AB' && linkDeIndicacao('https://easyfeed.com.br///', 'AB') === 'https://easyfeed.com.br/vendas?ref=AB')
ok('o código do link é o que o site lê de volta', CODIGO_VALIDO.test(new URL(link).searchParams.get('ref') ?? ''))
ok('formato do código: o mesmo do checkout', ['AB', 'CAMELO-R2UF', 'EASYFEED-N3B4', 'A_B-9'].every((c) => CODIGO_VALIDO.test(c))
  && !['', 'A', 'abc', 'COM ESPACO', 'AÇAÍ', 'A'.repeat(31)].some((c) => CODIGO_VALIDO.test(c)))
const msg = mensagemDeIndicacao(link)
ok('a mensagem pronta leva o link', msg.endsWith(link) && msg.includes('EasyFeed'))
const wa = linkDoWhatsapp(msg)
ok('o link do WhatsApp leva a mensagem inteira, sem número fixo', wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa.split('text=')[1]) === msg)

// ── Os benefícios ganhos ─────────────────────────────────────────────────────
ok('situação por extenso, para o restaurante e para o admin', ROTULO_PREMIO.pendente === 'A receber' && ROTULO_PREMIO.aplicado === 'Recebido' && ROTULO_PREMIO.cancelado === 'Cancelado'
  && ROTULO_PREMIO_ADMIN.pendente === 'Pendente' && ROTULO_PREMIO_ADMIN.aplicado === 'Aplicado')
ok('pendentes: só os que faltam dar', premiosPendentes([{ status: 'pendente' }, { status: 'aplicado' }, { status: 'cancelado' }, { status: 'pendente' }]) === 2 && premiosPendentes([]) === 0)
ok('resumo: ninguém ainda', resumoDasIndicacoes(0, 0) === 'Nenhum restaurante entrou pelo seu link ainda.')
ok('resumo: singular e plural', resumoDasIndicacoes(1, 0) === '1 restaurante entrou pelo seu link, nenhum assinou ainda.'
  && resumoDasIndicacoes(1, 1) === '1 restaurante entrou pelo seu link, 1 assinou.' && resumoDasIndicacoes(3, 2) === '3 restaurantes entraram pelo seu link, 2 assinaram.')

// ── Na hora de assinar ───────────────────────────────────────────────────────
ok('só o próprio código trava a compra', Object.keys(RECUSA_QUE_TRAVA).join() === 'proprio_codigo' && RECUSA_QUE_TRAVA.proprio_codigo.includes('próprio código'))
ok('código inválido e quem já assinou seguem para o checkout', RECUSA_QUE_TRAVA.codigo_invalido === undefined && RECUSA_QUE_TRAVA.ja_assinou === undefined && RECUSA_QUE_TRAVA.erro === undefined)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nindicações e descontos (tela): tudo certo')
process.exit(falhas ? 1 : 0)
