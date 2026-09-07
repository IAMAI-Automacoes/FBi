import { nomeDeArquivoSeguro } from '../nome-arquivo.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

ok('acento sai', nomeDeArquivoSeguro('Rogério') === 'rogerio', nomeDeArquivoSeguro('Rogério'))
ok('cedilha sai', nomeDeArquivoSeguro('Conceição') === 'conceicao', nomeDeArquivoSeguro('Conceição'))
ok('espaço vira traço', nomeDeArquivoSeguro('Ana Paula') === 'ana-paula', nomeDeArquivoSeguro('Ana Paula'))
ok('caractere proibido no Windows sai', nomeDeArquivoSeguro('João / Maria: 1') === 'joao-maria-1', nomeDeArquivoSeguro('João / Maria: 1'))
ok('não sobra traço nas pontas', nomeDeArquivoSeguro('  -- Zé --  ') === 'ze', nomeDeArquivoSeguro('  -- Zé --  '))
ok('nome só de símbolos cai na reserva', nomeDeArquivoSeguro('###') === 'arquivo', nomeDeArquivoSeguro('###'))
ok('vazio cai na reserva', nomeDeArquivoSeguro('') === 'arquivo', nomeDeArquivoSeguro(''))
ok('reserva personalizada', nomeDeArquivoSeguro('', 'garcom') === 'garcom')
ok('já limpo continua igual', nomeDeArquivoSeguro('camelo') === 'camelo')

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
