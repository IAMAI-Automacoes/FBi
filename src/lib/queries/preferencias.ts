import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'

/**
 * Silenciar e fixar conversas (tabela preferencias_conversa), por pessoa.
 *   'whatsapp'      → tela WhatsApp do dono (conversa = chat_id)
 *   'suporte'       → chat de suporte do dono (só o canal inteiro)
 *   'suporte_admin' → suporte no painel do admin (conversa = usuario_id)
 * conversa '' = o canal inteiro (o sino do topo).
 * Quem lê para decidir se manda notificação é a função enviar-push.
 */
export type Canal = 'whatsapp' | 'suporte' | 'suporte_admin'
export const CANAL_INTEIRO = ''

export interface Preferencia { conversa: string; silenciada: boolean; fixada_em: string | null }

export async function listarPreferencias(canal: Canal): Promise<Preferencia[]> {
  const { data, error } = await supabase
    .from('preferencias_conversa')
    .select('conversa, silenciada, fixada_em')
    .eq('canal', canal)
  if (error) throw error
  return (data ?? []) as Preferencia[]
}

export async function salvarPreferencia(
  authUserId: string,
  canal: Canal,
  conversa: string,
  mudanca: { silenciada?: boolean; fixada?: boolean },
): Promise<void> {
  // Só os campos que mudaram: o upsert não pode zerar o outro (fixar não
  // pode tirar o silenciar, e vice-versa).
  const linha: { auth_user_id: string; canal: Canal; conversa: string; atualizado_em: string; silenciada?: boolean; fixada_em?: string | null } =
    { auth_user_id: authUserId, canal, conversa, atualizado_em: new Date().toISOString() }
  if (mudanca.silenciada !== undefined) linha.silenciada = mudanca.silenciada
  if (mudanca.fixada !== undefined) linha.fixada_em = mudanca.fixada ? new Date().toISOString() : null
  const { error } = await supabase.from('preferencias_conversa').upsert(linha, { onConflict: 'auth_user_id,canal,conversa' })
  if (error) throw error
}

/** Preferências de um canal com atualização otimista (a tela muda na hora). */
export function usePreferencias(canal: Canal) {
  const { user } = useAuth()
  const [mapa, setMapa] = useState<Map<string, Preferencia>>(new Map())

  useEffect(() => {
    if (!user) return
    let ativo = true
    listarPreferencias(canal)
      .then((lista) => { if (ativo) setMapa(new Map(lista.map((p) => [p.conversa, p]))) })
      .catch(() => {})
    return () => { ativo = false }
  }, [user, canal])

  const mudar = useCallback(async (conversa: string, mudanca: { silenciada?: boolean; fixada?: boolean }) => {
    if (!user) return
    setMapa((m) => {
      const atual = m.get(conversa) ?? { conversa, silenciada: false, fixada_em: null }
      const n = new Map(m)
      n.set(conversa, {
        conversa,
        silenciada: mudanca.silenciada ?? atual.silenciada,
        fixada_em: mudanca.fixada === undefined ? atual.fixada_em : mudanca.fixada ? new Date().toISOString() : null,
      })
      return n
    })
    try {
      await salvarPreferencia(user.id, canal, conversa, mudanca)
      // Contadores fora desta tela (menu lateral) se atualizam na hora.
      window.dispatchEvent(new CustomEvent('easyfeed:preferencias', { detail: { canal } }))
    } catch {
      // Volta ao que está no banco se não salvou.
      listarPreferencias(canal).then((lista) => setMapa(new Map(lista.map((p) => [p.conversa, p])))).catch(() => {})
    }
  }, [user, canal])

  const silenciada = useCallback((conversa: string) => mapa.get(conversa)?.silenciada ?? false, [mapa])
  const fixadaEm = useCallback((conversa: string) => mapa.get(conversa)?.fixada_em ?? null, [mapa])

  return {
    /** O canal inteiro está silenciado (sino do topo). */
    tudoSilenciado: silenciada(CANAL_INTEIRO),
    silenciada,
    fixadaEm,
    alternarTudo: () => mudar(CANAL_INTEIRO, { silenciada: !silenciada(CANAL_INTEIRO) }),
    alternarSilencio: (conversa: string) => mudar(conversa, { silenciada: !silenciada(conversa) }),
    alternarFixar: (conversa: string) => mudar(conversa, { fixada: !fixadaEm(conversa) }),
  }
}
