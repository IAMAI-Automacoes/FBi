import { supabase } from '@/lib/supabase/client'

/** Rótulos amigáveis de cada campo que a IA pode atualizar. */
export const CAMPOS_CONFIG: Record<string, string> = {
  nome: 'seu nome',
  nome_restaurante: 'nome do restaurante',
  tipo_culinaria: 'tipo de cozinha',
  numero_mesas: 'número de mesas',
  localizacao: 'localização',
  estilo: 'estilo',
  capacidade_lugares: 'capacidade de lugares',
  num_funcionarios: 'tamanho da equipe',
  faixa_preco: 'ticket médio',
  horario_funcionamento: 'horário de funcionamento',
  publico_alvo: 'público',
  pratos_destaque: 'pratos que mais saem',
  diferenciais: 'diferenciais',
  desafios: 'desafios',
  ano_abertura: 'ano de abertura',
}
// `detalhes` (descrição do restaurante) e `perfil_notas` (notas da pessoa) são
// campos de texto livre do USUÁRIO — a IA não escreve neles. Ela aprende na
// própria memória (`memoria_assistente`).

// Onde cada campo mora no banco.
// `nome` é de PESSOA (mora em `usuarios`); os demais texto são do restaurante.
const COLUNAS_PESSOA = new Set(['nome'])
const COLUNAS_TEXTO = new Set(['nome_restaurante', 'tipo_culinaria'])
const CAMPOS_JSON = new Set([
  'localizacao', 'estilo', 'capacidade_lugares', 'num_funcionarios', 'faixa_preco',
  'horario_funcionamento', 'publico_alvo', 'pratos_destaque', 'diferenciais', 'desafios', 'ano_abertura',
])

export function campoValido(campo: string): boolean {
  return campo === 'numero_mesas' || COLUNAS_PESSOA.has(campo) || COLUNAS_TEXTO.has(campo) || CAMPOS_JSON.has(campo)
}

/**
 * Atualiza um campo da configuração do restaurante a partir do chat.
 * Grava na coluna própria quando existe, ou dentro de perfil_restaurante (jsonb).
 */
export async function atualizarCampoConfig(
  restauranteId: number,
  campo: string,
  valor: string,
): Promise<void> {
  const v = valor.trim()

  // O update precisa devolver a linha: sem isso, uma falha de permissão (RLS)
  // ou um id errado passariam em silêncio e a IA diria que salvou sem ter salvo.
  const gravar = async (campos: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('restaurantes')
      .update(campos)
      .eq('id', restauranteId)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      throw new Error('Nada foi alterado — verifique se você tem permissão para editar este restaurante.')
    }
  }

  // Campos de pessoa (ex.: nome) moram em `usuarios`; a RLS restringe à própria linha.
  const gravarPessoa = async (campos: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('usuarios')
      .update(campos)
      .eq('restaurante_id', restauranteId)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      throw new Error('Nada foi alterado — verifique se você tem permissão para editar este perfil.')
    }
  }

  if (COLUNAS_PESSOA.has(campo)) {
    await gravarPessoa({ [campo]: v || null })
    return
  }

  if (campo === 'numero_mesas') {
    const n = parseInt(v.replace(/\D/g, ''), 10)
    await gravar({ numero_mesas: Number.isFinite(n) ? n : null })
    return
  }

  if (COLUNAS_TEXTO.has(campo)) {
    await gravar({ [campo]: v || null })
    return
  }

  if (CAMPOS_JSON.has(campo)) {
    // merge: preserva os outros campos do jsonb
    const { data, error } = await supabase
      .from('restaurantes').select('perfil_restaurante').eq('id', restauranteId).single()
    if (error) throw new Error(error.message)
    const perfil = { ...((data?.perfil_restaurante as any) || {}), [campo]: v }
    await gravar({ perfil_restaurante: perfil })
    return
  }

  throw new Error(`Campo desconhecido: ${campo}`)
}

/** Colunas de texto livre onde a IA "anota qualquer coisa". */
export type CampoLivre = 'detalhes' | 'perfil_notas'

/**
 * Acrescenta uma anotação a um campo livre, sem apagar o que já estava.
 * Usado quando um fato afirmado não tem um campo estruturado próprio.
 */
export async function anexarTextoLivre(
  restauranteId: number,
  coluna: CampoLivre,
  texto: string,
): Promise<void> {
  const t = texto.trim()
  if (!t) return
  // `perfil_notas` é de pessoa (tabela `usuarios`, filtrada por restaurante_id +
  // RLS na própria linha); `detalhes` é do restaurante.
  const ehPessoa = coluna === 'perfil_notas'
  const tabela = ehPessoa ? 'usuarios' : 'restaurantes'
  const chave = ehPessoa ? 'restaurante_id' : 'id'

  const { data, error } = await (supabase as any)
    .from(tabela)
    .select(coluna)
    .eq(chave, restauranteId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const atual = String((data as any)?.[coluna] || '').trim()
  // Não duplica se o trecho já estiver anotado
  if (atual.toLowerCase().includes(t.toLowerCase())) return
  const novo = atual ? `${atual}\n${t}` : t

  const { data: linhas, error: erroGravar } = await (supabase as any)
    .from(tabela)
    .update({ [coluna]: novo })
    .eq(chave, restauranteId)
    .select('id')
  if (erroGravar) throw new Error(erroGravar.message)
  if (!linhas || linhas.length === 0) {
    throw new Error('Nada foi anotado — verifique a permissão para editar este perfil.')
  }
}
