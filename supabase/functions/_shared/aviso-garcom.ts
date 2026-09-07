/**
 * Aviso ao GARÇOM quando uma abertura de QR faz ele cruzar um marco (%) de
 * uma meta de bonificação — mesma arquitetura de `alerta-urgente.ts`
 * (dedup por UNIQUE no banco, dois webhooks disparados em paralelo, payload
 * já mastigado pro n8n não precisar consultar nada).
 *
 * Chamada em fire-and-forget a partir de `qr-landing`, logo depois de
 * registrar a abertura — nunca pode atrasar a resposta pra quem escaneou o
 * QR, e uma falha aqui não pode derrubar a página do cliente.
 *
 * ## Um garçom, uma mensagem — mesmo com várias regras batendo junto
 *
 * Um restaurante pode ter mais de uma regra de bonificação rodando ao mesmo
 * tempo (ex.: meta semanal + meta mensal, as duas valendo pra todo mundo).
 * Se uma abertura fizer as duas cruzarem um marco no mesmo instante, mandar
 * DOIS WhatsApp separados pro garçom em sequência é ruído — parece bug, não
 * comemoração. Por isso a reserva (INSERT com dedup) roda por marco, regra a
 * regra, mas o ENVIO é feito uma vez só no fim, juntando tudo que foi
 * conquistado nessa mesma abertura numa única mensagem/webhook.
 */
import {
  marcosAtingidos,
  avancarPeriodo,
  garcomParticipaDaRegra,
  type RegraPeriodo,
} from './marcos-bonificacao.ts'

// deno-lint-ignore no-explicit-any
type Db = any

interface RegraBonificacao extends RegraPeriodo {
  id: string
  nome?: string
  ativa: boolean
  apagada?: boolean
  meta_escaneamentos: number
  dias_personalizados?: number
  renovar_automatico: boolean
  periodo_inicio: string | null
  premio?: string
  garcons_participantes: number[] | null
}

interface Conquista {
  marcoId: number
  regra: RegraBonificacao
  marco: number
  contagemDepois: number
}

/**
 * Nunca lança: é chamada fire-and-forget a partir do caminho de leitura
 * pública do QR, e um erro aqui não pode aparecer pro cliente que escaneou.
 */
export async function talvezAvisarGarcom(
  db: Db,
  qr: { id: number; garcom_id: number | null; restaurante_id: number },
): Promise<void> {
  if (!qr.garcom_id) return
  try {
    const [{ data: garcom }, { data: rest }] = await Promise.all([
      db.from('garcons').select('id, nome_garcon, telefone, ativo').eq('id', qr.garcom_id).maybeSingle(),
      db.from('restaurantes').select('nome_restaurante, config_bonificacao, whatsapp_token, whatsapp_base_url').eq('id', qr.restaurante_id).maybeSingle(),
    ])
    if (!garcom || !garcom.ativo || !rest) return

    const regras = (Array.isArray(rest.config_bonificacao) ? rest.config_bonificacao : []) as RegraBonificacao[]
    const aplicaveis = regras.filter((r) =>
      r.ativa && !r.apagada && r.periodo_inicio && r.meta_escaneamentos > 0
      && garcomParticipaDaRegra(r.garcons_participantes, garcom.id),
    )
    if (aplicaveis.length === 0) return

    const { data: qrsDoGarcom } = await db
      .from('qr_codes')
      .select('id')
      .eq('restaurante_id', qr.restaurante_id)
      .eq('garcom_id', garcom.id)
    // deno-lint-ignore no-explicit-any
    const idsQr = (qrsDoGarcom ?? []).map((q: any) => q.id)
    if (idsQr.length === 0) return

    // Reserva TODOS os marcos batidos, em TODAS as regras aplicáveis, ANTES
    // de decidir como avisar — junta tudo que sobrar numa mensagem só.
    const conquistas: Conquista[] = []

    for (const regra of aplicaveis) {
      const inicio = regra.periodo_inicio as string
      // `renovar_automatico`: sem fim fixo, conta pra sempre a partir do
      // início (mesma leitura de `contarGarconsPendentes`). Só as regras de
      // data personalizada (`renovar_automatico: false`) têm fim.
      const fim = regra.renovar_automatico ? null : avancarPeriodo(new Date(inicio), regra).toISOString()

      let consulta = db
        .from('qr_scans')
        .select('id', { count: 'exact', head: true })
        .in('qr_code_id', idsQr)
        .gte('scanned_at', inicio)
      if (fim) consulta = consulta.lt('scanned_at', fim)
      const { count } = await consulta
      const contagemDepois = count ?? 0

      // Verifica TODOS os marcos já atingidos, não só "o que cruzou agora"
      // (ver o comentário de `marcosAtingidos`) — quem decide se já foi
      // avisado ou não é a tentativa de INSERT logo abaixo, protegida pela
      // UNIQUE do banco.
      const atingidos = marcosAtingidos(regra.meta_escaneamentos, contagemDepois)
      for (const marco of atingidos) {
        const { data: reserva, error } = await db
          .from('bonificacao_marco')
          .insert({
            restaurante_id: qr.restaurante_id,
            garcom_id: garcom.id,
            regra_id: regra.id,
            periodo_inicio: regra.periodo_inicio,
            marco,
          })
          .select('id')
          .single()
        // 23505 (já avisado) ou outra requisição concorrente ganhou a
        // corrida: não entra na lista, e não é erro.
        if (error || !reserva) continue
        conquistas.push({ marcoId: reserva.id, regra, marco, contagemDepois })
      }
    }

    if (conquistas.length === 0) return
    await avisarConquistas(db, { restauranteId: qr.restaurante_id, garcom, rest, conquistas })
  } catch (err) {
    console.error('aviso-garcom:', err)
  }
}

