import { enviarMensagem, enviarMensagemComFontes } from '@/lib/openrouter'
import { CAMPOS_CONFIG, anexarTextoLivre } from '@/lib/queries/config-update'
import { AcaoAgente, validarAcao } from '@/lib/queries/agente-ia'
import { Comando } from './comandos'
import { montarPrompt } from './prompt-store'
import { paramsDoAgente } from './params'

/**
 * Time de agentes especializados.
 *
 * A ideia central: um único prompt gigante tentando fazer tudo erra muito —
 * foi o que aconteceu com a leitura de arquivos e com a detecção de alterações.
 * Aqui cada agente tem UMA responsabilidade, e só recebe o que precisa.
 *
 * MEMÓRIA (o que cada um enxerga):
 * - Documentos e Rotulador: SEM memória. Recebem só o material da vez, então
 *   não têm como confundir com arquivos ou assuntos de mensagens anteriores.
 * - Roteador: memória curta (a mensagem e a última resposta).
 * - Escritores (ação/insight/config): SEM memória de conversa; recebem o pedido
 *   e o estado atual do sistema.
 * - Redator final: COM memória (fica no use-chat, é quem conversa).
 */

const JSON_OPTS = { response_format: { type: 'json_object' as const }, temperature: 0 }

function parse(res: unknown): any {
  try {
    return typeof res === 'string' ? JSON.parse(res.replace(/^```(?:json)?|```$/g, '').trim()) : res
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AGENTE DE DOCUMENTOS — sem memória
// ─────────────────────────────────────────────────────────────────────────────

export interface AnaliseArquivo {
  nome: string
  tipo: string
  resumo: string
  pontos: string[]
  /** Marca quando a leitura falhou, para o redator não inventar. */
  erro?: string
}

/**
 * Lê UM arquivo isolado. Sem histórico, sem outros arquivos no contexto —
 * é isso que impede a IA de misturar com o que veio antes.
 */
async function analisarUm(nome: string, texto: string): Promise<AnaliseArquivo> {
  const base: AnaliseArquivo = { nome, tipo: 'documento', resumo: '', pontos: [] }
  try {
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: montarPrompt('ag_documentos', `Você lê UM documento e resume o conteúdo dele. Você não tem histórico de
conversa e não conhece nenhum outro arquivo: descreva SOMENTE o que está no texto abaixo.

Nome do arquivo: "${nome}"

Conteúdo:
"""
${texto.slice(0, 18000)}
"""

Responda APENAS com este JSON:
{ "tipo": "que tipo de documento é (relatório, cardápio, contrato, manual...)",
  "resumo": "2 a 4 frases sobre o que este documento contém",
  "pontos": ["fato concreto 1", "fato concreto 2", "fato concreto 3"] }

Os "pontos" devem trazer números, nomes e datas que estejam no texto. Máximo 6.
Não invente nada que não esteja no documento. Português do Brasil.`, { nome, conteudo: texto.slice(0, 18000) }),
        },
        { role: 'user', content: 'Analise e responda no formato JSON pedido.' },
      ],
      paramsDoAgente('documentos', { ...JSON_OPTS, max_tokens: 800 }),
      'documentos',
    )
    const d = parse(res)
    if (!d) return { ...base, erro: 'não consegui interpretar o conteúdo' }
    return {
      nome,
      tipo: String(d.tipo || 'documento'),
      resumo: String(d.resumo || ''),
      pontos: Array.isArray(d.pontos) ? d.pontos.map(String).slice(0, 6) : [],
    }
  } catch (e: any) {
    return { ...base, erro: e?.message || 'falha ao ler' }
  }
}

/** Analisa vários arquivos em paralelo, cada um isolado do outro. */
export async function analisarDocumentos(
  arquivos: { nome: string; texto?: string }[],
): Promise<AnaliseArquivo[]> {
  const comTexto = arquivos.filter((a) => (a.texto || '').trim().length > 20)
  if (!comTexto.length) return []
  return Promise.all(comTexto.map((a) => analisarUm(a.nome, a.texto!)))
}

