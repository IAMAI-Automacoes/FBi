/**
 * Tradução ref → uuid, com fallback.
 *
 * Cobre a correção do vínculo insight↔feedback e ação↔insight. A lógica real
 * vive dentro de `gerar-insights` e `sugerir-acoes` (embutida no fluxo das
 * funções, com acesso a `db`), então aqui ela é reproduzida idêntica — o valor
 * do teste é travar o COMPORTAMENTO nos casos que quebraram em produção:
 * modelo omitindo refs, mandando número fora da faixa, ou repetindo o mesmo.
 */

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

// --- réplica da lógica de gerar-insights ------------------------------------

interface FeedbackEnviado {
  origem_id: string
  categoria: string
}

function resolverIds(
  insight: { refs?: unknown; feedback_ids?: unknown; categoria?: string; titulo?: string },
  feedbacks: FeedbackEnviado[],
): string[] {
  const porIndice = feedbacks.map((f) => String(f.origem_id))

  const porRef = (Array.isArray(insight.refs) ? insight.refs : [])
    .map((n: unknown) => porIndice[Number(n) - 1])
    .filter((id: string | undefined): id is string => !!id)
  if (porRef.length > 0) return [...new Set<string>(porRef)]

  const validos = new Set(porIndice)
  const porUuid = (Array.isArray(insight.feedback_ids) ? insight.feedback_ids : [])
    .map((id: unknown) => String(id))
    .filter((id: string) => validos.has(id))
  if (porUuid.length > 0) return [...new Set<string>(porUuid)]

  // Fallback por categoria.
  const categoria = String(insight.categoria || '').toLowerCase()
  return [
    ...new Set<string>(
      feedbacks
        .filter((f) => String(f.categoria || '').toLowerCase() === categoria)
        .map((f) => String(f.origem_id)),
    ),
  ].slice(0, 10)
}

const FB: FeedbackEnviado[] = [
  { origem_id: 'aaaaaaaa-0000-0000-0000-000000000001', categoria: 'Comida' },
  { origem_id: 'bbbbbbbb-0000-0000-0000-000000000002', categoria: 'Atendimento' },
  { origem_id: 'cccccccc-0000-0000-0000-000000000003', categoria: 'Comida' },
]

// Caminho feliz: modelo cita números.
{
  const ids = resolverIds({ refs: [1, 3], categoria: 'Comida' }, FB)
  ok('refs [1,3] => os 2 uuids certos',
     ids.length === 2 && ids[0] === FB[0].origem_id && ids[1] === FB[2].origem_id,
     JSON.stringify(ids))
}

// O caso que quebrou produção: modelo não cita nada.
{
  const ids = resolverIds({ categoria: 'Comida', titulo: 'Comida fria' }, FB)
  ok('sem refs => fallback pega os 2 de Comida',
     ids.length === 2 && ids.includes(FB[0].origem_id) && ids.includes(FB[2].origem_id),
     JSON.stringify(ids))
}

{
  const ids = resolverIds({ refs: [], feedback_ids: [], categoria: 'Atendimento' }, FB)
  ok('arrays vazios => fallback por categoria',
     ids.length === 1 && ids[0] === FB[1].origem_id, JSON.stringify(ids))
}

// Compatibilidade com prompt sobrescrito no painel, que ainda peça uuid.
{
  const ids = resolverIds({ feedback_ids: [FB[1].origem_id], categoria: 'Comida' }, FB)
  ok('feedback_ids (formato antigo) ainda funciona',
     ids.length === 1 && ids[0] === FB[1].origem_id, JSON.stringify(ids))
}

// Robustez contra saída ruim do modelo.
{
  ok('ref fora da faixa é ignorada, resto aproveitado',
     JSON.stringify(resolverIds({ refs: [99, 2], categoria: 'X' }, FB)) ===
       JSON.stringify([FB[1].origem_id]))

  ok('refs repetidas não duplicam',
     resolverIds({ refs: [1, 1, 1], categoria: 'X' }, FB).length === 1)

  ok('uuid alucinado é descartado, cai no fallback',
     JSON.stringify(resolverIds({ feedback_ids: ['nao-existe'], categoria: 'Atendimento' }, FB)) ===
       JSON.stringify([FB[1].origem_id]))

  ok('ref como string ("2") funciona',
     JSON.stringify(resolverIds({ refs: ['2'], categoria: 'X' }, FB)) ===
       JSON.stringify([FB[1].origem_id]))

  ok('categoria inexistente e sem refs => vazio (não inventa vínculo)',
     resolverIds({ categoria: 'Estacionamento' }, FB).length === 0)
}

// --- réplica da lógica de sugerir-acoes -------------------------------------

function resolverInsight(
  acao: { ref?: unknown; insight_id?: unknown },
  insights: { id: string }[],
  solicitado: string | null,
): string | null {
  const ids = new Set(insights.map((i) => String(i.id)))
  const padrao = solicitado ?? insights[0]?.id ?? null

  const porRef = insights[Number(acao.ref) - 1]?.id
  if (porRef) return String(porRef)
  if (ids.has(String(acao.insight_id))) return String(acao.insight_id)
  return padrao ? String(padrao) : null
}

const INS = [{ id: 'ins-1' }, { id: 'ins-2' }]

{
  ok('ação com ref 2 => ins-2', resolverInsight({ ref: 2 }, INS, null) === 'ins-2')
  ok('ação sem ref => ancora no primeiro (mais prioritário)',
     resolverInsight({}, INS, null) === 'ins-1')
  ok('uuid alucinado => ancora no padrão, não vira null',
     resolverInsight({ insight_id: 'inventado' }, INS, null) === 'ins-1')
  ok('insight_id válido (formato antigo) é respeitado',
     resolverInsight({ insight_id: 'ins-2' }, INS, null) === 'ins-2')
  ok('modo "Criar Ação" respeita o insight pedido',
     resolverInsight({}, INS, 'ins-2') === 'ins-2')
  ok('sem insight nenhum => null (não inventa)',
     resolverInsight({}, [], null) === null)
}

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
