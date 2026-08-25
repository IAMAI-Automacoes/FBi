import {
  montarBlocos,
  aplicarTeto,
  calcularDisparo,
  dentroDoSilencio,
  proximoHorarioUtil,
  type AvisoFila,
} from '../motor-agrupamento.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

const fb = (id: string, texto: string, criado: string) => ({ id, texto, criado_em: criado })

// ---------------------------------------------------------------------------
// T-D — dedup: 3 feedbacks do mesmo contato na MESMA ação = 1 item
// A dedup real acontece no índice único do banco (1 aviso), mas os 3 feedbacks
// chegam juntos no aviso; o bloco tem que continuar sendo um só.
// ---------------------------------------------------------------------------
{
  const fila: AvisoFila[] = [{
    id: 'a1', acao_id: 4, etapa: 'em_andamento', criado_em: '2026-08-25T10:00:00Z',
    acao_titulo: 'Reforçar equipe no pico', acao_categoria: 'Atendimento',
    feedbacks: [
      fb('f1', 'demorou muito', '2026-08-20T10:00:00Z'),
      fb('f2', 'fila enorme', '2026-08-21T10:00:00Z'),
      fb('f3', 'esperei 40min', '2026-08-22T10:00:00Z'),
    ],
  }]
  const blocos = montarBlocos(fila)
  ok('T-D: 3 feedbacks / 1 ação => 1 bloco', blocos.length === 1, `${blocos.length}`)
  ok('T-D: 1 frente', blocos[0].frentes.length === 1)
  ok('T-D: citação = feedback mais antigo', blocos[0].citacao === 'demorou muito', String(blocos[0].citacao))
}

// ---------------------------------------------------------------------------
// T-E — 1 feedback alimenta 3 ações = 1 bloco, 1 citação, 3 frentes
// ---------------------------------------------------------------------------
{
  const f5 = fb('f5', 'o som estava alto demais', '2026-08-20T10:00:00Z')
  const fila: AvisoFila[] = [6, 7, 8].map((acaoId, i) => ({
    id: `a${acaoId}`, acao_id: acaoId, etapa: 'em_andamento' as const,
    criado_em: `2026-08-25T10:0${i}:00Z`,
    acao_titulo: `Ação ${acaoId}`, acao_categoria: 'Música/Som',
    feedbacks: [f5],
  }))
  const blocos = montarBlocos(fila)
  ok('T-E: 1 feedback / 3 ações => 1 bloco', blocos.length === 1, `${blocos.length}`)
  ok('T-E: 3 frentes no bloco', blocos[0].frentes.length === 3, `${blocos[0].frentes.length}`)
  ok('T-E: uma única citação', blocos[0].citacao === 'o som estava alto demais')
  const { visiveis, excedente } = aplicarTeto(blocos, 4)
  ok('T-E: conta como 1 item para o teto', visiveis.length === 1 && excedente === 0)
}

// ---------------------------------------------------------------------------
// T-G — ordenação dentro do bloco: "começamos" antes de "concluímos"
// A fila chega com concluida ANTES na lista, de propósito.
// ---------------------------------------------------------------------------
{
  const f = fb('f11', 'mesa suja', '2026-08-20T10:00:00Z')
  const fila: AvisoFila[] = [
    { id: 'b', acao_id: 11, etapa: 'concluida', criado_em: '2026-08-25T12:00:00Z',
      acao_titulo: 'Revisar limpeza', acao_categoria: 'Limpeza', feedbacks: [f] },
    { id: 'a', acao_id: 11, etapa: 'em_andamento', criado_em: '2026-08-25T10:00:00Z',
      acao_titulo: 'Revisar limpeza', acao_categoria: 'Limpeza', feedbacks: [f] },
  ]
  const blocos = montarBlocos(fila)
  ok('T-G: 1 bloco', blocos.length === 1)
  ok('T-G: 1 frente (mesma ação)', blocos[0].frentes.length === 1)
  ok('T-G: em_andamento antes de concluida',
     JSON.stringify(blocos[0].frentes[0].etapas) === '["em_andamento","concluida"]',
     JSON.stringify(blocos[0].frentes[0].etapas))
}

// ---------------------------------------------------------------------------
// Desempate de grupos sobrepostos (SPEC, Parte B)
// fbA -> ações 1,2   |   fbB -> ações 2,3.  Ação 2 NÃO pode aparecer 2x.
// ---------------------------------------------------------------------------
{
  const fA = fb('fA', 'comida fria', '2026-08-20T10:00:00Z')   // mais antigo
  const fB = fb('fB', 'demora',      '2026-08-22T10:00:00Z')
  const fila: AvisoFila[] = [
    { id: '1', acao_id: 1, etapa: 'em_andamento', criado_em: '2026-08-25T10:00:00Z',
      acao_titulo: 'Ação 1', acao_categoria: null, feedbacks: [fA] },
    { id: '2', acao_id: 2, etapa: 'em_andamento', criado_em: '2026-08-25T10:01:00Z',
      acao_titulo: 'Ação 2', acao_categoria: null, feedbacks: [fA, fB] },
    { id: '3', acao_id: 3, etapa: 'em_andamento', criado_em: '2026-08-25T10:02:00Z',
      acao_titulo: 'Ação 3', acao_categoria: null, feedbacks: [fB] },
  ]
  const blocos = montarBlocos(fila)
  const todasFrentes = blocos.flatMap(b => b.frentes.map(f => f.acao_id))
  const unicas = new Set(todasFrentes)
  ok('Desempate: cada ação aparece 1x só',
     todasFrentes.length === unicas.size && unicas.size === 3,
     JSON.stringify(todasFrentes))
  const blocoDaAcao2 = blocos.find(b => b.frentes.some(f => f.acao_id === 2))!
  ok('Desempate: ação 2 ancorada no feedback MAIS ANTIGO (fA)',
     blocoDaAcao2.citacao === 'comida fria', String(blocoDaAcao2.citacao))
  ok('Desempate: 2 blocos (fA com ações 1+2, fB com ação 3)', blocos.length === 2, `${blocos.length}`)
}

