/**
 * Guarda de escopo: a IA do produto atende restaurante e gestão do negócio.
 *
 * Esta é a camada barata, que roda ANTES de gastar token. A regra principal
 * está no system prompt (src/lib/prompts-sistema.ts); aqui só barramos o que é
 * inequivocamente off-topic, para o abuso não custar dinheiro.
 *
 * O critério é deliberadamente conservador: bloquear uma pergunta legítima do
 * dono é pior do que deixar passar uma duvidosa, porque o prompt ainda decide
 * em seguida. Na dúvida, libera.
 */

/** Temas sem nenhuma leitura razoável dentro de um restaurante. */
const FORA_DE_ESCOPO: RegExp[] = [
  // Política e eleições
  /\b(elei[çc][ãa]o|eleitoral|presidente da rep[úu]blica|deputad[oa]|senador|partido pol[íi]tico|voto em|candidat[oa] a)\b/i,
  // Entretenimento e esporte
  /\b(campeonato|copa do mundo|libertadores|brasileir[ãa]o|jogo do (flamengo|corinthians|palmeiras|s[ãa]o paulo)|novela|bbb|big brother|filme|s[ée]rie da netflix|videogame|playstation|xbox)\b/i,
  // Programação e TI (o produto não é ferramenta de dev)
  /\b(c[óo]digo (python|javascript|java|c\+\+)|fun[çc][ãa]o em (python|javascript)|regex|stack ?overflow|git (commit|push|merge)|docker|kubernetes)\b/i,
  // Saúde pessoal e diagnóstico
  /\b(sintomas? de|meu exame|rem[ée]dio para (dor|febre|ansiedade)|diagn[óo]stico|gravidez|depress[ãa]o)\b/i,
  // Escolar e acadêmico
  /\b(equa[çc][ãa]o de segundo grau|reda[çc][ãa]o do enem|vestibular|prova de matem[áa]tica|tabela peri[óo]dica)\b/i,
  // Relacionamento e vida pessoal
  /\b(minha (namorada|esposa|mulher|ex)|meu (namorado|marido|ex)|term(inei|inar) (o|um) relacionamento|horoscopo|hor[óo]scopo|signo)\b/i,
]

/**
 * Termos do negócio que dão passe livre. Cobrem o caso em que a pergunta cita
 * um assunto da lista acima mas aplicado ao restaurante — "posso passar o jogo
 * na TV do salão?", "cardápio para gestantes", "vale a pena abrir no dia da
 * eleição?" são perguntas legítimas de gestão.
 */
const DENTRO_DE_ESCOPO =
  /\b(restaurante|card[áa]pio|menu|cozinha|garç?om|gar[çc]ons|cliente|feedback|avalia[çc][ãa]o|insight|a[çc][ãa]o|delivery|mesa|sal[ãa]o|prato|bebida|vinho|drink|chef|cozinheir|equipe|funcion[áa]ri|fornecedor|estoque|ticket|fatur|receita|lucro|margem|pre[çc]o|custo|marketing|promo[çc][ãa]o|reserva|fila|espera|higiene|vigil[âa]ncia|anvisa|alvar[áa]|cnpj|nota fiscal|imposto|simples nacional|clt|contrata[çc][ãa]o|demiss[ãa]o|treinamento|ifood|rappi|delivery|balc[ãa]o|bar|padaria|pizzaria|lanchonete|neg[óo]cio|empresa|loja|gest[ãa]o)\b/i

export interface VeredictoEscopo {
  permitido: boolean
  motivo?: string
}

/**
 * Avalia a última mensagem do usuário.
 *
 * Mensagens curtas ("sim", "obrigado", "e agora?") passam direto: são turnos de
 * conversa que só fazem sentido no contexto anterior e não dá para julgar
 * isoladamente.
 */
export function avaliarEscopo(texto: string): VeredictoEscopo {
  const t = (texto || '').trim()
  if (t.length < 12) return { permitido: true }

  // Menção ao negócio vence qualquer palavra da lista de bloqueio.
  if (DENTRO_DE_ESCOPO.test(t)) return { permitido: true }

  for (const padrao of FORA_DE_ESCOPO) {
    if (padrao.test(t)) {
      return {
        permitido: false,
        motivo:
          'Sou o assistente do seu restaurante, então fico nos assuntos do negócio — atendimento, cardápio, equipe, custos, marketing, avaliações dos clientes. Me pergunte algo dessa área que eu ajudo.',
      }
    }
  }

  return { permitido: true }
}

/** Extrai o texto da última mensagem 'user' de um array no formato OpenAI. */
// deno-lint-ignore no-explicit-any
export function ultimaMensagemDoUsuario(messages: any[]): string {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role !== 'user') continue
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) {
      return m.content
        .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join(' ')
    }
  }
  return ''
}
