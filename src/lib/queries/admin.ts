import { supabase } from '@/lib/supabase/client'

export interface RespostaAdmin {
  id: string
  texto: string
  autor: string
  arquivos: string[]
  created_at: string
  responde_a: string | null
}

export interface ReacaoAdmin {
  mensagem_id: string
  autor: 'cliente' | 'admin'
  emoji: string
  created_at: string
}

export interface PerfilRestaurante {
  nome: string | null
  email: string | null
  avatar_url: string | null
  nome_restaurante: string | null
  logo_url: string | null
  numero_whatsapp: string | null
  tipo_culinaria: string | null
  numero_mesas: number | null
  detalhes: string | null
}

export interface SugestaoAdmin {
  id: string
  texto: string
  titulo: string | null
  arquivos: string[]
  status: 'aberta' | 'respondida' | 'finalizada'
  created_at: string
  usuario_id: string
  usuario_nome: string | null
  usuario_email: string | null
  admin_leu_em: string | null
  cliente_leu_em: string | null
  perfil: PerfilRestaurante | null
  respostas: RespostaAdmin[]
  reacoes: ReacaoAdmin[]
}

export interface DivisaoReceita {
  id: string
  nome: string
  chave_pix: string | null
  tipo: 'porcentagem' | 'valor_fixo'
  valor: number
  ativo: boolean
  created_at: string
}

