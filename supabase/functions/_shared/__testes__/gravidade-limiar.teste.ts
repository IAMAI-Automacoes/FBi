import { avaliarGravidade, gravidadeMaxima, normalizar } from '../gravidade.ts'
import {
  pessoasNecessarias,
  assuntoElegivel,
  pontuarAssunto,
  prioridadeAcaoManual,
} from '../limiar.ts'
import { construirVocabularioProibido, detectarVazamento } from '../anti-vazamento.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

// ---------------------------------------------------------------------------
// Normalização — a base de tudo. O bug que isto trava: se a marca de acento
// virasse espaço em vez de sumir, "não" viraria "na o" e o negador pararia de
// ser reconhecido, sem erro nenhum aparecendo.
// ---------------------------------------------------------------------------
{
  ok('normaliza acento sem partir a palavra', normalizar('Não') === ' nao ', normalizar('Não'))
  ok('intoxicação vira intoxicacao', normalizar('intoxicação') === ' intoxicacao ')
  ok('pontuação vira separador', normalizar('cabelo, na comida!') === ' cabelo na comida ')
}

// ---------------------------------------------------------------------------
// Gravidade — os 5 níveis
// ---------------------------------------------------------------------------
{
  ok('G4: cabelo na comida', avaliarGravidade('Tinha um cabelo na comida').G === 4)
  ok('G4: passei mal', avaliarGravidade('Passei mal depois de comer aqui').G === 4)
  ok('G4: intoxicação com acento', avaliarGravidade('tive uma intoxicação').G === 4)
  ok('G3: banheiro imundo', avaliarGravidade('O banheiro estava imundo').G === 3)
  ok('G2: prato frio', avaliarGravidade('O prato principal já estava frio').G === 2)
  ok('G1: sugestão', avaliarGravidade('Poderia ter mais opções veganas').G === 1)
  ok('G0: elogio', avaliarGravidade('Excelente, adorei tudo').G === 0)
  ok('G0: texto sem nada reconhecível', avaliarGravidade('fui no sabado').G === 0)
}

// ---------------------------------------------------------------------------
// Negação — o relato NEGADO não pode contar como ocorrência
// ---------------------------------------------------------------------------
{
  ok('nega sem acento', avaliarGravidade('Nao tinha cabelo na comida').G !== 4)
  ok('nega com acento', avaliarGravidade('Não tinha cabelo na comida').G !== 4)
  ok(
    'negador longe NÃO anula (janela de 3 palavras)',
    avaliarGravidade('não vou voltar mais, tinha cabelo na comida').G === 4,
  )
}

// ---------------------------------------------------------------------------
// Fronteira de palavra — "cru" não pode bater dentro de "crustaceo"
// ---------------------------------------------------------------------------
{
  const r = avaliarGravidade('o crustaceo estava bem preparado')
  ok('não casa termo no meio de outra palavra', r.G !== 4, `G${r.G} ${r.termos.join(',')}`)
}

// ---------------------------------------------------------------------------
// Confiança — palavra solta e ambígua tem que sinalizar incerteza, porque é
// esse o gatilho para a IA ir consultar a mensagem original.
// ---------------------------------------------------------------------------
{
  ok('expressão inequívoca => confiança alta', avaliarGravidade('cabelo na comida').confianca === 'alta')
  ok('palavra solta => confiança baixa', avaliarGravidade('demorou').confianca === 'baixa')
}

{
  ok(
    'gravidadeMaxima pega o pior do conjunto',
    gravidadeMaxima([{ texto: 'tudo ótimo' }, { texto: 'o prato veio frio' }, { texto: 'tinha cabelo na comida' }]) === 4,
  )
}

// ---------------------------------------------------------------------------
// Limiar — quantas pessoas cada gravidade exige
// ---------------------------------------------------------------------------
{
  ok('P_min(G4) = 1 pessoa', pessoasNecessarias(4) === 1)
  ok('P_min(G3) = 2', pessoasNecessarias(3) === 2)
  ok('P_min(G2) = 3', pessoasNecessarias(2) === 3)
  ok('P_min(G1) = 6', pessoasNecessarias(1) === 6)
  ok('P_min(G0) = 12', pessoasNecessarias(0) === 12)

  ok('1 relato de cabelo JÁ é elegível', assuntoElegivel(4, 1))
  ok('1 relato de comida fria NÃO é elegível', !assuntoElegivel(2, 1))
  ok('3 relatos de comida fria são elegíveis', assuntoElegivel(2, 3))
}

