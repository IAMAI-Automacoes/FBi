import { supabase } from '@/lib/supabase/client'
import type {
  ConviteAnonimo, Envio, Funcionario, PontoEquipe, RespostaAnonima, ResumoEquipe, StatusConvite, StatusEnvio,
} from '@/lib/equipe'

/* Feedback da equipe: o restaurante cadastra os funcionários, o sistema pede
   feedback pelo WhatsApp (de um número só do EasyFeed) e analisa as respostas.
   Envios, convites e respostas quem grava é a função `equipe`; a tela só lê e
   cuida do cadastro de funcionários.

   A página do restaurante nunca lê de quem é cada resposta: as respostas vêm
   da visão `equipe_respostas_anonimas` (sem funcionário e sem hora) e, dos
   convites, só o status e se já houve resposta. */

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

// ── Envios e respostas ───────────────────────────────────────────────────────

export async function buscarEnvios(restauranteId: number): Promise<Envio[]> {
  const { data, error } = await supabase.from('equipe_envios')
    .select('id, restaurante_id, pergunta, status, resumo, resumo_em, criado_em, concluido_em')
    .eq('restaurante_id', restauranteId).order('criado_em', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []).map((e) => ({
    ...e, id: Number(e.id), restaurante_id: Number(e.restaurante_id), status: e.status as StatusEnvio, resumo: (e.resumo ?? null) as unknown as ResumoEquipe | null,
  }))
}

/** Os convites sem dizer de quem são: só de qual envio, o status e se houve resposta. */
export async function buscarConvites(restauranteId: number): Promise<ConviteAnonimo[]> {
  const { data, error } = await supabase.from('equipe_convites').select('envio_id, status, respondeu_em').eq('restaurante_id', restauranteId)
  if (error) throw error
  return (data ?? []).map((c) => ({ envio_id: Number(c.envio_id), status: c.status as StatusConvite, respondeu: !!c.respondeu_em }))
}

export async function buscarRespostas(restauranteId: number): Promise<RespostaAnonima[]> {
  const { data, error } = await supabase.from('equipe_respostas_anonimas')
    .select('id, envio_id, texto_original, sentimento, sensivel, dia')
    .eq('restaurante_id', restauranteId).order('dia', { ascending: false }).limit(500)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: String(r.id), envio_id: r.envio_id == null ? null : Number(r.envio_id), texto_original: r.texto_original ?? '',
    sentimento: r.sentimento ?? null, sensivel: r.sensivel === true, dia: String(r.dia ?? ''),
  }))
}

export async function buscarPontos(restauranteId: number): Promise<PontoEquipe[]> {
  const { data, error } = await supabase.from('equipe_pontos')
    .select('id, resposta_id, texto_original, resumo, categoria, sentimento')
    .eq('restaurante_id', restauranteId).limit(2000)
  if (error) throw error
  return (data ?? []).map((p) => ({ ...p, id: Number(p.id) }))
}

export async function apagarResposta(id: string): Promise<void> {
  const { error } = await supabase.from('equipe_respostas').delete().eq('id', id)
  if (error) throw error
}

// ── A função equipe ──────────────────────────────────────────────────────────

export interface EstadoNumero { temInstancia: boolean; conectado: boolean; qrcode: string | null; numero: string | null; recusado?: string }
export interface PreviaConvite { abertura: string; anonimato: string; parar: string; pergunta_padrao: string; minimo_anonimo: number }
export interface AnaliseSimulada {
  analise: { tipo: string; pontos: { texto_original: string; resumo: string; categoria: string; sentimento: string }[]; sensivel: boolean }
  sentimento: string | null
  resposta: string | null
  parar: boolean
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

// ── Admin da plataforma (aba Equipe do painel) ───────────────────────────────

export interface ConviteAdmin {
  id: number
  envio_id: number
  restaurante: string
  funcionario: string
  telefone: string
  status: StatusConvite
  erro: string | null
  enviado_em: string | null
  respondeu_em: string | null
  criado_em: string
}

/** Os convites de todos os restaurantes, com o nome de quem recebeu (só o admin vê). */
export async function buscarConvitesAdmin(): Promise<ConviteAdmin[]> {
  const { data, error } = await supabase.from('equipe_convites')
    .select('id, envio_id, telefone, status, erro, enviado_em, respondeu_em, criado_em, restaurante_id, restaurantes(nome_restaurante), equipe_funcionarios(nome)')
    .order('criado_em', { ascending: false }).limit(300)
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((c: any) => ({
    id: Number(c.id), envio_id: Number(c.envio_id), telefone: c.telefone, status: c.status, erro: c.erro ?? null,
    enviado_em: c.enviado_em ?? null, respondeu_em: c.respondeu_em ?? null, criado_em: c.criado_em,
    restaurante: c.restaurantes?.nome_restaurante || `Restaurante ${c.restaurante_id}`,
    funcionario: c.equipe_funcionarios?.nome || '(removido)',
  }))
}
