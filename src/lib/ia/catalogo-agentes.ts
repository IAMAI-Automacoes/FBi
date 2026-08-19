import {
  SOBRE_O_SISTEMA, REGRAS_RESPOSTA, COMANDOS, REGRA_POS_BUSCA,
} from '@/lib/prompts-sistema'

/**
 * Catálogo dos agentes de IA — o que cada um faz, o que ACESSA, sua MEMÓRIA e o
 * SYSTEM PROMPT real. Os blocos do assistente principal são editáveis (a edição
 * é salva no banco e usada em runtime pela IA — ver prompt-store). Os prompts dos
 * especialistas têm partes dinâmicas (${...}) que não podem ser removidas, então
 * são mostrados como referência (não editáveis por aqui).
 */

export interface BlocoPrompt {
  titulo: string
  explicacao: string
  conteudo: string
  /** Quando editável, a chave usada no prompt_store (sobrescreve o padrão). */
  chave?: string
  editavel: boolean
  /** Tem trechos ${...} preenchidos em tempo real — mostrado só como referência. */
  dinamico?: boolean
}

/** Padrões de inferência do código; `agentes_ia` sobrescreve o que for editado. */
export interface ParamsPadrao {
  temperature?: number
  max_tokens?: number
  top_p?: number
  /** Exige resposta em JSON — subir a temperatura aqui arrisca saída inválida. */
  json?: boolean
}

export interface AgenteInfo {
  id: string
  nome: string
  papel: string
  /** O que ele lembra: histórico da conversa, memória de longo prazo, ou nada. */
  memoria: string
  /** Dados e memórias que este agente enxerga. */
  acessos: string[]
  /** Arquivo e linha onde o agente é chamado — mostrado no painel. */
  arquivo: string
  /**
   * Onde executa. No navegador, a edição vale na próxima sessão; no servidor,
   * na próxima execução da edge function.
   */
  camada: 'navegador' | 'servidor'
  /** Valores usados quando o admin não configurou nada. */
  params: ParamsPadrao
  /** Falso quando desligar o agente quebraria um fluxo do produto. */
  desligavel?: boolean
  blocos: BlocoPrompt[]
}