// ---------------------------------------------------------------------------
// Ranking — gravidade tem que vencer volume banal
// ---------------------------------------------------------------------------
{
  const sanitarioIsolado = pontuarAssunto({ G: 4, pessoas: 1, diasDesdeMaisRecente: 1, reincidente: false })
  const banalVolumoso = pontuarAssunto({ G: 1, pessoas: 12, diasDesdeMaisRecente: 1, reincidente: false })
  ok(
    'relato sanitário isolado passa na frente de assunto banal volumoso',
    sanitarioIsolado > banalVolumoso,
    `${sanitarioIsolado.toFixed(2)} vs ${banalVolumoso.toFixed(2)}`,
  )

  // A regra que precisa valer: um relato sanitário isolado (G4, 1 pessoa) não
  // pode ser empurrado para fora do top-5 por assunto de baixa gravidade, por
  // mais gente que tenha reclamado. Testado no pior cenário possível para o G4
  // (relato no limite da validade de 14 dias, sem reincidência) contra o melhor
  // cenário do concorrente (hoje, reincidente, volume absurdo).
  //
  // Só vale contra G0-G2. Contra G3 a dominância é intencionalmente NÃO
  // absoluta: dezenas de relatos de banheiro imundo passando na frente de um
  // cabelo isolado é o comportamento certo, não um bug.
  {
    const cabeloVelhoIsolado = pontuarAssunto({
      G: 4, pessoas: 1, diasDesdeMaisRecente: 14, reincidente: false,
    })
    for (const g of [0, 1, 2] as const) {
      for (const pessoas of [12, 50, 500]) {
        const concorrente = pontuarAssunto({
          G: g, pessoas, diasDesdeMaisRecente: 0, reincidente: true,
        })
        ok(
          `G4 isolado vence G${g} com ${pessoas} pessoas`,
          cabeloVelhoIsolado > concorrente,
          `${cabeloVelhoIsolado.toFixed(2)} vs ${concorrente.toFixed(2)}`,
        )
      }
    }
  }

  // Volume continua desempatando dentro da mesma gravidade — senão a nota não
  // serviria para nada além de replicar a gravidade.
  {
    const poucos = pontuarAssunto({ G: 2, pessoas: 4, diasDesdeMaisRecente: 1, reincidente: false })
    const muitos = pontuarAssunto({ G: 2, pessoas: 20, diasDesdeMaisRecente: 1, reincidente: false })
    ok('mesma gravidade: mais pessoas pontua mais', muitos > poucos)
  }

  const recente = pontuarAssunto({ G: 2, pessoas: 5, diasDesdeMaisRecente: 1, reincidente: false })
  const velho = pontuarAssunto({ G: 2, pessoas: 5, diasDesdeMaisRecente: 30, reincidente: false })
  ok('assunto recente pontua mais que o mesmo assunto velho', recente > velho)

  const reincid = pontuarAssunto({ G: 2, pessoas: 5, diasDesdeMaisRecente: 1, reincidente: true })
  ok('reincidência pesa positivo (não foi resolvido de verdade)', reincid > recente)
}