/** Monta o bloco de contexto com as análises — separadas e identificadas. */
export function blocoDeAnalises(
  atuais: AnaliseArquivo[],
  anteriores: AnaliseArquivo[],
): string {
  const formatar = (a: AnaliseArquivo) =>
    a.erro
      ? `• ${a.nome}: não foi possível ler (${a.erro})`
      : `• ${a.nome} (${a.tipo})\n  ${a.resumo}\n${a.pontos.map((p) => `  - ${p}`).join('\n')}`

  let txt = ''
  if (atuais.length) {
    txt += `ARQUIVOS DESTA MENSAGEM (é sobre estes que o dono está falando agora):\n${atuais
      .map(formatar)
      .join('\n\n')}`
  }
  if (anteriores.length) {
    txt += `${txt ? '\n\n' : ''}ARQUIVOS DE MENSAGENS ANTERIORES (só use se ele pedir explicitamente, citando o nome):\n${anteriores
      .map((a) => `• ${a.nome} (${a.tipo}) — ${a.resumo}`)
      .join('\n')}`
  }
  if (txt) {
    txt += `\n\nREGRAS: cada arquivo é independente, não misture o conteúdo de um com o do
outro. Ao citar uma informação, diga de qual arquivo ela veio. Se o dono não citar
um arquivo antigo, responda apenas sobre os desta mensagem.`
  }
  return txt
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AGENTE DE PESQUISA — sem memória
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoPesquisa {
  resumo: string
  fontes: { url: string; titulo: string }[]
}

/**
 * Pesquisa e devolve os FATOS apurados, não a resposta final. Quem conversa
 * com o dono é o redator — assim a voz do assistente não muda.
 */
export async function pesquisarNaWeb(termos: string): Promise<ResultadoPesquisa | null> {
  if (!termos.trim()) return null
  try {
    const { texto, fontes } = await enviarMensagemComFontes(
      [
        {
          role: 'system',
          content: `Pesquise e relate os fatos encontrados sobre o tema pedido, em português do Brasil.
Escreva em tópicos curtos e objetivos, com números e datas quando houver.
Não converse, não cumprimente, não dê conselhos: só os fatos apurados.
Se não encontrar nada confiável, diga isso em uma linha.`,
        },
        { role: 'user', content: termos },
      ],
      { ...paramsDoAgente('pesquisa_web', { max_tokens: 700, temperature: 0 }), web: true },
      'pesquisa_web',
    )
    return { resumo: texto, fontes }
  } catch {
    return null
  }
}

/** Lê uma página específica e resume — reaproveita o agente de documentos. */
export async function lerPaginaWeb(
  url: string,
  buscarPagina: (u: string) => Promise<{ ok: boolean; titulo?: string; texto?: string; motivo?: string }>,
): Promise<ResultadoPesquisa | null> {
  try {
    const pagina = await buscarPagina(url)
    if (!pagina.ok || !pagina.texto) return null
    const analise = await analisarDocumentos([{ nome: pagina.titulo || url, texto: pagina.texto }])
    if (!analise.length) return null
    const a = analise[0]
    return {
      resumo: `${a.resumo}\n${a.pontos.map((p) => `- ${p}`).join('\n')}`,
      fontes: [{ url, titulo: pagina.titulo || url }],
    }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AGENTE DE CONHECIMENTO — sem memória
// ─────────────────────────────────────────────────────────────────────────────

export interface TrechoConhecimento {
  conteudo: string
  titulo: string
}

/**
 * A busca vetorial traz trechos aproximados, e vários não servem. Este agente
 * lê o que voltou e fica só com o que responde de fato — antes, trechos fora
 * do assunto iam direto para o prompt e atrapalhavam a resposta.
 */
export async function curarConhecimento(
  pergunta: string,
  trechos: TrechoConhecimento[],
): Promise<string> {
  if (!trechos.length) return ''
  try {
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: `Você seleciona material de apoio. A busca trouxe trechos por semelhança e
alguns não têm relação com a pergunta.

Pergunta: "${pergunta}"

Trechos:
${trechos.map((t, i) => `[${i}] (${t.titulo})\n${t.conteudo}`).join('\n\n')}

Responda APENAS com este JSON:
{ "uteis": [índices dos trechos que realmente ajudam a responder, do melhor para o pior] }

Seja rigoroso: se um trecho é só vagamente parecido, deixe de fora.
Se nenhum servir, devolva { "uteis": [] }.`,
        },
        { role: 'user', content: 'Selecione e responda no formato JSON pedido.' },
      ],
      paramsDoAgente('curador', { ...JSON_OPTS, max_tokens: 150 }),
      'curador',
    )
    const d = parse(res)
    const indices: number[] = Array.isArray(d?.uteis) ? d.uteis : []
    const escolhidos = indices
      .map((i) => trechos[i])
      .filter(Boolean)
      .slice(0, 4)
    if (!escolhidos.length) return ''
    return escolhidos
      .map((t, i) => `[${i + 1}] (${t.titulo})\n"${t.conteudo}"`)
      .join('\n\n')
  } catch {
    // Sem curadoria, é melhor mandar os melhores do que não mandar nada
    return trechos
      .slice(0, 3)
      .map((t, i) => `[${i + 1}] (${t.titulo})\n"${t.conteudo}"`)
      .join('\n\n')
  }
}

