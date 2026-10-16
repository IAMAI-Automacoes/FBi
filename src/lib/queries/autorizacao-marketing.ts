import { supabase } from '@/lib/supabase/client'

// As funções da autorização de divulgação não estão nos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/**
 * A autorização de divulgação do restaurante, vista pelo dono
 * (Configurações → Divulgação). Regras no banco: migration
 * 20261029010000_autorizacao_pelo_dono.sql.
 */
export interface MinhaAutorizacao {
  /** null = nunca autorizou. */
  status: 'autorizado' | 'revogado' | null
  pode_nome: boolean
  pode_numeros: boolean
  pode_logo: boolean
  pode_depoimento: boolean
  origem: 'admin' | 'dono' | null
  autorizado_por: string | null
  autorizado_em: string | null
  revogado_em: string | null
  /** Versão do texto que estava na tela quando autorizou. */
  versao_aceita: string | null
  /** O texto que a tela mostra agora, e a versão dele (vai de volta ao autorizar). */
  versao_atual: string
  texto_atual: string
  /** Só a conta dona do restaurante decide (funcionário com login próprio, não). */
  eh_dono: boolean
}

export type OpcoesDivulgacao = Pick<MinhaAutorizacao, 'pode_nome' | 'pode_numeros' | 'pode_logo' | 'pode_depoimento'>

export async function buscarMinhaAutorizacao(): Promise<MinhaAutorizacao | null> {
  const { data, error } = await db.rpc('minha_autorizacao_marketing')
  if (error) throw new Error(error.message)
  const linha = Array.isArray(data) ? data[0] : data
  if (!linha) return null
  return {
    ...linha,
    pode_nome: !!linha.pode_nome,
    pode_numeros: !!linha.pode_numeros,
    pode_logo: !!linha.pode_logo,
    pode_depoimento: !!linha.pode_depoimento,
  } as MinhaAutorizacao
}

/** Autoriza com as opções marcadas, aceitando o texto da versão `versao`. */
export async function autorizarDivulgacao(opcoes: OpcoesDivulgacao, versao: string): Promise<void> {
  const { error } = await db.rpc('definir_minha_autorizacao_marketing', {
    p_autorizar: true,
    p_pode_nome: opcoes.pode_nome,
    p_pode_numeros: opcoes.pode_numeros,
    p_pode_logo: opcoes.pode_logo,
    p_pode_depoimento: opcoes.pode_depoimento,
    p_versao: versao,
  })
  if (error) throw new Error(error.message)
}

export async function revogarDivulgacao(): Promise<void> {
  const { error } = await db.rpc('definir_minha_autorizacao_marketing', {
    p_autorizar: false,
    p_pode_nome: false,
    p_pode_numeros: false,
    p_pode_logo: false,
    p_pode_depoimento: false,
    p_versao: null,
  })
  if (error) throw new Error(error.message)
}