function rotuloMeta(regra: RegraBonificacao): string {
  return regra.nome?.trim() || `meta de ${regra.meta_escaneamentos} aberturas`
}

/** Texto pronto pra mandar como está — o n8n pode usar direto ou passar por
 *  uma IA de redação, mas já sai funcionando sem montar nada. Uma conquista
 *  só usa o tom de sempre; duas ou mais viram uma lista numa mensagem só. */
function montarMensagem(nomeGarcom: string, conquistas: Conquista[]): string {
  const linha = ({ regra, marco, contagemDepois }: Conquista) => {
    const faltam = Math.max(0, regra.meta_escaneamentos - contagemDepois)
    const premio = regra.premio?.trim() || null
    return { marco, faltam, premio, rotulo: rotuloMeta(regra) }
  }

  if (conquistas.length === 1) {
    const { marco, faltam, premio, rotulo } = linha(conquistas[0])
    return marco >= 100
      ? `🎉 ${nomeGarcom}, você bateu 100% da ${rotulo}! ${premio ? `O prêmio "${premio}" é seu.` : 'O bônus é seu.'} Fala com o gerente pra confirmar.`
      : `${nomeGarcom}, você já bateu ${marco}% da ${rotulo}! Faltam só ${faltam} pra garantir${premio ? ` ${premio}` : ' o bônus'}. Continue assim! 🚀`
  }

  const linhas = conquistas.map((c) => {
    const { marco, faltam, premio, rotulo } = linha(c)
    return marco >= 100
      ? `🎉 100% da ${rotulo}${premio ? ` — ${premio} garantido!` : ' — bônus garantido!'}`
      : `🎯 ${marco}% da ${rotulo} — faltam ${faltam}`
  })
  return [`${nomeGarcom}, você bateu mais de um marco agora:`, ...linhas, 'Continue assim! 🚀'].join('\n')
}

