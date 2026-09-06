/**
 * Aviso imediato ao dono quando chega um feedback grave.
 *
 * Roda no caminho de ingresso, logo depois de o `vincular-feedback` decidir o
 * vínculo — é o único ponto que já tem o feedback recém-chegado em mãos.
 *
 * ## Detecta no PONTO, mas conta a partir do ORIGINAL
 *
 * A suspeita nasce do ponto (`feedbacks_restaurante`): ele é curto, já veio
 * classificado e é sobre um assunto só, então o léxico acerta mais nele do que
 * na mensagem inteira. Mas o que vai para o dono é a MENSAGEM ORIGINAL — quem
 * recebe "passei mal" às duas da manhã precisa do texto completo para saber o
 * que aconteceu, e o trecho sozinho não conta a história.
 *
 * ## Duas etapas para não gastar IA à toa nem alarmar errado
 *
 * O léxico (`gravidade.ts`) já separa risco sanitário e de segurança em G4 —
 * corpo estranho, intoxicação, agressão. Ele é grátis e instantâneo, e roda em
 * todo feedback. Só quando ele levanta a mão é que se paga UMA chamada de IA,
 * que lê a mensagem inteira e confirma.
 *
 * A confirmação existe porque o léxico casa por expressão e o contexto pode
 * inverter o sentido: "meu filho estava com medo de achar cabelo na comida,
 * mas estava tudo impecável" tem a expressão e não é urgência. Mandar o dono
 * correr para o restaurante por causa disso queima a confiança no aviso — e um
 * aviso em que não se confia deixa de ser lido, inclusive quando é real.
 */
import { chamarIA, ErroCota } from './openrouter.ts'
import { paramsDoAgente } from './params.ts'
import { carregarPrompts, montarPrompt } from './prompts.ts'
import { avaliarGravidade } from './gravidade.ts'

// deno-lint-ignore no-explicit-any
type Db = any

const AGENTE = 'triagem_urgencia'

const PROMPT = `Voce faz a triagem de um feedback que ACABOU de chegar num restaurante, para decidir se o dono precisa ser avisado AGORA, fora do horario, no celular dele.

## A mensagem inteira do cliente
"{original}"

## O trecho que levantou a suspeita
"{trecho}"

## O que o detector automatico marcou
{termos}

## O que conta como urgente
Coisa que faz o dono precisar agir HOJE, nao na proxima reuniao:
- alguem passou mal, vomitou, teve reacao alergica, foi parar no hospital
- corpo estranho na comida: cabelo, inseto, vidro, plastico, prego
- comida estragada, crua no meio, mofada, azeda
- praga no salao: barata, rato, mosca em quantidade
- agressao, assedio, racismo, homofobia, discriminacao
- ferimento do cliente no local
- fraude ou cobranca indevida grave

## O que NAO e urgente, por pior que pareca
- comida fria, demora, pedido errado, garcom sumido, preco
- sujeira comum de mesa ou banheiro, sem praga
- reclamacao generica de higiene sem fato concreto
- o cliente CITANDO que algo NAO aconteceu ("achei que teria cabelo, mas
  estava impecavel"), ou falando de outro lugar/outra vez
- ironia, brincadeira, exagero evidente

Na duvida, responda urgente=false. Um aviso falso no celular do dono ensina
ele a ignorar os proximos, inclusive os de verdade.

Se for urgente, escreva em "resumo" UMA frase, direta, do que aconteceu — e o
dono vai ler essa frase no WhatsApp.

Chame registrar_triagem.`

const SCHEMA = {
  type: 'object',
  properties: {
    urgente: { type: 'boolean' },
    resumo: { type: 'string', description: 'Uma frase do que aconteceu. Vazio quando nao e urgente.' },
    motivo: { type: 'string', description: 'Por que decidiu assim, em poucas palavras.' },
  },
  required: ['urgente'],
}

export interface ResultadoAlerta {
  urgente: boolean
  motivo: string
  enviado?: boolean
}

/**
 * Analisa o feedback e, se for grave, avisa o dono.
 *
 * Nunca lança: é chamada no caminho de ingresso de todo feedback, e uma falha
 * aqui não pode derrubar a classificação nem o vínculo, que são o serviço
 * principal.
 */
