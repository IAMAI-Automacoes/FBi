import { enviarMensagem, enviarMensagemComFontes } from '@/lib/openrouter'
import { CAMPOS_CONFIG, atualizarCampoConfig, anexarTextoLivre } from '@/lib/queries/config-update'
import { AcaoAgente, FormularioIA, validarAcao } from '@/lib/queries/agente-ia'
import { Comando } from './comandos'

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
          content: `Você lê UM documento e resume o conteúdo dele. Você não tem histórico de
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
Não invente nada que não esteja no documento. Português do Brasil.`,
        },
        { role: 'user', content: 'Analise e responda no formato JSON pedido.' },
      ],
      { ...JSON_OPTS, max_tokens: 800 },
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
      { web: true, max_tokens: 700, temperature: 0 },
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
      { ...JSON_OPTS, max_tokens: 150 },
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

// ─────────────────────────────────────────────────────────────────────────────
// 6. AGENTES ESCRITORES — sem memória de conversa
// ─────────────────────────────────────────────────────────────────────────────

/** Monta os campos de uma ação nova a partir do pedido. */
export async function montarAcao(pedido: string): Promise<AcaoAgente | null> {
  try {
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: `Você monta os campos de UMA ação operacional de restaurante. Só isso.
Assunto da ação: "${pedido}"

JSON: { "titulo_acao": "curto, direto ao ponto do assunto",
"plano_detalhado": "passos práticos para resolver ESSE assunto",
"prioridade": "URGENTE|IMPORTANTE|OBSERVACAO", "categoria": "Servico|Comida|Ambiente|Preco|Agilidade|Geral",
"status": "PENDENTE" }

Fique estritamente no assunto acima — não invente outro tema nem fale do sistema/chat.
Sem prioridade dita, use IMPORTANTE. Português do Brasil. Nunca deixe campo vazio.`,
        },
        { role: 'user', content: 'Monte no formato JSON pedido.' },
      ],
      { ...JSON_OPTS, max_tokens: 500 },
    )
    const d = parse(res)
    if (!d?.titulo_acao) return null
    const a: AcaoAgente = {
      tipo: 'criar_acao',
      dados: d,
      descricao: `Criar a ação "${d.titulo_acao}"`,
    }
    return validarAcao(a) ? null : a
  } catch {
    return null
  }
}

/**
 * Agente de UMA tarefa: existe um assunto concreto no pedido de criar?
 * Separado da montagem para não inventar assunto quando não há (era o que
 * fazia a IA criar "ação sobre formulários" a partir de um pedido meta).
 */
export async function extrairAssunto(
  tipo: 'acao' | 'insight',
  pedido: string,
): Promise<{ temAssunto: boolean; assunto: string }> {
  try {
    const alvo = tipo === 'acao' ? 'uma AÇÃO operacional' : 'um INSIGHT'
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: `O dono pediu para criar ${alvo}. Sua única tarefa: dizer se o pedido já
contém um ASSUNTO CONCRETO — um problema, tarefa ou tema real do restaurante.

Pedido: "${pedido}"

Responda APENAS com este JSON:
{ "temAssunto": true|false, "assunto": "o tema, em poucas palavras" }

temAssunto = false quando o pedido:
- é genérico ("crie uma ação", "cria um insight", "faz uma tarefa");
- é meta ou sobre o próprio sistema ("faça aparecer o formulário", "me mostra um exemplo");
- não descreve nada concreto do restaurante.

NUNCA invente um assunto. Se não houver um assunto real e específico no pedido,
temAssunto é false e "assunto" fica vazio.`,
        },
        { role: 'user', content: 'Responda no formato JSON pedido.' },
      ],
      { ...JSON_OPTS, max_tokens: 120 },
    )
    const d = parse(res)
    const assunto = String(d?.assunto || '').trim()
    return { temAssunto: !!d?.temAssunto && assunto.length > 2, assunto }
  } catch {
    return { temAssunto: false, assunto: '' }
  }
}

