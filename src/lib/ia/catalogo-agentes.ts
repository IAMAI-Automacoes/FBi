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

export interface AgenteInfo {
  id: string
  nome: string
  papel: string
  /** O que ele lembra: histórico da conversa, memória de longo prazo, ou nada. */
  memoria: string
  /** Dados e memórias que este agente enxerga. */
  acessos: string[]
  blocos: BlocoPrompt[]
}

export const CATALOGO_AGENTES: AgenteInfo[] = [
  {
    id: 'assistente',
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
"prioridade": "URGENTE|IMPORTANTE|OBSERVACAO", "categoria": "Servico|Comida|Ambiente|Preco|Agilidade|Geral",
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
"categoria": "Servico|Comida|Ambiente|Preco|Agilidade|Geral" }

Fique estritamente no assunto acima — não invente outro tema nem fale do sistema/chat.
Sem prioridade dita, use IMPORTANTE. Português do Brasil. Nunca deixe campo vazio.`,
      },
    ],
  },
  {
    id: 'montar_config',
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
    nome: 'Montador de formulário',
    papel: 'Quando falta o assunto para criar algo, monta as perguntas certas (uma por campo) para o formulário no chat.',
    memoria: 'SEM memória. Vê só o pedido.',
    acessos: ['O pedido incompleto'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Pergunta só o que falta; no máx. 3 perguntas.', dinamico: true, editavel: false,
      conteudo: `O dono quer criar {uma ação | um insight}, mas o pedido está incompleto. Monte as
PERGUNTAS que ainda faltam. No máximo 3. A 1ª captura o assunto. Prioridade vira escolha.` }],
  },
  {
    id: 'identificar_montar_mudanca',
    nome: 'Identificador + editor de item',
    papel: 'Para editar/excluir, primeiro descobre QUAL item da lista o dono quer (recebe só id+título), depois decide o que MUDA nele (recebe só o item achado).',
    memoria: 'SEM memória. Vê só a lista de itens e o pedido.',
    acessos: ['Lista de ações/insights (id + título)', 'O item identificado (ao montar a mudança)', 'O pedido'],
    blocos: [{ titulo: 'Prompt (identificar)', explicacao: 'Casa o pedido com um item existente; nunca inventa id.', dinamico: true, editavel: false,
      conteudo: `Qual item da lista o dono está mencionando? Só isso.
Lista: {id + titulo}
Pedido dele: "{pedido}"
JSON: { "id": "<id exato da lista, ou null>" }` }],
  },
  {
    id: 'documentos',
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
    nome: 'Gerador de insights (edge function, cron)',
    papel: 'Roda no servidor de tempos em tempos: agrega os feedbacks do período e gera os insights (padrões, riscos, elogios) com prioridade.',
    memoria: 'SEM memória de conversa. Vê os feedbacks agregados e a configuração do restaurante.',
    acessos: ['Feedbacks do período', 'Configuração do restaurante', 'Grava em: insights'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Prioriza risco sanitário/segurança sempre como URGENTE.', dinamico: true, editavel: false,
      conteudo: `Analise os feedbacks e gere insights. Priorize riscos sanitários ou de segurança sempre
como URGENTE, independente do volume. Feedbacks: {json} Config: {json}` }],
  },
  {
    id: 'sugeridor_acoes',
    nome: 'Sugeridor de ações (edge function)',
    papel: 'A partir dos insights, sugere ações operacionais com plano — nunca a partir de um feedback único.',
    memoria: 'SEM memória de conversa. Vê os insights ativos e a configuração.',
    acessos: ['Insights ativos', 'Configuração do restaurante', 'Grava em: acoes_operacionais'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Sempre inclui um plano norteador; nunca age por feedback único.', dinamico: true, editavel: false,
      conteudo: `Sugira ações operacionais baseadas nestes insights. Nunca sugira ação para feedback único.
Sempre inclua um plano detalhado norteador. Insights: {json} Config: {json}` }],
  },
  {
    id: 'plano_acao',
    nome: 'Gerador de plano de ação (edge function)',
    papel: 'Gera o passo a passo detalhado de UMA ação, quando o dono pede o plano.',
    memoria: 'SEM memória de conversa. Vê a ação e o contexto do restaurante.',
    acessos: ['A ação (título/contexto)', 'Configuração do restaurante'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Especialista em gestão e operação de restaurantes.', dinamico: true, editavel: false,
      conteudo: `Você é um especialista em gestão de restaurantes e operações. Gere um plano de ação
detalhado e prático para a ação informada, executável por um restaurante. {dados da ação}` }],
  },
  {
    id: 'perguntas_direcionadas',
    nome: 'Gerador de perguntas direcionadas (edge function)',
    papel: 'Para uma ação PENDENTE, gera perguntas que ajudam o dono a destravá-la.',
    memoria: 'SEM memória de conversa. Vê a ação pendente.',
    acessos: ['A ação pendente e seu contexto'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Gera perguntas objetivas para orientar a execução.', dinamico: true, editavel: false,
      conteudo: `Gere perguntas direcionadas para ajudar o dono a executar esta ação pendente. {dados}` }],
  },
  {
    id: 'banner',
    nome: 'Texto do banner (edge function)',
    papel: 'Cria um texto curto para o banner do painel, com base nos feedbacks das últimas 24h.',
    memoria: 'SEM memória. Vê os feedbacks recentes.',
    acessos: ['Feedbacks das últimas 24h', 'Grava em: config do restaurante (texto_banner)'],
    blocos: [{ titulo: 'Prompt', explicacao: 'Texto curto e direto para o banner.', dinamico: true, editavel: false,
      conteudo: `Gere um texto curto para um banner baseado nestes feedbacks recentes: {json}` }],
  },
  {
    id: 'relatorio_estruturado',
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
    nome: 'Resumo executivo do relatório',
    papel: 'Escreve o resumo executivo do relatório em texto corrido para o dono.',
    memoria: 'SEM memória. Vê os dados do período.',
    acessos: ['Dados do período'],
    blocos: [{ titulo: 'Prompt', explicacao: '3 a 5 frases, sem markdown/jargão, com uma recomendação concreta.', dinamico: true, editavel: false,
      conteudo: `Você escreve o resumo executivo do relatório, lido pelo DONO. Texto corrido, 3 a 5 frases,
sem markdown/títulos/emojis, sem jargão. Nunca invente número. Termine com UMA recomendação
concreta. Dados: {json}` }],
  },
  {
    id: 'despachante',
    nome: 'Despachante (código, sem IA)',
    papel: 'Não é uma IA: é código que recebe o comando do assistente e chama o especialista certo, carregado só com o que precisa. É o que garante que cada agente veja só a sua fatia.',
    memoria: '—',
    acessos: ['O comando emitido pelo assistente', 'Config atual, ações e insights (repassa a fatia certa a cada especialista)'],
    blocos: [],
  },
]
