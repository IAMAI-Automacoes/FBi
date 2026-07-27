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
      editavel: false,
      conteudo: `Você é o {nome}, assistente do painel de um restaurante. O sistema executou
uma tarefa que o dono pediu e te passou o resultado. Escreva a resposta em 1 ou 2 frases
curtas e naturais.

RESULTADO DO SISTEMA (é a única verdade — não acrescente nada que não esteja aqui):
"""
{relatorio}
"""

{instrução conforme a situação: preparado / aplicado / falhou}

Não use listas nem títulos. Não se apresente, não repita seu nome e não chame o leitor de "dono".`,
    }],
  },
  {
    id: 'extrair_assunto',
    nome: 'Extrator de assunto',
    papel: 'Ao pedir para criar ação/insight, decide se o pedido já tem um ASSUNTO concreto do restaurante. Se não tiver, o sistema mostra o formulário em vez de inventar um tema.',
    memoria: 'SEM memória. Vê só o pedido.',
    acessos: ['O pedido do dono (o texto do comando)'],
    blocos: [{
      titulo: 'Prompt', explicacao: 'Responde apenas se há assunto concreto, nunca inventa.', dinamico: true, editavel: false,
      conteudo: `O dono pediu para criar {uma ação | um insight}. Sua única tarefa: dizer se o pedido
já contém um ASSUNTO CONCRETO — um problema, tarefa ou tema real do restaurante.
Pedido: "{pedido}"
JSON: { "temAssunto": true|false, "assunto": "..." }
temAssunto = false quando é genérico, meta/sistema, ou não concreto. NUNCA invente.`,
    }],
  },
  {
    id: 'montar_acao_insight',
    nome: 'Montador de ação / insight',
    papel: 'Com o assunto em mãos, preenche os campos de uma ação (título, plano, prioridade, categoria) ou de um insight (título, descrição, sugestão…).',
    memoria: 'SEM memória. Vê só o assunto/pedido.',
    acessos: ['O assunto/pedido concreto'],
    blocos: [{
      titulo: 'Prompt (ação)', explicacao: 'Fica estritamente no assunto; não inventa outro tema.', dinamico: true, editavel: false,
      conteudo: `Você monta os campos de UMA ação operacional de restaurante. Só isso.
Assunto da ação: "{pedido}"
JSON: { "titulo_acao": "...", "plano_detalhado": "...", "prioridade": "URGENTE|IMPORTANTE|OBSERVACAO",
"categoria": "Servico|Comida|Ambiente|Preco|Agilidade|Geral", "status": "PENDENTE" }
Fique estritamente no assunto. Sem prioridade dita, use IMPORTANTE.`,
    }],
  },
  {
    id: 'montar_config',
    nome: 'Montador de configuração',
    papel: 'Quando o dono muda/afirma um dado do perfil, decide QUAL campo e QUAL valor novo.',
    memoria: 'SEM memória da conversa. Vê os valores atuais da configuração.',
    acessos: ['A frase do dono', 'Os valores atuais de todos os campos do perfil'],
    blocos: [{
      titulo: 'Prompt', explicacao: 'Mapeia a frase para o campo certo; devolve null se nada muda.', dinamico: true, editavel: false,
      conteudo: `O dono disse algo que pode mudar um dado do perfil.
Campos (chave = significado): {lista de campos}
Valores atuais: {json}
Frase dele: "{pedido}"
JSON: { "campo": "<chave exata ou null>", "valor": "<novo valor>" }
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
    blocos: [{ titulo: 'Prompt', explicacao: 'Descreve só o que está no arquivo; não inventa.', dinamico: true, editavel: false,
      conteudo: `Você lê UM documento e resume o conteúdo dele. Você não tem histórico e não conhece
nenhum outro arquivo: descreva SOMENTE o que está no texto. Nome: "{nome}". Conteúdo: """{texto}"""
JSON: { "tipo": "...", "resumo": "...", "pontos": ["fato 1", ...] }` }],
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
    id: 'despachante',
    nome: 'Despachante (código, sem IA)',
    papel: 'Não é uma IA: é código que recebe o comando do assistente e chama o especialista certo, carregado só com o que precisa. É o que garante que cada agente veja só a sua fatia.',
    memoria: '—',
    acessos: ['O comando emitido pelo assistente', 'Config atual, ações e insights (repassa a fatia certa a cada especialista)'],
    blocos: [],
  },
]
