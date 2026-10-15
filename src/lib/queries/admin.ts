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
  /** A versão do EasyFeed da conta ('restaurante' | 'rh'; nulo = ainda não escolheu). */
  area: string | null
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
    .select('auth_user_id, nome_restaurante, logo_url, numero_whatsapp, tipo_culinaria, numero_mesas, detalhes, area')
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
        area: r.area ?? null,
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
  /** nao_conectado | pendente | ativo | restrito — atualizado pelo servidor
      (`conectar-afiliado` e webhook `account.updated`). Só leitura no painel. */
  stripe_connect_status: string
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
  /** De qual software é o afiliado. */
  area: 'restaurante' | 'rh'
  /** Preenchido = é uma conta EasyFeed indicando (ganha a % como desconto na
      própria mensalidade, depois do 2º mês pago do indicado). */
  restaurante_id: number | null
}

/** Os afiliados de um software: os de fora (comissão em dinheiro) e as contas
    EasyFeed que pegaram o link em Descontos → Indicações (desconto). */
export async function buscarAfiliados(area: 'restaurante' | 'rh'): Promise<Afiliado[]> {
  const { data, error } = await supabase
    .from('afiliados')
    .select('*')
    .eq('area', area)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Afiliado[]
}

/** Os códigos que já existem (o código é único em todos os softwares). */
export async function buscarCodigosDeAfiliado(): Promise<Set<string>> {
  const { data, error } = await supabase.from('afiliados').select('codigo')
  if (error) throw error
  return new Set((data ?? []).map((a) => String(a.codigo).toUpperCase()))
}

// `stripe_connect_status` nasce com o default do banco e só o servidor muda.
export async function criarAfiliado(
  input: Omit<Afiliado, 'id' | 'created_at' | 'stripe_connect_status' | 'restaurante_id'>,
): Promise<void> {
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

/**
 * Um cupom: libera acesso (dias, ou sem fim) e/ou guarda um desconto em % ou
 * R$ para a cobrança. É de um software só e escolhe o tipo de conta que cria.
 * A regra do que ele dá é a mesma do resgate (supabase/functions/_shared/cupom.ts).
 * Até 15/10/2026 o desconto não existia de verdade (o resgate não lia as
 * colunas); agora fica guardado em `cupons_usos` e entra na cobrança quando o
 * pagamento novo (Asaas) chegar.
 */
export interface Cupon {
  id: number
  cupom: string
  /** Dias de acesso liberados. `null` = acesso sem data para acabar. */
  dias_validade: number | null
  /** Quantas vezes ainda pode ser resgatado. `null` = ilimitado. */
  vezes_uso_maximo: number | null
  vezes_usado: number
  ativo: boolean
  /** Último dia em que o cupom pode ser RESGATADO. `null` = sempre. */
  data_expiracao: string | null
  /** Só email marcado como vendedor resgata (ex.: VENDEDOR100). */
  somente_vendedores: boolean
  /** De qual software é o cupom (só conta dele resgata). */
  area: 'restaurante' | 'rh'
  /** O que a conta vira ao resgatar. */
  tipo_conta: 'normal' | 'vendedor' | 'admin'
  /** Desconto guardado para a cobrança (entra com o pagamento novo). Um ou outro. */
  porcentagem_desconto: number | null
  valor_desconto: number | null
  created_at: string
}

export type CuponInput = {
  cupom: string
  dias_validade: number | null
  vezes_uso_maximo: number | null
  ativo: boolean
  data_expiracao: string | null
  somente_vendedores: boolean
  area: 'restaurante' | 'rh'
  tipo_conta: 'normal' | 'vendedor' | 'admin'
  porcentagem_desconto: number | null
  valor_desconto: number | null
}

/** Os cupons de um software. */
export async function buscarCupons(area: 'restaurante' | 'rh'): Promise<Cupon[]> {
  const { data, error } = await supabase
    .from('cupons')
    .select('*')
    .eq('area', area)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as any[]).map((c) => ({
    id: c.id,
    cupom: c.cupom ?? '',
    dias_validade: c.dias_validade ?? null,
    vezes_uso_maximo: c.vezes_uso_maximo ?? null,
    vezes_usado: c.vezes_usado ?? 0,
    ativo: c.ativo ?? true,
    data_expiracao: c.data_expiracao ?? null,
    somente_vendedores: c.somente_vendedores === true,
    area: c.area === 'rh' ? 'rh' : 'restaurante',
    tipo_conta: c.tipo_conta === 'vendedor' || c.tipo_conta === 'admin' ? c.tipo_conta : 'normal',
    porcentagem_desconto: c.porcentagem_desconto != null ? Number(c.porcentagem_desconto) : null,
    valor_desconto: c.valor_desconto != null ? Number(c.valor_desconto) : null,
    created_at: c.created_at,
  }))
}