/**
 * Formulários de criação são FIXOS — sem IA. Perguntar sempre a mesma coisa é
 * mais confiável e não custa chamada. Campo aberto para o assunto; alternativas
 * quando o valor é de um conjunto conhecido (prioridade).
 */
export const FORM_CRIAR_ACAO: FormularioIA & { acao_pretendida: string } = {
  titulo: 'Vamos criar a ação. Me conta:',
  acao_pretendida: 'criar_acao',
  campos: [
    { nome: 'assunto', label: 'O que precisa ser feito?', tipo: 'texto', obrigatorio: true },
    {
      nome: 'prioridade',
      label: 'Qual a prioridade?',
      tipo: 'escolha',
      opcoes: ['Urgente', 'Importante', 'Observação'],
      obrigatorio: false,
    },
  ],
}

export const FORM_CRIAR_INSIGHT: FormularioIA & { acao_pretendida: string } = {
  titulo: 'Vamos criar o insight. Me conta:',
  acao_pretendida: 'criar_insight',
  campos: [{ nome: 'assunto', label: 'Sobre o que é o insight?', tipo: 'texto', obrigatorio: true }],
}

/**
 * Agente de UMA tarefa: montar as PERGUNTAS PRECISAS que ainda faltam para
 * completar o pedido. Diferente dos formulários fixos, ele lê o que o dono já
 * disse e pergunta só o que falta (se a prioridade já veio, não pergunta de novo).
 * Se falhar, o coordenador cai no formulário fixo — nunca fica sem formulário.
 */
export async function montarPerguntas(
  dominio: 'acao' | 'insight',
  pedido: string,
): Promise<(FormularioIA & { acao_pretendida: string }) | null> {
  const alvo = dominio === 'acao' ? 'uma AÇÃO operacional' : 'um INSIGHT'
  const acao_pretendida = dominio === 'acao' ? 'criar_acao' : 'criar_insight'
  try {
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: `O dono quer criar ${alvo}, mas o pedido está incompleto. Sua única
tarefa: montar as PERGUNTAS que ainda faltam para completar — nada além disso.

Pedido dele: "${pedido}"

Regras:
- Pergunte só o que FALTA. Se algo já foi dito no pedido, NÃO pergunte de novo.
- No máximo 3 perguntas. Uma pergunta por campo.
- Se a resposta é de um conjunto fixo, use "tipo":"escolha" com "opcoes". Se é
  texto livre (descrição, o que fazer), use "tipo":"texto" sem opções.
- A primeira pergunta deve capturar o ASSUNTO principal ("o que precisa ser feito?"
  para ação; "sobre o que é?" para insight), a menos que já esteja claro no pedido.
- Para prioridade, use opcoes: ["Urgente","Importante","Observação"].
- Perguntas curtas e diretas, em português do Brasil. Não fale do sistema/chat.

Responda APENAS com este JSON:
{ "titulo": "frase curta de abertura",
  "campos": [ { "nome": "chave_curta", "label": "a pergunta", "tipo": "texto|escolha",
                "opcoes": ["A","B"], "obrigatorio": true|false } ] }`,
        },
        { role: 'user', content: 'Monte as perguntas no formato JSON pedido.' },
      ],
      { ...JSON_OPTS, max_tokens: 500 },
    )
    const d = parse(res)
    if (!d || !Array.isArray(d.campos) || d.campos.length === 0) return null
    const campos = d.campos
      .slice(0, 3)
      .map((c: any, i: number) => {
        const temOpcoes = Array.isArray(c.opcoes) && c.opcoes.length > 0
        return {
          nome: String(c.nome || `campo${i}`).trim() || `campo${i}`,
          label: String(c.label || '').trim(),
          tipo: temOpcoes ? ('escolha' as const) : ('texto' as const),
          opcoes: temOpcoes ? c.opcoes.map(String).slice(0, 6) : undefined,
          obrigatorio: c.obrigatorio !== false,
        }
      })
      .filter((c: any) => c.label.length > 1)
    if (!campos.length) return null
    // Garante que o primeiro campo é sempre obrigatório (o assunto)
    campos[0].obrigatorio = true
    return {
      titulo: String(d.titulo || (dominio === 'acao' ? 'Vamos criar a ação. Me conta:' : 'Vamos criar o insight. Me conta:')),
      acao_pretendida,
      campos,
    }
  } catch {
    return null
  }
}

