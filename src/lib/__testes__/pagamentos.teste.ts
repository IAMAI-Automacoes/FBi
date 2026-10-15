/**
 * Testes de Admin → Pagamentos (src/lib/pagamentos.ts).
 *   node --experimental-strip-types src/lib/__testes__/pagamentos.teste.ts
 */
import {
  BANCOS, codigoDoBanco, DONOS_PADRAO, formatarPorcentagem, lerPorcentagem, nomeDoBanco, oQueFalta, situacaoDaSoma, somaDasPartes,
  type ParteDaDivisao,
} from '../pagamentos.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const parte = (nome: string, valor: number, ativo = true): ParteDaDivisao => ({ id: nome, recebedor_id: nome, nome, valor, ativo })

ok('os donos de padrão: Caio 40, Raver 40, Guilherme 20 (soma 100)', DONOS_PADRAO.map((d) => `${d.nome}=${d.porcentagem}`).join() === 'Caio=40,Raver=40,Guilherme=20'
  && DONOS_PADRAO.reduce((s, d) => s + d.porcentagem, 0) === 100)
ok('soma só as ligadas', somaDasPartes([parte('A', 40), parte('B', 40), parte('C', 20, false)]) === 80)
ok('soma sem erro de vírgula', somaDasPartes([parte('A', 33.33), parte('B', 33.33), parte('C', 33.34)]) === 100)
ok('100%: certo', situacaoDaSoma([parte('A', 60), parte('B', 40)]).ok)
ok('faltando: diz quanto', situacaoDaSoma([parte('A', 60), parte('B', 30)]).texto === 'Soma 90%: faltam 10% para dar 100%.')
ok('passando: diz quanto', situacaoDaSoma([parte('A', 60), parte('B', 50)]).texto === 'Soma 110%: passou 10% de 100%.')
ok('porcentagem com vírgula', formatarPorcentagem(12.5) === '12,5%' && lerPorcentagem('12,5') === 12.5 && lerPorcentagem(' 40 ') === 40)
ok('porcentagem fora de 0 a 100 ou texto: não serve', [lerPorcentagem('101'), lerPorcentagem('-1'), lerPorcentagem('abc')].every((v) => v === null) && lerPorcentagem('') === 0)

ok('o que falta: nada quando tem Pix e CPF', oQueFalta({ chave_pix: 'a@b.c', conta: null, agencia: null, codigo_banco: null, cpf_cnpj: '123' }).length === 0)
ok('o que falta: conta completa vale no lugar do Pix', oQueFalta({ chave_pix: null, conta: '1-2', agencia: '0001', codigo_banco: '260', cpf_cnpj: '1' }).length === 0)
ok('o que falta: sem nada, os dois', oQueFalta({ chave_pix: ' ', conta: '1', agencia: null, codigo_banco: null, cpf_cnpj: null }).join() === 'chave Pix ou conta bancária,CPF ou CNPJ')

ok('códigos de 3 dígitos e sem repetir', BANCOS.every((b) => /^\d{3}$/.test(b.codigo)) && new Set(BANCOS.map((b) => b.codigo)).size === BANCOS.length)
ok('nome pelo código (com zero na frente ou não)', nomeDoBanco('260') === 'Nubank' && nomeDoBanco('1') === 'Banco do Brasil' && nomeDoBanco('0341') === 'Itaú' && nomeDoBanco('999') === null && nomeDoBanco('') === null)
ok('código pelo nome, sem acento e sem caixa', codigoDoBanco('itau') === '341' && codigoDoBanco('NUBANK') === '260' && codigoDoBanco('Caixa Econômica Federal') === '104')
ok('código pelo começo do nome, se só um bate', codigoDoBanco('brad') === '237' && codigoDoBanco('banco') === null && codigoDoBanco('x') === null)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\npagamentos: tudo certo')
if (falhas) process.exit(1)