function cuponToRow(input: CuponInput) {
  return {
    cupom: input.cupom,
    dias_validade: input.dias_validade,
    vezes_uso_maximo: input.vezes_uso_maximo,
    ativo: input.ativo,
    data_expiracao: input.data_expiracao,
    somente_vendedores: input.somente_vendedores,
    area: input.area,
    tipo_conta: input.tipo_conta,
    porcentagem_desconto: input.porcentagem_desconto,
    valor_desconto: input.valor_desconto,
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
  /** A versão do EasyFeed: 'restaurante' | 'rh' (lib/areas.ts). Nulo = ainda não escolheu. */
  area: string | null
}

export async function buscarContas(): Promise<ContaAdmin[]> {
  const { data, error } = await supabase
    .from('restaurantes')
    .select('id, nome_restaurante, assinatura_status, plano_ciclo, onboarding_completo, excluida_em, created_at, area')
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
    area: r.area ?? null,
  })) as ContaAdmin[]
}

// ── Aba WhatsApp do painel do admin ─────────────────────────────────────────
// Leitura pela policy `admins_read_restaurantes`. O token da instância não
// fica na tela: vira só "tem instância" (é o mesmo critério do aviso
// "WhatsApp desconectado" que o dono vê).

export interface RestauranteWhatsappAdmin {
  id: number
  nome: string | null
  logo_url: string | null
  email: string | null
  /** Número do WhatsApp do restaurante (preenchido = conectado). */
  numero_whatsapp: string | null
  /** WhatsApp pessoal do dono. */
  whatsapp_dono: string | null
  /** Tem instância criada na uazapi (whatsapp_token). */
  temInstancia: boolean
  /** WhatsApp conectado de verdade (conferido com a uazapi; ver whatsapp_conectado). */
  conectado: boolean
  excluida_em: string | null
  /** A versão do EasyFeed da conta (o painel só lista as da versão na tela). */
  area: string | null
}

export async function buscarRestaurantesWhatsapp(): Promise<RestauranteWhatsappAdmin[]> {
  const { data, error } = await supabase
    .from('restaurantes')
    .select('id, nome_restaurante, logo_url, email, numero_whatsapp, whatsapp_dono, whatsapp_token, whatsapp_conectado, excluida_em, area')
    .order('nome_restaurante', { ascending: true })
  if (error) throw error
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    nome: r.nome_restaurante ?? null,
    logo_url: r.logo_url || null,
    email: r.email ?? null,
    numero_whatsapp: r.numero_whatsapp || null,
    whatsapp_dono: r.whatsapp_dono || null,
    temInstancia: !!r.whatsapp_token,
    conectado: r.whatsapp_conectado === true,
    excluida_em: r.excluida_em ?? null,
    area: r.area ?? null,
  }))
}

export async function definirAssinatura(id: number, status: AssinaturaStatus): Promise<void> {
  const { error } = await supabase
    .from('restaurantes')
    .update({ assinatura_status: status } as never)
    .eq('id', id)
  if (error) throw error
}

/** Exclusão reversível. Não apaga os dados: só marca a data. Conta excluída não
    entra no software, mas continua no banco. Ao excluir, uma edge function
    (service_role) também derruba a instância do WhatsApp na uazapi (libera o
    slot pago) — por isso não é mais um UPDATE direto daqui. */
export async function definirExclusaoConta(id: number, excluir: boolean): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-excluir-conta', {
    body: { restaurante_id: id, excluir },
  })
  if (error) {
    let detalhe = error.message
    try {
      const corpo = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.()
      if (corpo?.error) detalhe = corpo.error
    } catch { /* mantém a mensagem original */ }
    throw new Error(detalhe)
  }
  if (data?.error) throw new Error(data.error)
}