/** Monta os campos de um insight novo. */
export async function montarInsight(pedido: string): Promise<AcaoAgente | null> {
  try {
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: `Você monta os campos de UM insight de restaurante. Só isso.
Assunto do insight: "${pedido}"

JSON: { "titulo": "curto, sobre ESSE assunto", "descricao": "o que foi observado",
"sugestao": "o que fazer", "prioridade": "URGENTE|IMPORTANTE|OBSERVACAO",
"categoria": "Servico|Comida|Ambiente|Preco|Agilidade|Geral" }

Fique estritamente no assunto acima — não invente outro tema nem fale do sistema/chat.
Sem prioridade dita, use IMPORTANTE. Português do Brasil. Nunca deixe campo vazio.`,
        },
        { role: 'user', content: 'Monte no formato JSON pedido.' },
      ],
      { ...JSON_OPTS, max_tokens: 500 },
    )
    const d = parse(res)
    if (!d?.titulo) return null
    const a: AcaoAgente = {
      tipo: 'criar_insight',
      dados: d,
      descricao: `Criar o insight "${d.titulo}"`,
    }
    return validarAcao(a) ? null : a
  } catch {
    return null
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
          content: `O dono disse algo que pode mudar um dado do perfil.

Campos (chave = significado):
${Object.entries(CAMPOS_CONFIG).map(([k, v]) => `- ${k} = ${v}`).join('\n')}

Valores atuais: ${JSON.stringify(configAtual)}
Frase dele: "${pedido}"

JSON: { "campo": "<chave exata ou null>", "valor": "<novo valor>" }

Devolva o campo quando ele informar ou mandar mudar um valor.
Devolva null se for pergunta, ou se o valor for igual ao atual, ou se nada corresponder.`,
        },
        { role: 'user', content: 'Responda no formato JSON pedido.' },
      ],
      { ...JSON_OPTS, max_tokens: 200 },
    )
    const d = parse(res)
    if (!d?.campo || !String(d.valor ?? '').trim()) return null
    const a: AcaoAgente = {
      tipo: 'atualizar_config',
      dados: { campo: d.campo, valor: String(d.valor).trim() },
      descricao: `Atualizar ${CAMPOS_CONFIG[d.campo] || d.campo} para "${String(d.valor).trim()}"`,
    }
    return validarAcao(a) ? null : a
  } catch {
    return null
  }
}

/**
 * Agente de UMA tarefa: qual item da lista o dono quer? Recebe só id + título
 * (não os campos todos), para focar em casar o pedido com o item certo.
 */
export async function identificarItem(
  pedido: string,
  itens: Array<Record<string, any>>,
): Promise<string | null> {
  if (!itens.length) return null
  try {
    const lista = itens.map((i) => ({ id: i.id, titulo: i.titulo_acao || i.titulo }))
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: `Qual item da lista o dono está mencionando? Só isso.

Lista: ${JSON.stringify(lista)}
Pedido dele: "${pedido}"

Responda APENAS com este JSON: { "id": "<id exato da lista, ou null>" }
Use o id EXATO de um item. Se nenhum corresponder claramente ao pedido, devolva null.
Não invente id.`,
        },
        { role: 'user', content: 'Responda no formato JSON pedido.' },
      ],
      { ...JSON_OPTS, max_tokens: 60 },
    )
    const d = parse(res)
    const id = d?.id ? String(d.id) : null
    return id && itens.some((i) => String(i.id) === id) ? id : null
  } catch {
    return null
  }
}

/**
 * Agente de UMA tarefa: dado o item já identificado, quais campos mudam?
 * Recebe o item concreto, não a lista inteira — sem chance de trocar de alvo.
 */
