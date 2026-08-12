/**
 * Perfil do restaurante e personalidade do assistente, em um lugar só.
 *
 * Antes existiam três versões divergentes deste bloco — o chat montava 14
 * campos, gerar-insights 13 e sugerir-acoes 9 — então a mesma configuração
 * chegava a uns agentes e não a outros. Aqui a fonte é única; acrescentar um
 * campo novo passa a valer para todas as edge functions de uma vez.
 *
 * Espelha src/lib/prompts-sistema.ts (bloco "Perfil do restaurante"), que roda
 * no navegador e por isso segue separado.
 */

const PERSONALIDADES: Record<string, string> = {
  direto_objetivo:
    'Seja direto ao ponto: respostas curtas, precisas e focadas no que o gestor precisa para agir imediatamente.',
  detalhado_analitico:
    'Seja analítico: examine em profundidade, aponte padrões e correlações, e fundamente com dados e exemplos.',
  motivador_positivo:
    'Seja encorajador: apresente os dados de forma construtiva, destacando oportunidades e reconhecendo os pontos positivos.',
  formal_profissional:
    'Seja formal e corporativo: linguagem estruturada e executiva ao comunicar análises e recomendações.',
}

/** Instrução de tom escolhida pelo dono nas Configurações. */
export function tomDoAssistente(mascoteConfig: unknown): string {
  const p = (mascoteConfig as { personalidade?: string } | null)?.personalidade
  return PERSONALIDADES[p ?? ''] || PERSONALIDADES.direto_objetivo
}

/** Nome do assistente escolhido pelo dono. */
export function nomeDoAssistente(mascoteConfig: unknown): string {
  const n = (mascoteConfig as { nome?: string } | null)?.nome
  return (typeof n === 'string' && n.trim()) || 'Chef Pepê'
}

/**
 * Bloco legível com tudo o que o dono preencheu em "Sobre o Restaurante".
 * Campos vazios somem em vez de virar "não informado", para não gastar contexto
 * nem sugerir à IA que existe um dado onde não existe.
 */
// deno-lint-ignore no-explicit-any
export function blocoPerfil(r: any): string {
  const p = (r?.perfil_restaurante as Record<string, unknown>) || {}
  const servicos = Array.isArray(p.servicos) && p.servicos.length ? p.servicos.join(', ') : ''

  const linhas = [
    r?.nome_restaurante ? `Nome: ${r.nome_restaurante}` : '',
    r?.tipo_culinaria ? `Tipo de cozinha: ${r.tipo_culinaria}` : '',
    p.estilo ? `Estilo: ${p.estilo}` : '',
    p.localizacao ? `Localização: ${p.localizacao}` : '',
    r?.numero_mesas ? `Mesas: ${r.numero_mesas}` : '',
    p.capacidade_lugares ? `Capacidade: ${p.capacidade_lugares} lugares` : '',
    p.num_funcionarios ? `Equipe: ${p.num_funcionarios} funcionários` : '',
    p.faixa_preco ? `Ticket médio / faixa de preço: ${p.faixa_preco}` : '',
    p.horario_funcionamento ? `Horário de funcionamento: ${p.horario_funcionamento}` : '',
    p.publico_alvo ? `Público: ${p.publico_alvo}` : '',
    p.pratos_destaque
      ? `Pratos e bebidas que mais saem / carro-chefe / destaques (é tudo o mesmo campo): ${p.pratos_destaque}`
      : '',
    servicos ? `Serviços oferecidos: ${servicos}` : '',
    p.diferenciais ? `Diferenciais: ${p.diferenciais}` : '',
    p.desafios ? `Desafios atuais relatados pelo dono: ${p.desafios}` : '',
    p.ano_abertura ? `Aberto desde: ${p.ano_abertura}` : '',
    r?.detalhes
      ? `\nTexto escrito PELO DONO sobre o restaurante (o "eu" abaixo é ele, não você — use como informação, nunca repita literalmente):\n"""\n${r.detalhes}\n"""`
      : '',
  ].filter(Boolean)

  return linhas.length ? linhas.join('\n') : 'Perfil ainda não preenchido.'
}

/**
 * Trechos dos materiais de treinamento relevantes para a consulta.
 *
 * A RPC já inclui o material global da plataforma (restaurante_id nulo) junto
 * do material do próprio restaurante. Falhar aqui devolve string vazia: sem
 * embasamento a IA ainda responde, mas sem gerar erro para o usuário.
 */
export async function buscarConhecimento(
  // deno-lint-ignore no-explicit-any
  db: any,
  restauranteId: number,
  consulta: string,
  limite = 6,
): Promise<string> {
  try {
    if (!consulta.trim()) return ''
    // @ts-ignore - Supabase.ai existe no runtime das edge functions
    const sessao = new Supabase.ai.Session('gte-small')
    const emb = await sessao.run(consulta.slice(0, 4000), { mean_pool: true, normalize: true })
    const { data } = await db.rpc('buscar_conhecimento_para', {
      consulta_embedding: emb,
      p_restaurante_id: restauranteId,
      consulta_texto: consulta.slice(0, 500),
      limite,
    })
    if (!data || !data.length) return ''
    // deno-lint-ignore no-explicit-any
    return data.map((t: any, i: number) => `[${i + 1}] (${t.titulo})\n${t.conteudo}`).join('\n\n')
  } catch (e) {
    console.error('Falha na busca de conhecimento:', e)
    return ''
  }
}