export const CATALOGO_AGENTES: AgenteInfo[] = [
  {
    id: 'assistente',
    arquivo: 'src/lib/prompts-sistema.ts:191',
    camada: 'navegador',
    params: { temperature: 0 },
    nome: 'Assistente principal (o que conversa)',
    papel:
      'É o único que conversa com o dono. Lê tudo do contexto, responde, e — quando o dono pede uma alteração ou precisa de dado externo — emite um comando [[comando:...]] em vez de agir sozinho.',
    memoria:
      'COM memória da conversa (recebe o histórico de mensagens) e as anotações de longo prazo do restaurante.',
    acessos: [
      'Histórico da conversa atual (todas as mensagens)',
      'Perfil do restaurante (nome, tipo, mesas, horário, público, pratos, diferenciais, desafios, descrição…)',
      'Notas pessoais sobre o dono (campo livre do perfil)',
      'Números do período (satisfação, volume, tema crítico)',
      'Satisfação por categoria, garçons cadastrados',
      'Insights ativos e ações em aberto',
      'Avaliações recentes dos clientes',
      'Anotações de conversas anteriores (memória de longo prazo)',
      'Trechos dos materiais de treinamento (quando busca no conhecimento)',
      'Resultados da busca na web (quando pesquisa)',
      'Leitura dos arquivos que o dono anexou na conversa',
    ],
    blocos: [
      {
        titulo: 'Sobre o sistema',
        explicacao: 'Explica à IA onde ela vive: o que é o produto, as páginas do painel e como ler os números.',
        conteudo: SOBRE_O_SISTEMA,
        chave: 'sobre_sistema',
        editavel: true,
      },
      {
        titulo: 'Regras de resposta',
        explicacao: 'Como ela deve responder: o que pode falar, como usar o contexto sem inventar, estilo, e a hierarquia de verdade quando os dados se contradizem.',
        conteudo: REGRAS_RESPOSTA,
        chave: 'regras_resposta',
        editavel: true,
      },
      {
        titulo: 'Comandos (como agir no sistema)',
        explicacao: 'O protocolo: quando e como emitir cada comando (criar/editar/excluir ação e insight, mudar config, anotar, pesquisar, abrir página, conhecimento). É o que faz a IA "mexer" no sistema sem alucinar.',
        conteudo: COMANDOS,
        chave: 'comandos',
        editavel: true,
      },
      {
        titulo: 'Regra pós-busca',
        explicacao: 'Entra depois de uma pesquisa na web: manda responder com os fatos encontrados e não citar links (a interface já mostra as fontes).',
        conteudo: REGRA_POS_BUSCA,
        chave: 'regra_pos_busca',
        editavel: true,
      },
    ],
  },
  {
    id: 'narrador',
    arquivo: 'src/lib/ia/agentes.ts:760',
    camada: 'navegador',
    params: { temperature: 0.3, max_tokens: 200 },
    nome: 'Narrador de resultado',
    papel: 'Depois que o sistema executa uma alteração, conta ao dono o que foi feito — usando SÓ o relatório do sistema, para não inventar detalhes.',
    memoria: 'SEM memória. Vê apenas o relatório da ação (os campos montados) e o nome do assistente.',
    acessos: ['Relatório do sistema (os campos exatos da ação)', 'Nome do assistente', 'Situação: preparado / aplicado / falhou'],
    blocos: [{
      titulo: 'Prompt do narrador',
      explicacao: 'Recebe o resultado e escreve 1–2 frases naturais, sem acrescentar nada além do que está no resultado.',
      dinamico: true,
      editavel: true,
      chave: 'ag_narrador',
      conteudo: `Você é o {nome}, assistente do painel de um restaurante. O sistema executou
uma tarefa que o dono pediu e te passou o resultado. Escreva a resposta para o dono em
1 ou 2 frases curtas, naturais e diretas, em português do Brasil.

RESULTADO DO SISTEMA (é a única verdade — não acrescente nada que não esteja aqui,
não invente números, nomes, prazos nem detalhes):
"""
{relatorio}
"""

{instr}

Não use listas nem títulos. Não se apresente, não repita seu nome e não chame o leitor
de "dono". Não devolva o resultado em formato técnico: fale como uma pessoa avisando,
naturalmente, mencionando só o que está no resultado.`,
    }],
  },
  {
    id: 'extrair_assunto',
    arquivo: 'src/lib/ia/agentes.ts:322',
    camada: 'navegador',
    params: { temperature: 0, max_tokens: 120, json: true },
    nome: 'Extrator de assunto',
    papel: 'Ao pedir para criar ação/insight, decide se o pedido já tem um ASSUNTO concreto do restaurante. Se não tiver, o sistema mostra o formulário em vez de inventar um tema.',
    memoria: 'SEM memória. Vê só o pedido.',
    acessos: ['O pedido do dono (o texto do comando)'],
    blocos: [{
      titulo: 'Prompt', explicacao: 'Responde apenas se há assunto concreto, nunca inventa. {alvo} = "uma AÇÃO..." ou "um INSIGHT".', dinamico: true, editavel: true, chave: 'ag_extrair_assunto',
      conteudo: `O dono pediu para criar {alvo}. Sua única tarefa: dizer se o pedido já
contém um ASSUNTO CONCRETO — um problema, tarefa ou tema real do restaurante.

Pedido: "{pedido}"

Responda APENAS com este JSON:
{ "temAssunto": true|false, "assunto": "o tema, em poucas palavras" }

temAssunto = false quando o pedido:
- é genérico ("crie uma ação", "cria um insight", "faz uma tarefa");
- é meta ou sobre o próprio sistema ("faça aparecer o formulário", "me mostra um exemplo");
- não descreve nada concreto do restaurante.

NUNCA invente um assunto. Se não houver um assunto real e específico no pedido,
temAssunto é false e "assunto" fica vazio.`,
    }],
  },
  {
    id: 'montar_acao_insight',
    arquivo: 'src/lib/ia/agentes.ts:273',
    camada: 'navegador',
    params: { temperature: 0, max_tokens: 500, json: true },
    nome: 'Montador de ação / insight',
    papel: 'Com o assunto em mãos, preenche os campos de uma ação (título, plano, prioridade, categoria) ou de um insight (título, descrição, sugestão…).',
    memoria: 'SEM memória. Vê só o assunto/pedido.',
    acessos: ['O assunto/pedido concreto'],
    blocos: [
      {
        titulo: 'Prompt — montar AÇÃO', explicacao: 'Preenche os campos de uma ação a partir do assunto.', dinamico: true, editavel: true, chave: 'ag_montar_acao',
        conteudo: `Você monta os campos de UMA ação operacional de restaurante. Só isso.
Assunto da ação: "{pedido}"

JSON: { "titulo_acao": "curto, direto ao ponto do assunto",
"plano_detalhado": "passos práticos para resolver ESSE assunto",
"prioridade": "URGENTE|IMPORTANTE|OBSERVACAO", "categoria": "Comida|Bebidas|Atendimento|Ambiente|Limpeza|Preço|Tempo de Espera|Reserva|Estacionamento|Acessibilidade|Música/Som|Cardápio/Variedade|Higiene|Outros",
"status": "PENDENTE" }

Fique estritamente no assunto acima — não invente outro tema nem fale do sistema/chat.
Sem prioridade dita, use IMPORTANTE. Português do Brasil. Nunca deixe campo vazio.`,
      },
      {
        titulo: 'Prompt — montar INSIGHT', explicacao: 'Preenche os campos de um insight a partir do assunto.', dinamico: true, editavel: true, chave: 'ag_montar_insight',
        conteudo: `Você monta os campos de UM insight de restaurante. Só isso.
Assunto do insight: "{pedido}"

JSON: { "titulo": "curto, sobre ESSE assunto", "descricao": "o que foi observado",
"sugestao": "o que fazer", "prioridade": "URGENTE|IMPORTANTE|OBSERVACAO",
"categoria": "Comida|Bebidas|Atendimento|Ambiente|Limpeza|Preço|Tempo de Espera|Reserva|Estacionamento|Acessibilidade|Música/Som|Cardápio/Variedade|Higiene|Outros" }

Fique estritamente no assunto acima — não invente outro tema nem fale do sistema/chat.
Sem prioridade dita, use IMPORTANTE. Português do Brasil. Nunca deixe campo vazio.`,
      },
    ],
  },
  {
    id: 'montar_config',
    arquivo: 'src/lib/ia/agentes.ts:489',
    camada: 'navegador',
    params: { temperature: 0, max_tokens: 200, json: true },
    nome: 'Montador de configuração',
    papel: 'Quando o dono muda/afirma um dado do perfil, decide QUAL campo e QUAL valor novo.',
    memoria: 'SEM memória da conversa. Vê os valores atuais da configuração.',
    acessos: ['A frase do dono', 'Os valores atuais de todos os campos do perfil'],
    blocos: [{
      titulo: 'Prompt', explicacao: 'Mapeia a frase para o campo certo; devolve null se nada muda. {campos} = lista dos campos; {configAtual} = valores atuais.', dinamico: true, editavel: true, chave: 'ag_montar_config',
      conteudo: `O dono disse algo que pode mudar um dado do perfil.

Campos (chave = significado):
{campos}

Valores atuais: {configAtual}
Frase dele: "{pedido}"

JSON: { "campo": "<chave exata ou null>", "valor": "<novo valor>" }

Devolva o campo quando ele informar ou mandar mudar um valor.
Devolva null se for pergunta, ou se o valor for igual ao atual, ou se nada corresponder.`,
    }],
  },
  {
    id: 'montar_perguntas',
    arquivo: 'src/lib/ia/agentes.ts:398',
    camada: 'navegador',
    params: { temperature: 0, max_tokens: 500, json: true },
    nome: 'Montador de formulário',
    papel: 'Quando falta o assunto para criar algo, monta as perguntas certas (uma por campo) para o formulário no chat.',
    memoria: 'SEM memória. Vê só o pedido.',
    acessos: ['O pedido incompleto'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Pergunta só o que falta; no máx. 3 perguntas.', dinamico: true, editavel: false,
      conteudo: `O dono quer criar {uma ação | um insight}, mas o pedido está incompleto. Monte as
PERGUNTAS que ainda faltam. No máximo 3. A 1ª captura o assunto. Prioridade vira escolha.` }],
  },
  {
    id: 'identificar_item',
    arquivo: 'src/lib/ia/agentes.ts:538',
    camada: 'navegador',
    params: { temperature: 0, max_tokens: 60, json: true },
    nome: 'Identificador de item',
    papel: 'Para editar/excluir, descobre QUAL item da lista o dono está mencionando. Recebe só id + título, para não se distrair com o resto.',
    memoria: 'SEM memória. Vê só a lista de itens e o pedido.',
    acessos: ['Lista de ações/insights (id + título)', 'O pedido'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Casa o pedido com um item existente; nunca inventa id.', dinamico: true, editavel: true, chave: 'ag_identificar_item',
      conteudo: `Qual item da lista o dono está mencionando? Só isso.

Lista: {lista}
Pedido dele: "{pedido}"

Responda APENAS com este JSON: { "id": "<id exato da lista, ou null>" }
Use o id EXATO de um item. Se nenhum corresponder claramente ao pedido, devolva null.
Não invente id.` }],
  },
  {
    id: 'montar_mudanca',
    arquivo: 'src/lib/ia/agentes.ts:580',
    camada: 'navegador',
    params: { temperature: 0, max_tokens: 300, json: true },
    nome: 'Editor de item',
    papel: 'Depois que o item foi identificado, decide o que MUDA nele — devolve só os campos alterados, para não sobrescrever o resto.',
    memoria: 'SEM memória. Vê só o item encontrado e o pedido.',
    acessos: ['O item identificado (todos os campos)', 'O pedido'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Devolve apenas os campos que mudam; vazio quando não dá para entender.', dinamico: true, editavel: true, chave: 'ag_montar_mudanca',
      conteudo: `O dono quer alterar ESTE {alvo}:
{item}

Pedido dele: "{pedido}"

Responda APENAS com este JSON: { "campos": { ...só os campos que mudam } }
Campos possíveis: {campos}
Inclua SOMENTE o que o dono pediu para mudar, com o valor novo. Não repita o que já está
igual. Se não der para entender o que muda, devolva { "campos": {} }.` }],
  },
  {
    id: 'documentos',
    arquivo: 'src/lib/ia/agentes.ts:77',
    camada: 'navegador',
    params: { temperature: 0, max_tokens: 800, json: true },
    nome: 'Leitor de documentos',
    papel: 'Lê UM arquivo anexado, isolado (sem histórico e sem outros arquivos), para não misturar conteúdos.',
    memoria: 'SEM memória. Vê só o texto do arquivo da vez.',
    acessos: ['O texto de um único arquivo anexado'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Descreve só o que está no arquivo; não inventa. {conteudo} = texto do arquivo.', dinamico: true, editavel: true, chave: 'ag_documentos',
      conteudo: `Você lê UM documento e resume o conteúdo dele. Você não tem histórico de
conversa e não conhece nenhum outro arquivo: descreva SOMENTE o que está no texto abaixo.

Nome do arquivo: "{nome}"

Conteúdo:
"""
{conteudo}
"""

Responda APENAS com este JSON:
{ "tipo": "que tipo de documento é (relatório, cardápio, contrato, manual...)",
  "resumo": "2 a 4 frases sobre o que este documento contém",
  "pontos": ["fato concreto 1", "fato concreto 2", "fato concreto 3"] }

Os "pontos" devem trazer números, nomes e datas que estejam no texto. Máximo 6.
Não invente nada que não esteja no documento. Português do Brasil.` }],
  },
  {
    id: 'pesquisa_web',
    arquivo: 'src/lib/ia/agentes.ts:158',
    camada: 'navegador',
    params: { temperature: 0, max_tokens: 700 },
    desligavel: true,
    nome: 'Pesquisa na web / leitura de página',
    papel: 'Apura FATOS na internet (ou lê uma página específica) e devolve os dados — não a resposta final. Quem conversa é o assistente.',
    memoria: 'SEM memória. Vê os termos de busca (ou a URL) e a web.',
    acessos: ['Termos de busca ou a URL', 'Acesso à internet (via plugin de web)'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Relata só os fatos, em tópicos, sem conversar.', dinamico: true, editavel: false,
      conteudo: `Pesquise e relate os fatos encontrados sobre o tema pedido, em português.
Tópicos curtos e objetivos, com números e datas. Não converse, não dê conselhos: só os fatos.` }],
  },
  {
    id: 'curador',
    arquivo: 'src/lib/ia/agentes.ts:227',
    camada: 'navegador',
    params: { temperature: 0, max_tokens: 150, json: true },
    nome: 'Curador de conhecimento',
    papel: 'A busca vetorial traz trechos aproximados; ele fica só com os que realmente respondem à pergunta.',
    memoria: 'SEM memória. Vê a pergunta e os trechos recuperados.',
    acessos: ['A pergunta reescrita', 'Os trechos trazidos pela busca vetorial (RAG)'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Seleciona rigorosamente os trechos úteis.', dinamico: true, editavel: false,
      conteudo: `Você seleciona material de apoio. A busca trouxe trechos por semelhança e alguns não têm
relação com a pergunta. Pergunta: "{pergunta}". Trechos: {...}. JSON: { "uteis": [índices úteis] }` }],
  },
  {
    id: 'persistir',
    arquivo: 'src/lib/ia/agentes.ts:828',
    camada: 'navegador',
    params: { temperature: 0, max_tokens: 400, json: true },
    desligavel: true,
    nome: 'Anotador de fatos (segundo plano)',
    papel: 'Depois de cada mensagem, acha fatos que o dono afirmou e que NÃO cabem num campo de config (histórias, prêmios, detalhes pessoais) e anota no texto livre. Roda em segundo plano, sem atrapalhar a conversa.',
    memoria: 'SEM memória. Vê só a mensagem do dono.',
    acessos: ['A mensagem do dono', 'Grava em: descrição do restaurante ou notas do perfil'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Ignora perguntas/hipóteses/comandos; só anota fato afirmado sem campo próprio.', dinamico: true, editavel: false,
      conteudo: `Ache FATOS que o dono AFIRMA e que NÃO cabem nos campos do perfil (esses o comando
mudar_config resolve). Anote só o que sobra (histórias, conquistas, detalhes pessoais).
"livre_restaurante" ou "livre_perfil". Ignore perguntas, hipóteses, opiniões e comandos.` }],
  },
  {
    id: 'memoria_longo_prazo',
    arquivo: 'src/lib/queries/memoria-assistente.ts:40',
    camada: 'navegador',
    params: { temperature: 0, json: true },
    desligavel: true,
    nome: 'Memória de longo prazo',
    papel: 'Depois de cada troca, extrai fatos DURADOUROS da conversa e guarda para conversas futuras (nome, preferências, características do restaurante, decisões, metas).',
    memoria: 'Escreve a memória. Vê a última troca (pergunta + resposta) e a memória atual (para não repetir).',
    acessos: ['A última troca da conversa', 'A memória de longo prazo atual', 'Grava em: memoria_assistente'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Guarda só fatos duradouros; ignora números que mudam sozinhos e coisas já sabidas.', dinamico: true, editavel: false,
      conteudo: `Você mantém a memória de longo prazo. Leia a conversa e extraia APENAS fatos duradouros.
GUARDE: nome/preferências da pessoa, características do restaurante, decisões, metas, problemas.
NÃO GUARDE: números que mudam sozinhos, perguntas, saudações, ou o que já está na memória atual.
Máximo de 3 fatos por conversa.` }],
  },
  {
    id: 'gerador_insights',
    arquivo: 'supabase/functions/gerar-insights/index.ts:57',
    camada: 'servidor',
    params: { max_tokens: 3000, json: true },
    nome: 'Gerador de insights (edge function, cron)',
    papel: 'Roda no servidor de tempos em tempos: agrega os feedbacks do período e gera os insights (padrões, riscos, elogios) com prioridade.',
    memoria: 'SEM memória de conversa. Vê os feedbacks agregados e a configuração do restaurante.',
    acessos: ['Feedbacks do período', 'Perfil do restaurante', 'Anotações da IA', 'Materiais de treinamento', 'Grava em: insights'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Prioriza risco sanitário/segurança sempre como URGENTE.', dinamico: true, editavel: true, chave: 'ef_gerar_insights',
      conteudo: `Voce e o "{nome}", consultor de gestao de restaurantes. Analise os feedbacks reais dos clientes e gere insights operacionais em JSON.

{tom}

## Sobre este restaurante
{perfil}
{memoria}
{conhecimento}

## Como classificar
1. "URGENTE": qualquer risco sanitario (cabelo, inseto, alimento estragado, intoxicacao), risco a seguranca do cliente ou violacao grave. Classifique assim INDEPENDENTE do volume, mesmo com 1 relato.
2. "IMPORTANTE": padroes relevantes, reclamacoes recorrentes e consistentes, pontos de melhoria fortes.
3. "OBSERVACAO": assuntos notaveis, tendencias menores e elogios sem acao imediata.

## Regras de qualidade
- Baseie-se APENAS nos feedbacks abaixo. Nao invente reclamacao que nao existe.
- A sugestao deve ser CONCRETA e executavel neste restaurante, considerando o perfil dele (tamanho, tipo de cozinha, publico). Nada de conselho generico.
- Quando uma boa pratica de referencia embasar a sugestao, aplique-a ao caso concreto.
- Agrupe feedbacks do mesmo tema num unico insight, nao repita.
- Escreva em portugues do Brasil, direto, sem jargao.
- "feedback_ids": liste os IDs EXATOS dos feedbacks abaixo que sustentam este insight. Use somente IDs que aparecem na lista. Nao invente ID.

## Formato OBRIGATORIO (retorne SOMENTE este JSON)
{
  "insights": [
    {
      "prioridade": "URGENTE" | "IMPORTANTE" | "OBSERVACAO",
      "categoria": "Comida" | "Bebidas" | "Atendimento" | "Ambiente" | "Limpeza" | "Preço" | "Tempo de Espera" | "Reserva" | "Estacionamento" | "Acessibilidade" | "Música/Som" | "Cardápio/Variedade" | "Higiene" | "Outros",
      "titulo": "Titulo curto e claro",
      "descricao": "O que os feedbacks mostram, com o padrao observado",
      "sugestao": "Acao pratica e especifica para a equipe resolver",
      "feedback_ids": ["id-do-feedback-1", "id-do-feedback-2"]
    }
  ]
}

## Feedbacks a analisar
{feedbacks}` }],
  },
  {
    id: 'sugeridor_acoes',
    arquivo: 'supabase/functions/sugerir-acoes/index.ts:47',
    camada: 'servidor',
    params: { max_tokens: 2000, json: true },
    nome: 'Sugeridor de ações (edge function)',
    papel: 'A partir dos insights, sugere ações operacionais com plano — nunca a partir de um feedback único.',
    memoria: 'SEM memória de conversa. Vê os insights ativos e a configuração.',
    acessos: ['Insights ativos', 'Perfil do restaurante', 'Anotações da IA', 'Materiais de treinamento', 'Grava em: acoes_operacionais'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Sempre inclui um plano norteador; nunca age por feedback único.', dinamico: true, editavel: true, chave: 'ef_sugerir_acoes',
      conteudo: `Voce e o "{nome}", consultor especialista em gestao de restaurantes. Com base nos insights abaixo, gere ATE {max} acoes operacionais concretas para o dono resolver os problemas mais valiosos (maior impacto e urgencia).

{tom}

## Sobre este restaurante
{perfil}
{memoria}
{conhecimento}

## Regras para cada acao
1. "titulo_acao": titulo curto e claro do que precisa ser feito.
2. "plano_detalhado": um plano pratico em passos, adaptado a ESTE restaurante (tamanho, equipe, tipo de cozinha). Quando uma boa pratica de referencia se aplicar, incorpore-a de forma concreta. Nada de conselho generico como "melhore o atendimento".
3. "prioridade": herde do insight principal (URGENTE, IMPORTANTE ou OBSERVACAO).
4. "categoria": uma destas 14 — Comida, Bebidas, Atendimento, Ambiente, Limpeza, Preço, Tempo de Espera, Reserva, Estacionamento, Acessibilidade, Música/Som, Cardápio/Variedade, Higiene ou Outros.
Escreva em portugues do Brasil, direto.

## Formato (retorne SOMENTE este JSON)
{ "acoes": [ { "titulo_acao": "...", "plano_detalhado": "...", "prioridade": "...", "categoria": "..." } ] }

## Insights disponiveis
{insights}` }],
  },
  {
    id: 'plano_acao',
    arquivo: 'supabase/functions/gerar-plano-acao/index.ts:42',
    camada: 'servidor',
    params: { max_tokens: 1200, json: true },
    nome: 'Gerador de plano de ação (edge function)',
    papel: 'Gera o passo a passo detalhado de UMA ação, quando o dono pede o plano. Aprofunda o que o Sugeridor já esboçou.',
    memoria: 'SEM memória de conversa. Vê a ação, o perfil do restaurante e os materiais de treinamento.',
    acessos: ['A ação (título/categoria/prioridade)', 'Insights ativos', 'Perfil do restaurante', 'Materiais de treinamento'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Especialista em gestão e operação, com o contexto deste restaurante.', dinamico: true, editavel: true, chave: 'ef_plano_acao',
      conteudo: `Você é um especialista em gestão de restaurantes e operações.
Baseado na ação descrita abaixo, gere um plano detalhado de ação PARA ESTE restaurante.

{tom}

O plano deve:
1. Explicar COMO resolver o problema
2. Ser orientador e prático, sem ser rígido demais
3. Fornecer direcionamentos claros para a equipe
4. Levar em conta o porte, o público e a realidade deste restaurante — nada de
   conselho genérico que serviria para qualquer lugar

## Sobre este restaurante
{perfil}

## Ação
{acao}

{insights}

{conhecimento}

Retorne SOMENTE um JSON neste formato, sem markdown:
{
  "plano_detalhado": "Seu plano aqui com múltiplas linhas se necessário"
}` }],
  },
  {
    id: 'perguntas_direcionadas',
    arquivo: 'supabase/functions/gerar-perguntas-direcionadas/index.ts:28',
    camada: 'servidor',
    params: { max_tokens: 400, json: true },
    nome: 'Gerador de perguntas direcionadas (edge function)',
    papel: 'Para uma ação em andamento, gera perguntas a fazer aos clientes para medir se a solução funcionou.',
    memoria: 'SEM memória de conversa. Vê a ação e o perfil do restaurante.',
    acessos: ['A ação (título, plano, categoria)', 'Perfil do restaurante', 'Grava em: perguntas_direcionadas'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Perguntas curtas, direcionadas mas não enviesadas.', dinamico: true, editavel: true, chave: 'ef_perguntas',
      conteudo: `Com base nesta ação que está sendo implementada no restaurante, gere 2 a 3
perguntas curtas e naturais para fazer aos clientes, que captem se a solução está funcionando.
As perguntas devem ser levemente direcionadas mas não enviesadas, e fazer sentido para o
público deste restaurante.

## Sobre este restaurante
{perfil}

## Ação
Título: "{titulo}"
Plano: "{plano}"
Categoria: "{categoria}"

Retorne APENAS um objeto JSON com a chave "perguntas" contendo um array de strings.` }],
  },
  {
    id: 'banner',
    arquivo: 'supabase/functions/atualizar-banner/index.ts:27',
    camada: 'servidor',
    params: { max_tokens: 200 },
    desligavel: true,
    nome: 'Texto do banner (edge function)',
    papel: 'Cria um texto curto para o banner do painel, com base nos feedbacks das últimas 24h.',
    memoria: 'SEM memória. Vê os feedbacks recentes.',
    acessos: ['Feedbacks das últimas 24h deste restaurante', 'Nome e tom do assistente', 'Grava em: restaurantes.texto_banner'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Uma frase curta com o destaque do dia, sem markdown.', dinamico: true, editavel: true, chave: 'ef_banner',
      conteudo: `Você é o "{nome}", um assistente analisando feedbacks de clientes de um restaurante.
Sua missão é gerar UMA frase curta (máximo 2 linhas, tom profissional e amigável) resumindo o
destaque dos feedbacks das últimas horas.

{tom}

Exemplos: "Ontem recebemos 12 feedbacks, 83% positivos. Destaque: 4 elogios à nova sobremesa."
ou "Nas últimas 24h, surgiram 3 menções negativas sobre tempo de espera. Vale investigar."
NÃO use formatação JSON nem markdown (asteriscos). Retorne apenas o texto puro da frase.

Feedbacks a analisar:
{feedbacks}` }],
  },
  {
    id: 'relatorio_estruturado',
    arquivo: 'src/lib/queries/relatorios.ts:270',
    camada: 'navegador',
    params: { json: true },
    nome: 'Análise do relatório (PDF)',
    papel: 'Escreve a análise do relatório mensal campo a campo (título, resumo, ponto forte/fraco, recomendações), para o PDF encaixar cada parte no lugar certo.',
    memoria: 'SEM memória. Vê os dados consolidados do período.',
    acessos: ['Dados do período (volume, satisfação, categorias, trechos de clientes)'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Consultor escrevendo para o dono; nunca inventa número, sem jargão.', dinamico: true, editavel: false,
      conteudo: `Você é um consultor de restaurantes escrevendo a análise do relatório mensal para o DONO.
Responda em JSON: titulo, resumo, ponto_forte, ponto_fraco, leitura_categorias, leitura_clientes,
recomendacoes[], alerta_amostra. Nunca invente número; proibido jargão (NPS, CSAT, score…);
satisfação como "X de 100"; recomendações executáveis nesta semana. Dados: {json}` }],
  },
  {
    id: 'resumo_executivo',
    arquivo: 'src/lib/queries/relatorios.ts:315',
    camada: 'navegador',
    params: { max_tokens: 400 },
    desligavel: true,
    nome: 'Resumo executivo do relatório',
    papel: 'Escreve o resumo executivo do relatório em texto corrido para o dono.',
    memoria: 'SEM memória. Vê os dados do período.',
    acessos: ['Dados do período'],
    blocos: [{ titulo: 'Prompt', explicacao: '3 a 5 frases, sem markdown/jargão, com uma recomendação concreta.', dinamico: true, editavel: false,
      conteudo: `Você escreve o resumo executivo do relatório, lido pelo DONO. Texto corrido, 3 a 5 frases,
sem markdown/títulos/emojis, sem jargão. Nunca invente número. Termine com UMA recomendação
concreta. Dados: {json}` }],
  },
]

/**
 * O despachante saiu da lista de agentes porque não é uma IA — não tem prompt
 * nem parâmetro para configurar. Continua documentado no painel como explicação
 * do roteamento.
 */
export const COMO_FUNCIONA = {
  titulo: 'Como o roteamento funciona',
  texto:
    'O assistente principal nunca altera nada sozinho: quando o dono pede uma mudança, ele emite um comando. ' +
    'Um trecho de código (o despachante) lê esse comando e chama o especialista certo, entregando só a fatia de ' +
    'dados que aquele agente precisa — é isso que impede um agente de ver o contexto de outro. O resultado volta ' +
    'para o Narrador, que conta ao dono o que foi feito usando apenas o relatório do sistema.',
  arquivo: 'src/lib/ia/agentes.ts:642',
}
