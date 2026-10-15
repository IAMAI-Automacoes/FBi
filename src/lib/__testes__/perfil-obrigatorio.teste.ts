import { CAMPOS_OBRIGATORIOS, camposFaltando, perfilDaLinha } from '../perfil-obrigatorio.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

const completo = {
  tipo_culinaria: 'Churrascaria',
  localizacao: 'Moema, São Paulo - SP',
  numero_mesas: '30',
  capacidade_lugares: '120',
  num_funcionarios: '15',
  faixa_preco: 'R$ 90',
  horario_funcionamento: 'Ter a dom, 11h às 23h',
  publico_alvo: 'Famílias no fim de semana',
  detalhes: 'Rodízio desde 2012.',
}

{
  ok('perfil completo não falta nada', camposFaltando(completo).length === 0)
  ok('tudo vazio falta tudo', camposFaltando({}).length === CAMPOS_OBRIGATORIOS.length)
  ok('só espaço conta como vazio', camposFaltando({ ...completo, localizacao: '   ' }).join() === 'localizacao')
  ok('null conta como vazio', camposFaltando({ ...completo, publico_alvo: null }).join() === 'publico_alvo')
}

// A linha do banco: colunas próprias + jsonb.
{
  const linha = {
    tipo_culinaria: 'Churrascaria',
    numero_mesas: 30,
    detalhes: 'Rodízio desde 2012.',
    perfil_restaurante: {
      localizacao: 'Moema',
      capacidade_lugares: '120',
      num_funcionarios: '15',
      faixa_preco: 'R$ 90',
      horario_funcionamento: '11h às 23h',
      publico_alvo: 'Famílias',
      pratos_mais_vendidos: 'campo antigo, ignorado',
    },
  }
  ok('linha completa não falta nada', camposFaltando(perfilDaLinha(linha)).length === 0)
  ok('mesas vem da coluna, não do jsonb', camposFaltando(perfilDaLinha({ ...linha, numero_mesas: null })).join() === 'numero_mesas')
  ok('tipo de cozinha antigo no jsonb ainda vale',
    camposFaltando(perfilDaLinha({ ...linha, tipo_culinaria: null, perfil_restaurante: { ...linha.perfil_restaurante, tipo_culinaria: 'Italiana' } })).length === 0)
  ok('linha nula não quebra', camposFaltando(perfilDaLinha(null)).length === CAMPOS_OBRIGATORIOS.length)
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
