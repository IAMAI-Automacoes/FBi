import { supabase } from '@/lib/supabase/client'
import type { ConviteAnonimo, Envio, Frequencia, Funcionario, StatusConvite, StatusEnvio, TipoEnvio } from '@/lib/equipe'

/* Feedback da equipe: o restaurante cadastra os funcionários e pede feedback
   pelo WhatsApp dele (o mesmo dos clientes). Os pedidos (envios e convites)
   quem grava é a função `equipe`; aqui a tela lê e cuida do cadastro.

   O que a equipe responde NÃO passa por este arquivo: entra pelo n8n e aparece
   nas páginas /equipe/feedbacks, /equipe/insights e /equipe/acoes, que usam as
   consultas de sempre (`queries/feedbacks.ts`, `acoes.ts`…) com o cabeçalho
   `x-publico: equipe` (ver `lib/publico-rota.ts`). */

// ── Funcionários ─────────────────────────────────────────────────────────────

export async function buscarFuncionarios(restauranteId: number): Promise<Funcionario[]> {
  const { data, error } = await supabase.from('equipe_funcionarios')
    .select('id, restaurante_id, nome, telefone, funcao, ativo, opt_out_em, criado_em')
    .eq('restaurante_id', restauranteId).order('nome')
  if (error) throw error
  return (data ?? []).map((f) => ({ ...f, id: Number(f.id), restaurante_id: Number(f.restaurante_id) }))
}

export interface FuncionarioParaSalvar { id?: number; nome: string; telefone: string; funcao: string; ativo: boolean }

/** '23505' = já existe alguém com este número no restaurante. */
export const ehNumeroRepetido = (e: unknown) => (e as { code?: string } | null)?.code === '23505'

export async function salvarFuncionario(restauranteId: number, f: FuncionarioParaSalvar): Promise<void> {
  const linha = { nome: f.nome.trim(), telefone: f.telefone, funcao: f.funcao.trim(), ativo: f.ativo }
  const { error } = f.id
    ? await supabase.from('equipe_funcionarios').update(linha).eq('id', f.id)
    : await supabase.from('equipe_funcionarios').insert({ ...linha, restaurante_id: restauranteId })
  if (error) throw error
}

/** Vários de uma vez (lista colada ou os garçons). Quem já existe é pulado. Devolve quantos entraram. */
export async function adicionarFuncionarios(restauranteId: number, lista: { nome: string; telefone: string; funcao: string }[]): Promise<number> {
  let entraram = 0
  for (const f of lista) {
    const { error } = await supabase.from('equipe_funcionarios')
      .insert({ restaurante_id: restauranteId, nome: f.nome.trim(), telefone: f.telefone, funcao: f.funcao.trim() })
    if (!error) entraram++
    else if (!ehNumeroRepetido(error)) throw error
  }
  return entraram
}

export async function removerFuncionario(id: number): Promise<void> {
  const { error } = await supabase.from('equipe_funcionarios').delete().eq('id', id)
  if (error) throw error
}

/** A pessoa pediu para voltar a receber: apaga o PARAR. */
export async function voltarAEnviar(id: number): Promise<void> {
  const { error } = await supabase.from('equipe_funcionarios').update({ opt_out_em: null, opt_out_motivo: null }).eq('id', id)
  if (error) throw error
}

/** Os garçons ativos que já têm número (para trazer para a equipe sem digitar de novo). */
export async function buscarGarconsComNumero(restauranteId: number): Promise<{ nome: string; telefone: string }[]> {
  const { data, error } = await supabase.from('garcons').select('nome_garcon, telefone, ativo').eq('restaurante_id', restauranteId)
  if (error) throw error
  return (data ?? [])
    .filter((g) => g.ativo !== false && (g.telefone ?? '').trim() && (g.nome_garcon ?? '').trim())
    .map((g) => ({ nome: String(g.nome_garcon).trim(), telefone: String(g.telefone) }))
}

// ── Pedidos de feedback ──────────────────────────────────────────────────────

export async function buscarEnvios(restauranteId: number): Promise<Envio[]> {
  const { data, error } = await supabase.from('equipe_envios')
    .select('id, restaurante_id, pergunta, status, tipo, acao_id, criado_por, criado_em, concluido_em')
    .eq('restaurante_id', restauranteId).order('criado_em', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []).map((e) => ({
    ...e, id: Number(e.id), restaurante_id: Number(e.restaurante_id), status: e.status as StatusEnvio,
    tipo: (e.tipo === 'aviso' ? 'aviso' : 'pedido') as TipoEnvio, acao_id: e.acao_id == null ? null : Number(e.acao_id),
  }))
}

/**
 * Os convites sem dizer de quem são: só de qual envio, o status e se houve
 * resposta. Quem garante é o banco (`equipe_convites_anonimos`): o dono da
 * conta não lê a tabela, porque ela diz qual funcionário respondeu e quando,
 * e isso entregaria de quem é o feedback anônimo.
 */
export async function buscarConvites(_restauranteId: number): Promise<ConviteAnonimo[]> {
  const { data, error } = await supabase.rpc('equipe_convites_anonimos')
  if (error) throw error
  return (data ?? []).map((c) => ({ envio_id: Number(c.envio_id), status: c.status as StatusConvite, respondeu: !!c.respondeu }))
}

// ── A função equipe ──────────────────────────────────────────────────────────

/** Os pedaços fixos da mensagem do pedido, e se o WhatsApp do restaurante está conectado. */
export interface PreviaConvite { abertura: string; como_responder: string; parar: string; pergunta_padrao: string; whatsapp_conectado: boolean; prazo_horas: number }
/** O rascunho do aviso de ação concluída (ação "rascunho_aviso"). */
export interface RascunhoAviso {
  texto: string
  /** A IA escreveu; false = texto-modelo (IA desligada, sem crédito ou fora do ar). */
  da_ia: boolean
  /** A ação nasceu de um relato sensível: avisar todos pode expor alguém. */
  sensivel: boolean
  destinatarios: number
  /** Quando a equipe já foi avisada desta ação, ou null. */
  ja_avisou_em: string | null
  abertura: string
  fecho: string
  whatsapp_conectado: boolean
}
/** O pedido automático (ações "auto_ler" e "auto_salvar"). */
export interface PedidoAutomaticoConfig {
  ativo: boolean
  cada_dias: Frequencia
  /** Só vale no mensal: o dia do mês em que sai (1 = começo do mês). */
  dia_do_mes: number
  pergunta: string
  proximo_em: string | null
  ultimo_em: string | null
  ultimo_erro: string | null
}
export type RespostaEquipe<T = Record<string, unknown>> = { ok: boolean; motivo?: string; error?: string } & Partial<T>

/** Chama a função equipe. Erro com corpo (4xx/5xx) vem com o motivo dela. */
export async function acaoEquipe<T = Record<string, unknown>>(acao: string, extra: Record<string, unknown> = {}): Promise<RespostaEquipe<T>> {
  const { data, error } = await supabase.functions.invoke('equipe', { body: { acao, ...extra } })
  if (error) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const corpo = await (error as any).context?.json?.()
      if (corpo) return { ok: false, ...corpo }
    } catch { /* sem corpo */ }
    return { ok: false, motivo: 'rede', error: 'Sem conexão com o servidor. Tente de novo.' } as RespostaEquipe<T>
  }
  return data as RespostaEquipe<T>
}