async function montarMudanca(
  pedido: string,
  alvo: 'acao' | 'insight',
  item: Record<string, any>,
): Promise<Record<string, any> | null> {
  try {
    const campos =
      alvo === 'acao'
        ? '"titulo_acao", "plano_detalhado", "prioridade" (URGENTE|IMPORTANTE|OBSERVACAO), "categoria", "status" (SUGERIDA|PENDENTE|EM_ANDAMENTO|CONCLUIDO)'
        : '"titulo", "descricao", "sugestao", "prioridade" (URGENTE|IMPORTANTE|OBSERVACAO), "categoria"'
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: `O dono quer alterar ESTE ${alvo === 'acao' ? 'ação' : 'insight'}:
${JSON.stringify(item)}

Pedido dele: "${pedido}"

Responda APENAS com este JSON: { "campos": { ...só os campos que mudam } }
Campos possíveis: ${campos}
Inclua SOMENTE o que o dono pediu para mudar, com o valor novo. Não repita o que já está
igual. Se não der para entender o que muda, devolva { "campos": {} }.`,
        },
        { role: 'user', content: 'Responda no formato JSON pedido.' },
      ],
      { ...JSON_OPTS, max_tokens: 300 },
    )
    const d = parse(res)
    return d?.campos && typeof d.campos === 'object' && Object.keys(d.campos).length ? d.campos : null
  } catch {
    return null
  }
}

