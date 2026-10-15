/**
 * Campos de "Sobre o restaurante" que o dono precisa preencher.
 *
 * São exatamente os que o `blocoPerfil` (supabase/functions/_shared/perfil.ts)
 * manda para a IA: sem eles as ações e as respostas saem genéricas. Nada
 * bloqueia o salvar — o que falta vira aviso amarelo no avatar, no menu e na
 * própria seção, até ser preenchido.
 */
export const CAMPOS_OBRIGATORIOS = [
  'tipo_culinaria',
  'localizacao',
  'numero_mesas',
  'capacidade_lugares',
  'num_funcionarios',
  'faixa_preco',
  'horario_funcionamento',
  'publico_alvo',
  'detalhes',
] as const

export type CampoObrigatorio = (typeof CAMPOS_OBRIGATORIOS)[number]

/** Os obrigatórios ainda vazios (só espaço também conta como vazio). */
export function camposFaltando(valores: Partial<Record<CampoObrigatorio, unknown>>): CampoObrigatorio[] {
  return CAMPOS_OBRIGATORIOS.filter((c) => !String(valores[c] ?? '').trim())
}

/**
 * Lê uma linha de `restaurantes` no formato do formulário: tipo de cozinha,
 * mesas e o texto livre têm coluna própria; o resto mora no jsonb.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- linha crua do supabase
export function perfilDaLinha(r: any): Partial<Record<CampoObrigatorio, unknown>> {
  const p = (r?.perfil_restaurante as Record<string, unknown>) || {}
  return {
    ...p,
    tipo_culinaria: r?.tipo_culinaria || p.tipo_culinaria || '',
    numero_mesas: r?.numero_mesas ?? '',
    detalhes: r?.detalhes || '',
  }
}