export async function buscarTodasSugestoes(): Promise<SugestaoAdmin[]> {
  const { data: sugestoes, error } = await supabase
    .from('sugestoes_plataforma')
    .select(`
      id, texto, titulo, arquivos, status, created_at, usuario_id,
      admin_leu_em, cliente_leu_em,
      respostas_sugestoes (id, texto, autor, arquivos, created_at, responde_a),
      reacoes_sugestoes (mensagem_id, autor, emoji, created_at)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!sugestoes || sugestoes.length === 0) return []

  const usuarioIds = [...new Set((sugestoes as any[]).map((s) => s.usuario_id).filter(Boolean))]

  // Dados do restaurante vêm de `restaurantes`; os da pessoa (nome/email/avatar)
  // de `usuarios`. Une-se pelo id do auth (usuario_id da sugestão).
  const { data: restaurantes } = await supabase
    .from('restaurantes')
    .select('auth_user_id, nome_restaurante, logo_url, numero_whatsapp, tipo_culinaria, numero_mesas, detalhes')
    .in('auth_user_id', usuarioIds)

  const { data: pessoas } = await supabase
    .from('usuarios')
    .select('id, nome, email, avatar_url')
    .in('id', usuarioIds)

  const pessoaMap: Record<string, any> = {}
  for (const p of pessoas ?? []) pessoaMap[p.id] = p

  const userMap: Record<string, PerfilRestaurante> = {}
  for (const r of restaurantes ?? []) {
    if (r.auth_user_id) {
      const p = pessoaMap[r.auth_user_id] || {}
      userMap[r.auth_user_id] = {
        nome: p.nome ?? null,
        email: p.email ?? null,
        avatar_url: p.avatar_url ?? null,
        nome_restaurante: r.nome_restaurante ?? null,
        logo_url: r.logo_url ?? null,
        numero_whatsapp: r.numero_whatsapp ?? null,
        tipo_culinaria: r.tipo_culinaria ?? null,
        numero_mesas: r.numero_mesas ?? null,
        detalhes: r.detalhes ?? null,
      }
    }
  }

  return (sugestoes as any[]).map((s) => ({
    id: s.id,
    texto: s.texto,
    titulo: s.titulo ?? null,
    arquivos: Array.isArray(s.arquivos) ? s.arquivos : [],
    status: s.status,
    created_at: s.created_at,
    usuario_id: s.usuario_id,
    usuario_nome: userMap[s.usuario_id]?.nome ?? null,
    usuario_email: userMap[s.usuario_id]?.email ?? null,
    perfil: userMap[s.usuario_id] ?? null,
    admin_leu_em: s.admin_leu_em ?? null,
    cliente_leu_em: s.cliente_leu_em ?? null,
    respostas: ((s.respostas_sugestoes ?? []) as any[])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((r) => ({
        id: r.id,
        texto: r.texto,
        autor: r.autor,
        arquivos: Array.isArray(r.arquivos) ? r.arquivos : [],
        created_at: r.created_at,
        responde_a: r.responde_a ?? null,
      })),
    reacoes: (s.reacoes_sugestoes ?? []) as ReacaoAdmin[],
  }))
}

export async function responderSugestao(
  sugestaoId: string,
  texto: string,
  arquivoPaths: string[],
  respondeA: string | null = null,
): Promise<void> {
  const { error } = await supabase.from('respostas_sugestoes').insert({
    sugestao_id: sugestaoId,
    texto,
    arquivos: arquivoPaths,
    responde_a: respondeA,
  })
  if (error) throw error
}

export async function editarRespostaAdmin(
  id: string,
  texto: string,
  arquivos: string[],
  respondeA: string | null = null,
): Promise<void> {
  const { error } = await supabase
    .from('respostas_sugestoes')
    .update({ texto, arquivos, responde_a: respondeA })
    .eq('id', id)
  if (error) throw error
}

export async function excluirRespostaAdmin(id: string): Promise<void> {
  const { error } = await supabase.from('respostas_sugestoes').delete().eq('id', id)
  if (error) throw error
}

export async function excluirArquivosAdmin(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from('sugestoes-plataforma').remove(paths)
  if (error) throw error
}

export async function buscarTotalNaoLidas(): Promise<number> {
  const { data, error } = await supabase
    .from('sugestoes_plataforma')
    .select('id, created_at, admin_leu_em, respostas_sugestoes(autor, created_at)')
  if (error || !data) return 0

  let total = 0
  for (const s of data as any[]) {
    const respostas = ((s.respostas_sugestoes ?? []) as { autor: string; created_at: string }[])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    if (s.admin_leu_em) {
      const leuEm = new Date(s.admin_leu_em)
      total += respostas.filter((r) => r.autor === 'usuario' && new Date(r.created_at) > leuEm).length
    } else {
      // Nunca lida: mensagens do usuário após a última resposta do admin
      const adminReplies = respostas.filter((r) => r.autor !== 'usuario')
      if (adminReplies.length === 0) {
        total += 1 + respostas.filter((r) => r.autor === 'usuario').length
      } else {
        const lastAdmin = new Date(adminReplies[adminReplies.length - 1].created_at)
        total += respostas.filter((r) => r.autor === 'usuario' && new Date(r.created_at) > lastAdmin).length
      }
    }
  }
  return total
}

export async function reagirAdmin(
  sugestaoId: string,
  mensagemId: string,
  emoji: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from('reacoes_sugestoes')
    .select('id, emoji')
    .eq('mensagem_id', mensagemId)
    .eq('autor', 'admin')
    .maybeSingle()

  if (existing) {
    if (existing.emoji === emoji) {
      await supabase.from('reacoes_sugestoes').delete().eq('id', existing.id)
    } else {
      // Bumpa created_at: reagir/trocar é a ação mais recente
      await supabase
        .from('reacoes_sugestoes')
        .update({ emoji, created_at: new Date().toISOString() })
        .eq('id', existing.id)
    }
  } else {
    await supabase.from('reacoes_sugestoes').insert({
      sugestao_id: sugestaoId,
      mensagem_id: mensagemId,
      autor: 'admin',
      emoji,
    })
  }
}

export async function marcarAdminLeu(sugestaoId: string): Promise<void> {
  await supabase
    .from('sugestoes_plataforma')
    .update({ admin_leu_em: new Date().toISOString() })
    .eq('id', sugestaoId)
}

export async function resetClienteLeu(sugestaoId: string, beforeTime: string): Promise<void> {
  const rollbackTo = new Date(new Date(beforeTime).getTime() - 1).toISOString()
  await supabase
    .from('sugestoes_plataforma')
    .update({ cliente_leu_em: rollbackTo })
    .eq('id', sugestaoId)
}

export async function uploadArquivosResposta(sugestaoId: string, files: File[]): Promise<string[]> {
  const paths: string[] = []
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `admin/${sugestaoId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`
    const { error } = await supabase.storage
      .from('sugestoes-plataforma')
      .upload(path, file, { upsert: false })
    if (error) throw error
    paths.push(path)
  }
  return paths
}

// ── Afiliados ─────────────────────────────────────────────────────────────────

export interface Afiliado {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  codigo: string
  comissao_tipo: 'porcentagem' | 'valor_fixo'
  comissao_valor: number
  // Dados para payout via Stripe (Brasil)
  stripe_account_id: string | null
  cpf_cnpj: string | null
  chave_pix: string | null
  codigo_banco: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo_conta: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
}

export async function buscarAfiliados(): Promise<Afiliado[]> {
  const { data, error } = await supabase
    .from('afiliados')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Afiliado[]
}

export async function criarAfiliado(input: Omit<Afiliado, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('afiliados').insert(input)
  if (error) throw error
}

export async function atualizarAfiliado(
  id: string,
  input: Partial<Omit<Afiliado, 'id' | 'created_at'>>,
): Promise<void> {
  const { error } = await supabase.from('afiliados').update(input).eq('id', id)
  if (error) throw error
}

export async function excluirAfiliado(id: string): Promise<void> {
  const { error } = await supabase.from('afiliados').delete().eq('id', id)
  if (error) throw error
}

// ── Cupons ────────────────────────────────────────────────────────────────────

export interface Cupon {
  id: number
  cupom: string
  tipo_desconto: 'porcentagem' | 'valor_fixo'
  porcentagem_desconto: number | null
  valor_desconto: number | null
  dias_validade: number | null
  vezes_uso_maximo: number | null
  vezes_usado: number
  ativo: boolean
  created_at: string
}

export type CuponInput = {
  cupom: string
  tipo_desconto: 'porcentagem' | 'valor_fixo'
  valor: number
  dias_validade: number | null
  vezes_uso_maximo: number | null
  ativo: boolean
}

export async function buscarCupons(): Promise<Cupon[]> {
  const { data, error } = await supabase
    .from('cupons')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as any[]).map((c) => ({
    id: c.id,
    cupom: c.cupom ?? '',
    tipo_desconto: (c.porcentagem_desconto != null ? 'porcentagem' : 'valor_fixo') as 'porcentagem' | 'valor_fixo',
    porcentagem_desconto: c.porcentagem_desconto ?? null,
    valor_desconto: c.valor_desconto ?? null,
    dias_validade: c.dias_validade ?? null,
    vezes_uso_maximo: c.vezes_uso_maximo ?? null,
    vezes_usado: c.vezes_usado ?? 0,
    ativo: c.ativo ?? true,
    created_at: c.created_at,
  }))
}

function cuponToRow(input: CuponInput) {
  return {
    cupom: input.cupom,
    porcentagem_desconto: input.tipo_desconto === 'porcentagem' ? input.valor : null,
    valor_desconto: input.tipo_desconto === 'valor_fixo' ? input.valor : null,
    dias_validade: input.dias_validade,
    vezes_uso_maximo: input.vezes_uso_maximo,
    ativo: input.ativo,
  }
}

export async function criarCupon(input: CuponInput): Promise<void> {
  const { error } = await supabase.from('cupons').insert({ ...cuponToRow(input), vezes_usado: 0 })
  if (error) throw error
}

export async function atualizarCupon(id: number, input: CuponInput): Promise<void> {
  const { error } = await supabase.from('cupons').update(cuponToRow(input)).eq('id', id)
  if (error) throw error
}

export async function excluirCupon(id: number): Promise<void> {
  const { error } = await supabase.from('cupons').delete().eq('id', id)
  if (error) throw error
}

// ── Divisão de Receita ────────────────────────────────────────────────────────

export async function buscarDivisoes(): Promise<DivisaoReceita[]> {
  const { data, error } = await supabase
    .from('divisao_receita')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as DivisaoReceita[]
}

export async function criarDivisao(
  input: Omit<DivisaoReceita, 'id' | 'created_at'>,
): Promise<void> {
  const { error } = await supabase.from('divisao_receita').insert(input)
  if (error) throw error
}

export async function atualizarDivisao(
  id: string,
  input: Partial<Omit<DivisaoReceita, 'id' | 'created_at'>>,
): Promise<void> {
  const { error } = await supabase.from('divisao_receita').update(input).eq('id', id)
  if (error) throw error
}

export async function excluirDivisao(id: string): Promise<void> {
  const { error } = await supabase.from('divisao_receita').delete().eq('id', id)
  if (error) throw error
}

// ── Contas (assinatura) ───────────────────────────────────────────────────────
// Enquanto o pagamento automático não existe, é por aqui que uma conta é
// liberada. Depois o webhook do Stripe passa a escrever na mesma coluna.
//
// Leitura de todas as contas: policy `admins_read_restaurantes`.
// Escrita: policy `admins_update_restaurantes` + exceção no trigger
// `proteger_colunas_assinatura`. Usuário comum não consegue mexer nisso.

export type AssinaturaStatus = 'sem_assinatura' | 'ativa' | 'inadimplente' | 'cancelada'

export interface ContaAdmin {
  id: number
  nome: string | null
  email: string | null
  nome_restaurante: string | null
  assinatura_status: AssinaturaStatus
  plano_ciclo: string | null
  onboarding_completo: boolean
  /** Nulo = conta ativa. Preenchido = excluída (reversível). */
  excluida_em: string | null
  created_at: string
}

export async function buscarContas(): Promise<ContaAdmin[]> {
  const { data, error } = await supabase
    .from('restaurantes')
    .select('id, nome_restaurante, assinatura_status, plano_ciclo, onboarding_completo, excluida_em, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error

  // nome/email da pessoa vêm de `usuarios` (unido por restaurante_id)
  const { data: pessoas } = await supabase.from('usuarios').select('restaurante_id, nome, email')
  const pessoaPorRest: Record<number, { nome: string | null; email: string | null }> = {}
  for (const p of (pessoas ?? []) as any[]) {
    pessoaPorRest[p.restaurante_id] = { nome: p.nome ?? null, email: p.email ?? null }
  }

  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    nome: pessoaPorRest[r.id]?.nome ?? null,
    email: pessoaPorRest[r.id]?.email ?? null,
    nome_restaurante: r.nome_restaurante ?? null,
    assinatura_status: r.assinatura_status,
    plano_ciclo: r.plano_ciclo ?? null,
    onboarding_completo: r.onboarding_completo,
    excluida_em: r.excluida_em ?? null,
    created_at: r.created_at,
  })) as ContaAdmin[]
}

export async function definirAssinatura(id: number, status: AssinaturaStatus): Promise<void> {
  const { error } = await supabase
    .from('restaurantes')
    .update({ assinatura_status: status } as never)
    .eq('id', id)
  if (error) throw error
}

/** Exclusão reversível. Não apaga nada: só marca a data.
    Conta excluída não entra no software, mas os dados continuam no banco. */
export async function definirExclusaoConta(id: number, excluir: boolean): Promise<void> {
  const { error } = await supabase
    .from('restaurantes')
    .update({ excluida_em: excluir ? new Date().toISOString() : null } as never)
    .eq('id', id)
  if (error) throw error
}