export async function talvezAlertarDono(
  db: Db,
  // deno-lint-ignore no-explicit-any
  fb: any,
  texto: string,
): Promise<ResultadoAlerta> {
  try {
    if (!fb.origem_id) return { urgente: false, motivo: 'ponto sem mensagem de origem' }

    // ── Etapa 1: o léxico, de graça ──
    const { G, termos } = avaliarGravidade(texto, fb.sentimento)
    if (G < 4) return { urgente: false, motivo: `gravidade ${G} pelo lexico` }

    // ── Etapa 2: a mensagem inteira e a confirmação da IA ──
    const { data: original } = await db
      .from('feedbacks_originais')
      .select('id, texto_original, created_at, telefone_cliente')
      .eq('id', fb.origem_id)
      .maybeSingle()

    const textoOriginal = (original?.texto_original || texto).trim()

    const triagem = await confirmarComIa(db, fb.restaurante_id, textoOriginal, texto, termos)
    if (!triagem.urgente) return { urgente: false, motivo: triagem.motivo }

    // ── Etapa 3: reservar o direito de avisar ──
    //
    // O insert vem ANTES do envio de propósito. A UNIQUE em
    // `feedback_original_id` é o que garante uma mensagem por atendimento
    // quando dois pontos graves da mesma mensagem chegam aqui em paralelo:
    // quem perder a corrida leva conflito e para aqui.
    const { data: reserva, error: erroReserva } = await db
      .from('alerta_urgente')
      .insert({
        restaurante_id: fb.restaurante_id,
        feedback_original_id: fb.origem_id,
        feedback_restaurante_id: fb.id,
        motivo: triagem.resumo || triagem.motivo,
        termos,
      })
      .select('id')
      .single()

    if (erroReserva || !reserva) {
      // 23505 = unique_violation: outro ponto da MESMA mensagem já avisou.
      const jaAvisado = String(erroReserva?.code) === '23505'
      return {
        urgente: true,
        motivo: jaAvisado ? 'a mesma mensagem já gerou aviso' : `falha ao registrar: ${erroReserva?.message}`,
        enviado: false,
      }
    }

    const enviado = await dispararWebhook(db, fb.restaurante_id, {
      alerta_id: reserva.id,
      resumo: triagem.resumo || 'Feedback grave recebido.',
      termos,
      texto_original: textoOriginal,
      trecho: texto,
      telefone_cliente: original?.telefone_cliente ?? null,
      recebido_em: original?.created_at ?? new Date().toISOString(),
    })

    return { urgente: true, motivo: triagem.resumo || triagem.motivo, enviado }
  } catch (err) {
    console.error('alerta-urgente:', err)
    return { urgente: false, motivo: 'erro na triagem' }
  }
}

async function confirmarComIa(
  db: Db,
  restauranteId: number,
  original: string,
  trecho: string,
  termos: string[],
): Promise<{ urgente: boolean; resumo: string; motivo: string }> {
  const params = await paramsDoAgente(db, AGENTE, { max_tokens: 300 })
  // Agente desligado no painel: o léxico já viu risco sanitário, e engolir o
  // aviso por causa de uma chave de configuração seria pior que um falso
  // positivo. Segue com o que o léxico afirma.
  if (!params) return { urgente: true, resumo: '', motivo: 'agente desativado; valendo o lexico' }

  try {
    const prompts = await carregarPrompts(db)
    const prompt = montarPrompt(prompts, 'ef_triagem_urgencia', PROMPT, {
      original,
      trecho,
      termos: termos.length ? termos.join(', ') : '(nenhum termo específico)',
    })

    const { result } = await chamarIA(db, {
      messages: [{ role: 'user', content: prompt }],
      params,
      origem: 'alerta-urgente',
      restauranteId,
      agenteId: AGENTE,
      calculadora: false,
      saida: {
        nome: 'registrar_triagem',
        descricao: 'Registra se o feedback exige avisar o dono agora.',
        schema: SCHEMA,
      },
    })

    return {
      urgente: result?.urgente === true,
      resumo: String(result?.resumo ?? ''),
      motivo: String(result?.motivo ?? ''),
    }
  } catch (err) {
    // Sem crédito ou IA fora do ar: o léxico viu G4, e deixar de avisar um
    // caso sanitário por falha de infraestrutura é o erro mais caro dos dois.
    if (err instanceof ErroCota) {
      return { urgente: true, resumo: '', motivo: 'sem crédito de IA; valendo o lexico' }
    }
    console.error('triagem de urgência falhou:', err)
    return { urgente: true, resumo: '', motivo: 'IA indisponível; valendo o lexico' }
  }
}

/**
 * Manda para o n8n tudo o que ele precisa para enviar a mensagem.
 *
 * O payload leva as credenciais do WhatsApp do próprio restaurante porque cada
 * um tem a sua instância — o n8n é o carteiro, não o dono do cadastro.
 */
async function dispararWebhook(
  db: Db,
  restauranteId: number,
  dados: Record<string, unknown>,
): Promise<boolean> {
  const marcar = async (campos: Record<string, unknown>) => {
    await db.from('alerta_urgente').update(campos).eq('id', dados.alerta_id)
  }

  const url = Deno.env.get('N8N_ALERTA_URGENTE')
  if (!url) {
    await marcar({ erro: 'N8N_ALERTA_URGENTE não configurada' })
    console.warn('N8N_ALERTA_URGENTE não configurada; alerta registrado sem envio')
    return false
  }

  const { data: r } = await db
    .from('restaurantes')
    .select('nome_restaurante, whatsapp_dono, whatsapp_token, whatsapp_base_url, numero_whatsapp')
    .eq('id', restauranteId)
    .maybeSingle()

  // Sem o número do dono não há para quem mandar. O alerta fica registrado com
  // o motivo, para a tela poder explicar por que nada chegou.
  if (!r?.whatsapp_dono) {
    await marcar({ erro: 'número do dono não configurado' })
    return false
  }

  try {
    const resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...dados,
        restaurante_id: restauranteId,
        nome_restaurante: r.nome_restaurante,
        whatsapp_dono: r.whatsapp_dono,
        whatsapp_token: r.whatsapp_token,
        whatsapp_base_url: r.whatsapp_base_url,
        numero_whatsapp: r.numero_whatsapp,
      }),
    })

    if (!resposta.ok) {
      await marcar({ erro: `n8n respondeu ${resposta.status}` })
      return false
    }
    await marcar({ enviado_em: new Date().toISOString(), erro: null })
    return true
  } catch (err) {
    await marcar({ erro: err instanceof Error ? err.message : String(err) })
    return false
  }
}