/** Coordena identificação + mudança para editar/excluir um item existente. */
export async function montarEdicao(
  pedido: string,
  alvo: 'acao' | 'insight',
  operacao: 'editar' | 'excluir',
  itens: Array<Record<string, any>>,
): Promise<AcaoAgente | null> {
  const id = await identificarItem(pedido, itens)
  if (!id) return null
  const item = itens.find((i) => String(i.id) === id)!
  const rotulo = item.titulo_acao || item.titulo || 'item'

  if (operacao === 'excluir') {
    const a: AcaoAgente = {
      tipo: alvo === 'acao' ? 'excluir_acao' : 'excluir_insight',
      dados: { id },
      descricao: `${alvo === 'acao' ? 'Excluir a ação' : 'Arquivar o insight'} "${rotulo}"`,
    }
    return validarAcao(a) ? null : a
  }

  const campos = await montarMudanca(pedido, alvo, item)
  if (!campos) return null
  const a: AcaoAgente = {
    tipo: alvo === 'acao' ? 'editar_acao' : 'editar_insight',
    dados: { id, ...campos },
    descricao: `Alterar ${alvo === 'acao' ? 'a ação' : 'o insight'} "${rotulo}"`,
  }
  return validarAcao(a) ? null : a
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. DESPACHANTE — recebe o comando da IA principal e chama o especialista certo
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextoComando {
  configAtual: Record<string, unknown>
  acoes: Array<Record<string, any>>
  insights: Array<Record<string, any>>
}

export interface ResultadoComando {
  /** Alteração montada pelo especialista, pronta para confirmar ou aplicar. */
  acao: AcaoAgente | null
  /** Formulário quando falta informação (ex.: criar sem assunto concreto). */
  formulario: (FormularioIA & { acao_pretendida?: string }) | null
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
  const so = (acao: AcaoAgente | null): ResultadoComando => ({ acao, formulario: null })
  switch (cmd.tipo) {
    case 'criar_acao': {
      const { temAssunto, assunto } = await extrairAssunto('acao', cmd.arg)
      if (!temAssunto) return { acao: null, formulario: (await montarPerguntas('acao', cmd.arg)) ?? FORM_CRIAR_ACAO }
      const pedido = assunto || cmd.arg
      // Retry uma vez: o modelo grátis falha de forma transitória. Se ainda assim
      // não montar, cai no formulário — criar com assunto nunca vira "falhou".
      const acao = (await montarAcao(pedido)) ?? (await montarAcao(pedido))
      return acao ? so(acao) : { acao: null, formulario: FORM_CRIAR_ACAO }
    }
    case 'criar_insight': {
      const { temAssunto, assunto } = await extrairAssunto('insight', cmd.arg)
      if (!temAssunto) return { acao: null, formulario: (await montarPerguntas('insight', cmd.arg)) ?? FORM_CRIAR_INSIGHT }
      const pedido = assunto || cmd.arg
      const acao = (await montarInsight(pedido)) ?? (await montarInsight(pedido))
      return acao ? so(acao) : { acao: null, formulario: FORM_CRIAR_INSIGHT }
    }
    case 'editar_acao':
      return so(await montarEdicao(cmd.arg, 'acao', 'editar', ctx.acoes))
    case 'excluir_acao':
      return so(await montarEdicao(cmd.arg, 'acao', 'excluir', ctx.acoes))
    case 'editar_insight':
      return so(await montarEdicao(cmd.arg, 'insight', 'editar', ctx.insights))
    case 'excluir_insight':
      return so(await montarEdicao(cmd.arg, 'insight', 'excluir', ctx.insights))
    case 'mudar_config':
      return so(await montarConfig(cmd.arg, ctx.configAtual))
    case 'anotar':
      return so({
        tipo: 'criar_anotacao',
        dados: { fato: cmd.arg.slice(0, 300), categoria: 'geral' },
        descricao: 'Guardar esta informação',
      })
    case 'formulario': {
      const tipo = /insight/i.test(cmd.arg) ? 'insight' : 'acao'
      return {
        acao: null,
        formulario: (await montarPerguntas(tipo, cmd.arg)) ?? (tipo === 'acao' ? FORM_CRIAR_ACAO : FORM_CRIAR_INSIGHT),
      }
    }
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
          content: `Você é o ${nome}, assistente do painel de um restaurante. O sistema executou
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
naturalmente, mencionando só o que está no resultado.`,
        },
        { role: 'user', content: 'Escreva a resposta para o dono.' },
      ],
      { temperature: 0.3, max_tokens: 200 },
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

export interface SnapshotConfig {
  /** Valor atual de cada campo estruturado (string vazia = não preenchido). */
  campos: Record<string, string>
  /** Texto livre do restaurante (coluna detalhes). */
  detalhes: string
  /** Texto livre do perfil pessoal (coluna perfil_notas). */
  perfilNotas: string
}

type AcaoPersistencia =
  | { tipo: 'campo'; campo: string; valor: string }
  | { tipo: 'livre_restaurante'; valor: string }
  | { tipo: 'livre_perfil'; valor: string }

/**
 * Agente de UMA tarefa: dado o que o dono acabou de dizer, achar os FATOS que ele
 * AFIRMA sobre si ou sobre o restaurante e dizer onde salvar cada um — no campo
 * estruturado certo (se vazio) ou no texto livre. Conservador de propósito: não
 * age sobre perguntas, hipóteses, opiniões nem comandos.
 */
export async function persistirInformacao(
  mensagem: string,
  snap: SnapshotConfig,
): Promise<AcaoPersistencia[]> {
  if (!mensagem.trim()) return []
  const lista = Object.entries(CAMPOS_CONFIG)
    .filter(([k]) => k !== 'detalhes') // detalhes é texto livre, tratado à parte
    .map(([k, rotulo]) => `- ${k} (${rotulo}): ${String(snap.campos[k] || '').trim() ? `"${snap.campos[k]}"` : 'VAZIO'}`)
    .join('\n')
  try {
    const res = await enviarMensagem(
      [
        {
          role: 'system',
          content: `Sua única tarefa: achar FATOS que o dono AFIRMA agora sobre ELE mesmo ou sobre
o RESTAURANTE e dizer onde salvar cada um. Não responda ao dono, só classifique.

Mensagem do dono: "${mensagem}"

Campos estruturados (valor atual; VAZIO = não preenchido):
${lista}
Texto livre do restaurante: ${snap.detalhes.trim() ? 'já tem conteúdo' : 'vazio'}
Texto livre do perfil (dono): ${snap.perfilNotas.trim() ? 'já tem conteúdo' : 'vazio'}

REGRAS (siga à risca):
- Só considere fatos AFIRMADOS como verdade agora. IGNORE perguntas, hipóteses
  ("imagina se..."), desejos, opiniões, ordens/comandos ("muda para...", "cria...")
  e generalidades que não sejam deste dono/restaurante.
- Para cada fato:
  * Se há um campo estruturado para ele e esse campo está VAZIO → use "campo".
  * Se o campo já tem valor, ou não existe campo para aquilo → use texto livre:
    "livre_restaurante" (sobre o restaurante) ou "livre_perfil" (sobre o dono como pessoa).
- NUNCA invente. NÃO repita o que já está salvo. Se não há nada a salvar: {"acoes":[]}.

Responda APENAS com este JSON:
{ "acoes": [ { "tipo": "campo"|"livre_restaurante"|"livre_perfil", "campo": "<chave exata, só se tipo=campo>", "valor": "<o dado ou a anotação, curto>" } ] }

EXEMPLOS:
"somos uma churrascaria" (tipo_culinaria VAZIO) -> {"acoes":[{"tipo":"campo","campo":"tipo_culinaria","valor":"Churrascaria"}]}
"meu avô abriu em 1945 pra alimentar os soldados" (ano_abertura VAZIO) -> {"acoes":[{"tipo":"campo","campo":"ano_abertura","valor":"1945"},{"tipo":"livre_restaurante","valor":"Fundado pelo avô do dono para alimentar os soldados."}]}
"eu sou formado em administração" -> {"acoes":[{"tipo":"livre_perfil","valor":"O dono é formado em administração."}]}
"quantas mesas eu tenho?" -> {"acoes":[]}
"imagina se fôssemos uma pizzaria" -> {"acoes":[]}
"muda o horário para 10h" -> {"acoes":[]}`,
        },
        { role: 'user', content: 'Classifique e responda no formato JSON pedido.' },
      ],
      { ...JSON_OPTS, max_tokens: 400 },
    )
    const d = parse(res)
    const acoes: any[] = Array.isArray(d?.acoes) ? d.acoes : []
    const validas: AcaoPersistencia[] = []
    for (const a of acoes) {
      const valor = String(a?.valor || '').trim()
      if (valor.length < 2) continue
      if (a?.tipo === 'campo') {
        const campo = String(a?.campo || '').trim()
        if (campo && campo !== 'detalhes' && campo in CAMPOS_CONFIG) validas.push({ tipo: 'campo', campo, valor })
      } else if (a?.tipo === 'livre_restaurante') {
        validas.push({ tipo: 'livre_restaurante', valor })
      } else if (a?.tipo === 'livre_perfil') {
        validas.push({ tipo: 'livre_perfil', valor })
      }
    }
    return validas.slice(0, 5)
  } catch {
    return []
  }
}

/**
 * Roda o agente e aplica as gravações em segundo plano. Nunca lança: falhar aqui
 * não pode atrapalhar a conversa. Preenche campo estruturado só se estiver VAZIO
 * (nunca sobrescreve dado existente — correção é feita por comando explícito).
 */
export async function persistirEmBackground(
  restauranteId: number | null,
  mensagem: string,
  snap: SnapshotConfig,
): Promise<void> {
  if (!restauranteId) return
  try {
    const acoes = await persistirInformacao(mensagem, snap)
    for (const a of acoes) {
      try {
        if (a.tipo === 'campo') {
          const jaTem = String(snap.campos[a.campo] || '').trim()
          if (jaTem) {
            // Campo já preenchido: não sobrescreve — vira anotação (com o rótulo do
            // campo, para ficar legível) no texto livre certo.
            await anexarTextoLivre(
              restauranteId,
              a.campo === 'nome' ? 'perfil_notas' : 'detalhes',
              `${CAMPOS_CONFIG[a.campo] || a.campo}: ${a.valor}`,
            )
          } else {
            await atualizarCampoConfig(restauranteId, a.campo, a.valor)
          }
        } else if (a.tipo === 'livre_restaurante') {
          await anexarTextoLivre(restauranteId, 'detalhes', a.valor)
        } else {
          await anexarTextoLivre(restauranteId, 'perfil_notas', a.valor)
        }
      } catch {
        /* uma gravação falhar não interrompe as outras */
      }
    }
  } catch {
    /* silencioso: é trabalho de bastidor */
  }
}