// ---------------------------------------------------------------------------
// Prioridade de ação manual — os 3 cenários de sanidade do plano
// ---------------------------------------------------------------------------
{
  const frio = prioridadeAcaoManual({
    gravidadesNegativos: [2, 2, 2, 2, 2],
    positivos: 0,
    originaisDistintos: 5,
  })
  ok(
    '5x comida fria sem elogio => IMPORTANTE (a regra antiga dizia URGENTE)',
    frio.prioridade === 'IMPORTANTE',
    `${frio.prioridade} indice=${frio.indice.toFixed(2)}`,
  )

  const cabelo = prioridadeAcaoManual({
    gravidadesNegativos: [4],
    positivos: 0,
    originaisDistintos: 1,
  })
  ok('1x cabelo => URGENTE independente do volume', cabelo.prioridade === 'URGENTE')

  const cabeloEntreElogios = prioridadeAcaoManual({
    gravidadesNegativos: [4],
    positivos: 200,
    originaisDistintos: 1,
  })
  ok(
    'cabelo continua URGENTE mesmo com 200 elogios (gravidade não dilui)',
    cabeloEntreElogios.prioridade === 'URGENTE',
  )

  const poucoEntreMuitos = prioridadeAcaoManual({
    gravidadesNegativos: [2, 2, 2],
    positivos: 20,
    originaisDistintos: 3,
  })
  ok(
    '3x G2 contra 20 elogios => OBSERVACAO',
    poucoEntreMuitos.prioridade === 'OBSERVACAO',
    `${poucoEntreMuitos.prioridade} indice=${poucoEntreMuitos.indice.toFixed(2)}`,
  )

  const semNada = prioridadeAcaoManual({ gravidadesNegativos: [], positivos: 0, originaisDistintos: 0 })
  ok('sem negativos => OBSERVACAO e sem divisão por zero', semNada.prioridade === 'OBSERVACAO' && Number.isFinite(semNada.indice))
}

// ---------------------------------------------------------------------------
// Anti-vazamento — o caso REAL do banco (original 1bec2799).
// A mensagem trata de 3 assuntos; o insight é sobre DEMORA e não pode falar
// de prato frio nem de ambiente.
// ---------------------------------------------------------------------------
{
  const doAssunto = ['Demorou quase 50 minutos pra chegar, ficamos esperando']
  const irmaos = ['O prato principal ja estava frio', 'O ambiente e bonito e aconchegante']
  const vocab = construirVocabularioProibido(doAssunto, irmaos)

  const limpo = detectarVazamento(
    'Clientes aguardando tempo excessivo. Revisar o fluxo da cozinha nos horários de pico.',
    vocab,
  )
  ok('insight legítimo sobre demora passa limpo', limpo.nivel === 'limpo', `${limpo.nivel} ${limpo.tokens.join(',')}`)

  const copiaLiteral = detectarVazamento('O prato principal ja estava frio quando chegou', vocab)
  ok(
    'cópia literal do assunto irmão => vazou',
    copiaLiteral.nivel === 'vazou',
    `${copiaLiteral.nivel} tri=${copiaLiteral.trigramas.join('|')}`,
  )

  const elogioVazado = detectarVazamento(
    'Aproveitar que o ambiente é bonito e aconchegante para compensar a espera',
    vocab,
  )
  ok(
    'elogio ao ambiente vazando para o insight de demora => vazou',
    elogioVazado.nivel === 'vazou',
    `${elogioVazado.nivel} tokens=${elogioVazado.tokens.join(',')}`,
  )

  // Paráfrase próxima cai em "suspeito", não em "vazou": é o ponto de entrega
  // para o verificador com IA. O detector sozinho não decide semântica.
  const parafrase = detectarVazamento('Os pratos estão chegando frios para a mesa', vocab)
  ok(
    'paráfrase do assunto irmão => pelo menos suspeito',
    parafrase.nivel === 'suspeito' || parafrase.nivel === 'vazou',
    `${parafrase.nivel} tokens=${parafrase.tokens.join(',')}`,
  )
}

// ---------------------------------------------------------------------------
// Anti-vazamento — sem irmãos não há o que proibir (mensagem de assunto único)
// ---------------------------------------------------------------------------
{
  const vocab = construirVocabularioProibido(['a fila estava enorme'], [])
  const r = detectarVazamento('Fila muito longa na entrada, revisar recepção', vocab)
  ok('mensagem de assunto único nunca acusa vazamento', r.nivel === 'limpo')
}

// ---------------------------------------------------------------------------
// Anti-vazamento — palavra genérica compartilhada não pode acusar
// ---------------------------------------------------------------------------
{
  const vocab = construirVocabularioProibido(
    ['o atendimento foi lento'],
    ['o restaurante estava cheio de cliente'],
  )
  const r = detectarVazamento('O atendimento do restaurante precisa de mais gente no salão', vocab)
  ok('vocabulário genérico do domínio não dispara falso positivo', r.nivel === 'limpo', `${r.nivel} ${r.tokens.join(',')}`)
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