// ---------------------------------------------------------------------------
// Teto por BLOCOS, não por avisos
// ---------------------------------------------------------------------------
{
  const blocos = Array.from({ length: 7 }, (_, i) => ({
    citacao: `c${i}`, frentes: [{ acao_id: i, titulo: `t${i}`, etapas: ['em_andamento' as const] }],
    ancora_em: `2026-08-25T10:0${i}:00Z`,
  }))
  const { visiveis, excedente } = aplicarTeto(blocos, 4)
  ok('Teto: 7 blocos, max 4 => 4 visíveis + 3 excedente',
     visiveis.length === 4 && excedente === 3, `${visiveis.length}/${excedente}`)
}

// ---------------------------------------------------------------------------
// Fórmula de disparo (SPEC, Parte A)
// ---------------------------------------------------------------------------
{
  const T_AGG = 30, COOLDOWN = 3
  // T-A: fila fria => vale criado + T_AGG
  const criado = new Date('2026-08-25T10:00:00Z')
  ok('T-A: fila fria => criado + 30min',
     calcularDisparo(criado, null, T_AGG, COOLDOWN).toISOString() === '2026-08-25T10:30:00.000Z',
     calcularDisparo(criado, null, T_AGG, COOLDOWN).toISOString())

  // T-B/T-C: fila represada => vale fim do cooldown, SEM somar T_AGG de novo
  const ultimoEnvio = new Date('2026-08-25T00:00:00Z')
  const criadoDepois = new Date('2026-08-26T00:00:00Z') // 1 dia depois do envio
  const d = calcularDisparo(criadoDepois, ultimoEnvio, T_AGG, COOLDOWN)
  ok('T-B: represado => sai no fim do cooldown (28/08 00:00)',
     d.toISOString() === '2026-08-28T00:00:00.000Z', d.toISOString())

  // T-F: o bug que motivou o cooldown único.
  // Enviou 10:30. Nova ação conclui 1h30 depois. NÃO pode sair em 2h.
  const envio = new Date('2026-08-25T10:30:00Z')
  const novoAviso = new Date('2026-08-25T12:00:00Z')
  const dF = calcularDisparo(novoAviso, envio, T_AGG, COOLDOWN)
  ok('T-F: não sai em t=2h; represa até o fim do cooldown',
     dF.toISOString() === '2026-08-28T10:30:00.000Z', dF.toISOString())
  ok('T-F: disparo está a mais de 48h do novo aviso',
     dF.getTime() - novoAviso.getTime() > 48 * 3600_000)

  // cooldown 0 (modo teste) => vale só o T_AGG
  const d0 = calcularDisparo(novoAviso, envio, T_AGG, 0)
  ok('cooldown=0 => vale criado + T_AGG',
     d0.toISOString() === '2026-08-25T12:30:00.000Z', d0.toISOString())
}

// ---------------------------------------------------------------------------
// Quiet hours em Brasília (o banco é UTC — este é o ponto que erra fácil)
// ---------------------------------------------------------------------------
{
  // 2026-08-25T04:00Z == 01:00 em Brasília (UTC-3) => DENTRO do silêncio 22-9
  ok('Silêncio: 04:00Z = 01:00 BRT => silêncio',
     dentroDoSilencio(new Date('2026-08-25T04:00:00Z'), 22, 9) === true)
  // 22:00Z == 19:00 BRT => pico do restaurante, FORA do silêncio
  ok('Silêncio: 22:00Z = 19:00 BRT => NÃO é silêncio (pico!)',
     dentroDoSilencio(new Date('2026-08-25T22:00:00Z'), 22, 9) === false)
  // 01:30Z == 22:30 BRT => dentro
  ok('Silêncio: 01:30Z = 22:30 BRT => silêncio',
     dentroDoSilencio(new Date('2026-08-26T01:30:00Z'), 22, 9) === true)
  // 15:00Z == 12:00 BRT => fora
  ok('Silêncio: 15:00Z = 12:00 BRT => fora',
     dentroDoSilencio(new Date('2026-08-25T15:00:00Z'), 22, 9) === false)
  // 12:00Z == 09:00 BRT => exatamente o fim, já liberado
  ok('Silêncio: 12:00Z = 09:00 BRT => liberado (fim exclusivo)',
     dentroDoSilencio(new Date('2026-08-25T12:00:00Z'), 22, 9) === false)

  const prox = proximoHorarioUtil(new Date('2026-08-26T04:00:00Z'), 9) // 01:00 BRT
  ok('Próximo horário útil de 01:00 BRT => 09:00 BRT (12:00Z)',
     prox.toISOString() === '2026-08-26T12:00:00.000Z', prox.toISOString())
}

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