async function avisarConquistas(
  db: Db,
  opts: {
    restauranteId: number
    // deno-lint-ignore no-explicit-any
    garcom: any
    // deno-lint-ignore no-explicit-any
    rest: any
    conquistas: Conquista[]
  },
) {
  const { restauranteId, garcom, rest, conquistas } = opts

  const marcos = conquistas.map(({ marcoId, regra, marco, contagemDepois }) => ({
    marco_id: marcoId,
    regra_id: regra.id,
    nome_regra: regra.nome?.trim() || null,
    meta_escaneamentos: regra.meta_escaneamentos,
    frequencia: regra.frequencia,
    premio: regra.premio?.trim() || null,
    periodo_inicio: regra.periodo_inicio,
    marco_atingido: marco,
    contagem_atual: contagemDepois,
    faltam: Math.max(0, regra.meta_escaneamentos - contagemDepois),
  }))

  const payload = {
    restaurante_id: restauranteId,
    nome_restaurante: rest.nome_restaurante,

    garcom_id: garcom.id,
    nome_garcom: garcom.nome_garcon,
    telefone_garcom: garcom.telefone,

    marcos,
    mensagem_sugerida: montarMensagem(garcom.nome_garcon, conquistas),

    whatsapp_token: rest.whatsapp_token,
    whatsapp_base_url: rest.whatsapp_base_url,
  }

  const ids = conquistas.map((c) => c.marcoId)
  const enviado = await dispararWebhook(db, ids, payload)
  const resumo = conquistas.map((c) => `${c.marco}% (${c.regra.nome?.trim() || c.regra.id.slice(0, 8)})`).join(', ')
  console.log(`[bonificacao] garcom ${garcom.id} (${garcom.nome_garcon}): ${resumo} (enviado=${enviado})`)
}

/**
 * Payload enviado ao n8n:
 *
 *   {
 *     restaurante_id, nome_restaurante,
 *     garcom_id, nome_garcom, telefone_garcom,
 *
 *     marcos: [                  // um item por regra batida NESTA abertura —
 *       {                        // normalmente 1, pode ser mais de 1
 *         marco_id, regra_id, nome_regra,
 *         meta_escaneamentos, frequencia, premio, periodo_inicio,
 *         marco_atingido,        // 100, 90, 75, 50 ou 25
 *         contagem_atual,        // aberturas já feitas NESTE período
 *         faltam,                // quantas faltam pra fechar a meta
 *       },
 *       ...
 *     ],
 *
 *     mensagem_sugerida,         // texto PRONTO pra mandar, já juntando
 *                                // todos os itens de `marcos` numa mensagem
 *                                // só (nunca manda um WhatsApp por regra)
 *
 *     whatsapp_token, whatsapp_base_url,   // credenciais da instância do restaurante
 *   }
 *
 * Sem `whatsapp_dono` aqui de propósito — quem recebe esta mensagem é o
 * GARÇOM, não o dono. `telefone_garcom` já vem no formato que o cadastro de
 * garçons usa (ver `WhatsAppTab`/`Onboarding` para o padrão de prefixo 55).
 *
 * Dois destinos, mesmo raciocínio de `alerta-urgente.ts`:
 * `N8N_BONIFICACAO_GARCOM` (produção) decide `enviado_em`/`erro`;
 * `N8N_BONIFICACAO_GARCOM_TESTE` (`/webhook-test/...`) só serve de apoio
 * enquanto o fluxo é editado no n8n, e uma falha nela nunca vira `erro`.
 */
async function dispararWebhook(db: Db, marcoIds: number[], payload: Record<string, unknown>): Promise<boolean> {
  const marcar = async (campos: Record<string, unknown>) => {
    await db.from('bonificacao_marco').update(campos).in('id', marcoIds)
  }

  const urlProducao = Deno.env.get('N8N_BONIFICACAO_GARCOM')
  const urlTeste = Deno.env.get('N8N_BONIFICACAO_GARCOM_TESTE')

  if (!urlProducao) {
    await marcar({ erro: 'N8N_BONIFICACAO_GARCOM não configurada' })
    console.warn('N8N_BONIFICACAO_GARCOM não configurada; marco registrado sem envio')
    return false
  }

  const corpo = JSON.stringify(payload)
  const chamar = (url: string) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo })

  const [producao] = await Promise.all([
    chamar(urlProducao)
      .then((resposta) => ({ ok: resposta.ok, status: resposta.status }))
      .catch((err) => ({ ok: false, status: 0, erro: err instanceof Error ? err.message : String(err) })),
    urlTeste
      ? chamar(urlTeste)
          .then((resposta) => {
            if (!resposta.ok) console.warn(`[bonificacao] webhook de TESTE respondeu ${resposta.status}`)
          })
          .catch((err) => console.warn('[bonificacao] webhook de TESTE falhou:', err))
      : Promise.resolve(),
  ])

  if (!producao.ok) {
    const motivo = 'erro' in producao ? producao.erro : `n8n respondeu ${producao.status}`
    await marcar({ erro: motivo })
    return false
  }
  await marcar({ enviado_em: new Date().toISOString(), erro: null })
  return true
}