/** Decide campo + valor de uma mudança no perfil. */
export async function montarConfig(
  pedido: string,
  configAtual: Record<string, unknown>,
): Promise<AcaoAgente | null> {
  try {
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: montarPrompt('ag_montar_config', `O dono disse algo que pode mudar um dado do perfil.

Campos (chave = significado):
${Object.entries(CAMPOS_CONFIG).map(([k, v]) => `- ${k} = ${v}`).join('\n')}

Valores atuais: ${JSON.stringify(configAtual)}
Frase dele: "${pedido}"

JSON: { "campo": "<chave exata ou null>", "valor": "<novo valor>" }

Devolva o campo quando ele informar ou mandar mudar um valor.
Devolva null se for pergunta, ou se o valor for igual ao atual, ou se nada corresponder.`, { campos: Object.entries(CAMPOS_CONFIG).map(([k, v]) => `- ${k} = ${v}`).join('\n'), configAtual: JSON.stringify(configAtual), pedido }),
        },
        { role: 'user', content: 'Responda no formato JSON pedido.' },
      ],
      paramsDoAgente('montar_config', { ...JSON_OPTS, max_tokens: 200 }),
      'montar_config',
    )
    const d = parse(res)
    // O "|" é o separador de comando: se vazar para o valor ("raverzão|raver"),
    // fica um valor sujo. Pega o último segmento limpo — normalmente o pretendido.
    const valor = String(d?.valor ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .pop() || ''
    if (!d?.campo || !valor) return null
    const a: AcaoAgente = {
      tipo: 'atualizar_config',
      dados: { campo: d.campo, valor },
      descricao: `Atualizar ${CAMPOS_CONFIG[d.campo] || d.campo} para "${valor}"`,
    }
    return validarAcao(a) ? null : a
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. DESPACHANTE — recebe o comando da IA principal e chama o especialista certo
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextoComando {
  configAtual: Record<string, unknown>
}

export interface ResultadoComando {
  /** Alteração montada pelo especialista, pronta para confirmar ou aplicar. */
  acao: AcaoAgente | null
}

/**
 * A IA principal decidiu agir e emitiu um comando; aqui o sistema chama o
 * especialista daquele tipo, carregado só com o que precisa. Cada caso é UMA
 * responsabilidade — nenhum especialista decide "o quê", só executa a sua parte.
 */
export async function despacharOperacao(
  cmd: Comando,
  ctx: ContextoComando,
): Promise<ResultadoComando> {
  const so = (acao: AcaoAgente | null): ResultadoComando => ({ acao })
  switch (cmd.tipo) {
    case 'mudar_config':
      return so(await montarConfig(cmd.arg, ctx.configAtual))
    case 'anotar':
      return so({
        tipo: 'criar_anotacao',
        dados: { fato: cmd.arg.slice(0, 300), categoria: 'geral' },
        descricao: 'Guardar esta informação',
      })
    default:
      return so(null)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. NARRADOR — conta ao dono o que o sistema fez, SEM inventar nada
// ─────────────────────────────────────────────────────────────────────────────

/** Relatório fiel dos campos que o especialista montou — a fonte da narração. */
export function relatorioDaAcao(acao: AcaoAgente): string {
  const d = (acao.dados || {}) as Record<string, any>
  const rotulos: Record<string, string> = {
    titulo_acao: 'Título', titulo: 'Título', plano_detalhado: 'Plano',
    descricao: 'Descrição', sugestao: 'Sugestão', prioridade: 'Prioridade',
    categoria: 'Categoria', status: 'Situação', valor: 'Novo valor', fato: 'Anotação',
  }
  const linhas = [acao.descricao]
  for (const [k, label] of Object.entries(rotulos)) {
    const v = d[k]
    if (v != null && String(v).trim()) linhas.push(`${label}: ${v}`)
  }
  return linhas.join('\n')
}

/** Texto determinístico de reserva, caso a narração por IA falhe. */
function narracaoReserva(descricao: string, situacao: Situacao): string {
  if (situacao === 'aplicado') return `Pronto! ${descricao}. Se quiser, dá para desfazer.`
  if (situacao === 'falhou') return 'Não consegui concluir agora. Pode me dar um pouco mais de detalhe?'
  return `Preparei: ${descricao}. Confira e confirme aqui embaixo.`
}

export type Situacao = 'preparado' | 'aplicado' | 'falhou'

/**
 * A IA principal narra o resultado — mas vê SÓ o relatório do sistema, então
 * não tem de onde inventar. Se o modelo falhar, cai no texto de reserva.
 */
export async function narrarOperacao(
  nome: string,
  relatorio: string,
  descricao: string,
  situacao: Situacao,
): Promise<string> {
  const instr =
    situacao === 'preparado'
      ? 'Isto está PREPARADO para o dono confirmar (ainda NÃO foi aplicado). Diga o que você preparou e que ele pode conferir e confirmar logo abaixo.'
      : situacao === 'aplicado'
        ? 'Isto JÁ foi aplicado no sistema. Avise que está feito e que ele pode desfazer se quiser.'
        : 'A alteração NÃO pôde ser feita. Explique com gentileza e peça, em uma frase, o que faltou.'
  try {
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: montarPrompt('ag_narrador', `Você é o ${nome}, assistente do painel de um restaurante. O sistema executou
uma tarefa que o dono pediu e te passou o resultado. Escreva a resposta para o dono em
1 ou 2 frases curtas, naturais e diretas, em português do Brasil.

RESULTADO DO SISTEMA (é a única verdade — não acrescente nada que não esteja aqui,
não invente números, nomes, prazos nem detalhes):
"""
${relatorio}
"""

${instr}

Não use listas nem títulos. Não se apresente, não repita seu nome e não chame o leitor
de "dono". Não devolva o resultado em formato técnico: fale como uma pessoa avisando,
naturalmente, mencionando só o que está no resultado.`, { nome, relatorio, instr }),
        },
        { role: 'user', content: 'Escreva a resposta para o dono.' },
      ],
      paramsDoAgente('narrador', { temperature: 0.3, max_tokens: 200 }),
      'narrador',
    )
    const txt = (typeof res === 'string' ? res : '').trim()
    return txt || narracaoReserva(descricao, situacao)
  } catch {
    return narracaoReserva(descricao, situacao)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. PERSISTÊNCIA DE FATOS — guarda o que o dono afirma, em segundo plano
// ─────────────────────────────────────────────────────────────────────────────

type AcaoPersistencia =
  | { tipo: 'livre_restaurante'; valor: string }
  | { tipo: 'livre_perfil'; valor: string }

/**
 * Agente de UMA tarefa: achar FATOS que o dono AFIRMA e que NÃO cabem num campo
 * estruturado (esses o comando mudar_config já resolve), para anotar no texto
 * livre — do restaurante ou do perfil pessoal. Conservador: ignora perguntas,
 * hipóteses, opiniões e comandos. Não mexe em campos estruturados.
 */
export async function persistirInformacao(
  mensagem: string,
): Promise<AcaoPersistencia[]> {
  if (!mensagem.trim()) return []
  const lista = Object.entries(CAMPOS_CONFIG)
    .filter(([k]) => k !== 'detalhes')
    .map(([, rotulo]) => rotulo)
    .join(', ')
  try {
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: `Sua única tarefa: achar FATOS que o dono AFIRMA agora sobre ELE mesmo ou sobre
o RESTAURANTE e que valham a pena anotar. Não responda ao dono, só classifique.

Mensagem do dono: "${mensagem}"

JÁ EXISTEM campos próprios para estes dados (NÃO os inclua — outro sistema cuida deles):
${lista}.

REGRAS (siga à risca):
- Só considere fatos AFIRMADOS como verdade agora. IGNORE perguntas, hipóteses
  ("imagina se..."), desejos, opiniões, ordens/comandos ("muda para...", "cria...") e
  generalidades que não sejam deste dono/restaurante.
- Anote SOMENTE fatos que NÃO cabem nos campos listados acima — histórias, contexto,
  conquistas, detalhes pessoais. Se o fato é um daqueles campos, NÃO o inclua aqui.
- "livre_restaurante" = sobre o restaurante; "livre_perfil" = sobre o dono como pessoa.
- NUNCA invente. Se não há nada a anotar: {"acoes":[]}.

Responda APENAS com este JSON:
{ "acoes": [ { "tipo": "livre_restaurante"|"livre_perfil", "valor": "<a anotação, curta e em 3a pessoa>" } ] }

EXEMPLOS:
"meu avô abriu o restaurante pra alimentar os soldados" -> {"acoes":[{"tipo":"livre_restaurante","valor":"Fundado pelo avô do dono para alimentar os soldados."}]}
"ganhamos o prêmio de melhor hambúrguer em 2023" -> {"acoes":[{"tipo":"livre_restaurante","valor":"Ganhou o prêmio de melhor hambúrguer da cidade em 2023."}]}
"eu sou formado em administração" -> {"acoes":[{"tipo":"livre_perfil","valor":"O dono é formado em administração."}]}
"agora são 30 mesas" -> {"acoes":[]}   (é um campo próprio, não anote aqui)
"somos uma churrascaria" -> {"acoes":[]}   (é um campo próprio)
"quantas mesas eu tenho?" -> {"acoes":[]}
"muda o horário para 10h" -> {"acoes":[]}`,
        },
        { role: 'user', content: 'Classifique e responda no formato JSON pedido.' },
      ],
      paramsDoAgente('persistir', { ...JSON_OPTS, max_tokens: 400 }),
      'persistir',
    )
    const d = parse(res)
    const acoes: any[] = Array.isArray(d?.acoes) ? d.acoes : []
    const validas: AcaoPersistencia[] = []
    for (const a of acoes) {
      const valor = String(a?.valor || '').trim()
      if (valor.length < 2) continue
      if (a?.tipo === 'livre_restaurante') validas.push({ tipo: 'livre_restaurante', valor })
      else if (a?.tipo === 'livre_perfil') validas.push({ tipo: 'livre_perfil', valor })
    }
    return validas.slice(0, 4)
  } catch {
    return []
  }
}

/**
 * Roda o agente e anota os fatos no texto livre, em segundo plano. Nunca lança:
 * falhar aqui não pode atrapalhar a conversa. Não toca em campos estruturados —
 * esses são responsabilidade do comando mudar_config.
 */
export async function persistirEmBackground(
  restauranteId: number | null,
  mensagem: string,
): Promise<void> {
  if (!restauranteId) return
  try {
    const acoes = await persistirInformacao(mensagem)
    for (const a of acoes) {
      try {
        await anexarTextoLivre(
          restauranteId,
          a.tipo === 'livre_perfil' ? 'perfil_notas' : 'detalhes',
          a.valor,
        )
      } catch {
        /* uma gravação falhar não interrompe as outras */
      }
    }
  } catch {
    /* silencioso: é trabalho de bastidor */
  }
}
