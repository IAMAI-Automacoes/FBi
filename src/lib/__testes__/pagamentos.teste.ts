/**
 * Testes de Admin → Receita (src/lib/pagamentos.ts).
 *   node --experimental-strip-types src/lib/__testes__/pagamentos.teste.ts
 */
import {
  BANCOS, codigoDoBanco, contaPreenchida, contaVazia, formatarPorcentagem, lerPorcentagem, nomeDoBanco, oQueFalta, trazerConta,
} from '../pagamentos.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const doRestaurante = { ...contaVazia('restaurante'), titular: 'IAMAI LTDA', cpf_cnpj: '12.345.678/0001-90', chave_pix: 'financeiro@iamai.com', tipo_conta: 'poupanca' as const }
const trazida = trazerConta(doRestaurante, 'rh')
ok('trazer: copia os dados e o software continua o deste', trazida.area === 'rh' && trazida.titular === 'IAMAI LTDA' && trazida.chave_pix === 'financeiro@iamai.com' && trazida.tipo_conta === 'poupanca')
ok('trazer: não mexe na conta de origem', doRestaurante.area === 'restaurante')
ok('conta vazia não vale trazer; com um dado, vale', !contaPreenchida(contaVazia('rh')) && contaPreenchida(doRestaurante) && !contaPreenchida(null))
ok('só o tipo da conta não conta como preenchida', !contaPreenchida({ ...contaVazia('rh'), tipo_conta: 'poupanca' }))
ok('porcentagem com vírgula', formatarPorcentagem(12.5) === '12,5%' && lerPorcentagem('12,5') === 12.5 && lerPorcentagem(' 40 ') === 40)
ok('porcentagem fora de 0 a 100 ou texto: não serve', [lerPorcentagem('101'), lerPorcentagem('-1'), lerPorcentagem('abc')].every((v) => v === null) && lerPorcentagem('') === 0)

ok('o que falta: nada quando tem Pix e CPF', oQueFalta({ chave_pix: 'a@b.c', conta: null, agencia: null, codigo_banco: null, cpf_cnpj: '123' }).length === 0)
ok('o que falta: conta completa vale no lugar do Pix', oQueFalta({ chave_pix: null, conta: '1-2', agencia: '0001', codigo_banco: '260', cpf_cnpj: '1' }).length === 0)
ok('o que falta: sem nada, os dois', oQueFalta({ chave_pix: ' ', conta: '1', agencia: null, codigo_banco: null, cpf_cnpj: null }).join() === 'chave Pix ou conta bancária,CPF ou CNPJ')

ok('códigos de 3 dígitos e sem repetir', BANCOS.every((b) => /^\d{3}$/.test(b.codigo)) && new Set(BANCOS.map((b) => b.codigo)).size === BANCOS.length)
ok('nome pelo código (com zero na frente ou não)', nomeDoBanco('260') === 'Nubank' && nomeDoBanco('1') === 'Banco do Brasil' && nomeDoBanco('0341') === 'Itaú' && nomeDoBanco('999') === null && nomeDoBanco('') === null)
ok('código pelo nome, sem acento e sem caixa', codigoDoBanco('itau') === '341' && codigoDoBanco('NUBANK') === '260' && codigoDoBanco('Caixa Econômica Federal') === '104')
ok('código pelo começo do nome, se só um bate', codigoDoBanco('brad') === '237' && codigoDoBanco('banco') === null && codigoDoBanco('x') === null)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nreceita: tudo certo')
if (falhas) process.exit(1)
