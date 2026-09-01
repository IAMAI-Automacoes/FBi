import { supabase } from '@/lib/supabase/client'

/**
 * O motor grava em tabelas e colunas definidas em tempo de execução (o tipo da
 * ação decide o alvo), o que os tipos gerados do Supabase não conseguem inferir.
 * Este alias concentra esses acessos dinâmicos num único ponto explícito.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any
import { CAMPOS_CONFIG, campoValido, atualizarCampoConfig } from '@/lib/queries/config-update'

/**
 * Motor de ações do assistente.
 *
 * Tudo que a IA cria ou altera passa por aqui, e TUDO fica registrado em
 * `ia_log_alteracoes` com o valor anterior — é isso que permite desfazer.
 *
 * Regra de segurança: feedbacks de clientes são registro histórico e NUNCA
 * podem ser criados, editados ou apagados pela IA. Se pudessem, todos os
 * números do sistema perderiam credibilidade.
 *
 * Ação e insight saíram daqui pelo mesmo motivo, um passo adiante: são o
 * registro do que o restaurante DECIDIU fazer sobre esses números. Quem
 * decide é o dono, no quadro, olhando o que já existe — não uma frase
 * solta no meio de uma conversa. Sobrou o que é do próprio assistente
 * (anotações) e do perfil do restaurante (configuração).
 */

export type TipoAcao =
  | 'atualizar_config'
  | 'criar_anotacao'
  | 'excluir_anotacao'

/** Ações destrutivas nunca rodam sozinhas, mesmo no modo automático. */
export const ACOES_DESTRUTIVAS: TipoAcao[] = ['excluir_anotacao']

export interface AcaoAgente {
  tipo: TipoAcao
  dados: Record<string, any>
  /** Frase curta em português do que será feito, mostrada ao dono. */
  descricao: string
}

export interface RegistroAcao {
  id: string
  tipo: string
  descricao: string
  antes: any
  depois: any
  modo: string
  revertido: boolean
  created_at: string
  alvo_tabela: string | null
  alvo_id: string | null
}

async function registrar(
  restauranteId: number,
  acao: AcaoAgente,
  modo: 'automatico' | 'confirmado',
  alvo: { tabela: string | null; id: string | null },
  antes: any,
  depois: any,
): Promise<RegistroAcao | null> {
  const { data } = await supabase
    .from('ia_log_alteracoes')
    .insert({
      restaurante_id: restauranteId,
      tipo: acao.tipo,
      alvo_tabela: alvo.tabela,
      alvo_id: alvo.id,
      descricao: acao.descricao,
      antes,
      depois,
      modo,
    })
    .select()
    .single()
  return (data as RegistroAcao) ?? null
}

/** Valida a ação antes de executar. Devolve o motivo quando não é permitida. */
export function validarAcao(acao: AcaoAgente): string | null {
  const d = acao.dados || {}
  switch (acao.tipo) {
    case 'excluir_anotacao':
      if (!d.id) return 'Não identifiquei qual item alterar.'
      return null
    case 'atualizar_config':
      if (!campoValido(String(d.campo || ''))) return 'Esse campo não pode ser alterado por aqui.'
      if (!String(d.valor ?? '').trim()) return 'Faltou o novo valor.'
      return null
    case 'criar_anotacao':
      if (!String(d.fato || '').trim()) return 'A anotação está vazia.'
      return null
    default:
      return 'Não sei executar esse tipo de alteração.'
  }
}

/** Executa a ação e devolve o registro do histórico (usado para desfazer). */
export async function executarAcao(
  restauranteId: number,
  acao: AcaoAgente,
  modo: 'automatico' | 'confirmado',
): Promise<RegistroAcao | null> {
  const erro = validarAcao(acao)
  if (erro) throw new Error(erro)

  const d = acao.dados || {}

  switch (acao.tipo) {
    case 'atualizar_config': {
      const campo = String(d.campo)
      const { data: r } = await supabase
        .from('restaurantes')
        .select('nome_restaurante, tipo_culinaria, numero_mesas, detalhes, perfil_restaurante')
        .eq('id', restauranteId)
        .single()
      const perfil = ((r as any)?.perfil_restaurante as any) || {}
      let valorAnterior = (r as any)?.[campo] ?? perfil[campo] ?? ''
      // `nome` é de pessoa (tabela `usuarios`) — pega o valor anterior de lá
      if (campo === 'nome') {
        const { data: p } = await supabase.from('usuarios').select('nome').eq('restaurante_id', restauranteId).maybeSingle()
        valorAnterior = (p as any)?.nome ?? ''
      }

      await atualizarCampoConfig(restauranteId, campo, String(d.valor))
      return registrar(
        restauranteId, acao, modo,
        { tabela: 'restaurantes', id: String(restauranteId) },
        { campo, valor: valorAnterior },
        { campo, valor: d.valor },
      )
    }

    case 'criar_anotacao': {
      const linha = {
        restaurante_id: restauranteId,
        fato: String(d.fato).trim().slice(0, 300),
        categoria: String(d.categoria ?? 'geral'),
      }
      const { data, error } = await supabase.from('memoria_assistente').insert(linha).select().single()
      if (error && error.code !== '23505') throw error
      return registrar(restauranteId, acao, modo, { tabela: 'memoria_assistente', id: String(data?.id ?? '') }, null, data)
    }

    case 'excluir_anotacao': {
      const { data: antes } = await supabase
        .from('memoria_assistente').select('*').eq('id', d.id).single()
      const { error } = await supabase.from('memoria_assistente').delete().eq('id', d.id)
      if (error) throw error
      return registrar(restauranteId, acao, modo, { tabela: 'memoria_assistente', id: String(d.id) }, antes, null)
    }

    default:
      throw new Error('Tipo de alteração desconhecido.')
  }
}

/** Desfaz uma alteração, restaurando o estado anterior. */
export async function reverterAcao(registro: RegistroAcao): Promise<void> {
  if (registro.revertido) throw new Error('Essa alteração já foi desfeita.')
  const { alvo_tabela: tabela, alvo_id: id, antes, depois, tipo } = registro

  if (tipo.startsWith('criar_')) {
    // Desfazer uma criação = apagar o que foi criado
    if (tabela && id) await db.from(tabela).delete().eq('id', id)
  } else if (tipo === 'atualizar_config') {
    await atualizarCampoConfig(Number(id), antes.campo, String(antes.valor ?? ''))
  } else if (tipo.startsWith('excluir_')) {
    if (tabela === 'insights') {
      await db.from('insights').update({ ativo: true }).eq('id', id)
    } else if (tabela && antes) {
      // Recria a linha apagada com os mesmos valores
      await db.from(tabela).insert(antes)
    }
  } else if (tipo.startsWith('editar_')) {
    if (tabela && id && antes) {
      const { id: _ignora, created_at: _c, ...campos } = antes
      await db.from(tabela).update(campos).eq('id', id)
    }
  }

  await supabase
    .from('ia_log_alteracoes')
    .update({ revertido: true, revertido_em: new Date().toISOString() })
    .eq('id', registro.id)
}

export async function listarHistoricoIA(restauranteId: number, limite = 50): Promise<RegistroAcao[]> {
  const { data } = await supabase
    .from('ia_log_alteracoes')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
    .limit(limite)
  return (data || []) as RegistroAcao[]
}

/** Rótulo amigável do campo de configuração (reexportado por conveniência). */
export { CAMPOS_CONFIG }
