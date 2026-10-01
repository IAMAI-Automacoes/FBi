import { useCallback, useEffect, useId, useRef, useState } from 'react'
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
  const [carregado, setCarregado] = useState(false)
  const idCanal = useId()

  // Lê do banco e continua ouvindo: silenciar numa aba (ou noutro aparelho)
  // vale na hora em todas. Antes era lido só ao abrir a tela, e uma aba que já
  // estava aberta continuava tocando o som depois de silenciado em outra.
  useEffect(() => {
    if (!user) return
    let ativo = true
    const carregar = () => listarPreferencias(canal)
      .then((lista) => { if (ativo) { setMapa(new Map(lista.map((p) => [p.conversa, p]))); setCarregado(true) } })
      .catch(() => {})
    carregar()
    const ch = supabase
      .channel(`prefs-${canal}-${idCanal}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'preferencias_conversa', filter: `canal=eq.${canal}` }, carregar)
      .subscribe()
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregar() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { ativo = false; supabase.removeChannel(ch); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [user, canal, idCanal])

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

  // Para quem lê dentro de um callback de tempo real (sem re-render no meio).
  const mapaRef = useRef(mapa)
  mapaRef.current = mapa
  /** Notificação e som juntos: nem o canal inteiro nem a conversa silenciados. */
  const deveAvisar = useCallback((conversa: string) => {
    const m = mapaRef.current
    return !m.get(CANAL_INTEIRO)?.silenciada && !m.get(conversa)?.silenciada
  }, [])

  return {
    /** Já leu do banco (antes disso, quem tiver o valor de outra fonte usa). */
    carregado,
    /** O canal inteiro está silenciado (sino do topo). */
    tudoSilenciado: silenciada(CANAL_INTEIRO),
    silenciada,
    fixadaEm,
    deveAvisar,
    alternarTudo: () => mudar(CANAL_INTEIRO, { silenciada: !silenciada(CANAL_INTEIRO) }),
    alternarSilencio: (conversa: string) => mudar(conversa, { silenciada: !silenciada(conversa) }),
    alternarFixar: (conversa: string) => mudar(conversa, { fixada: !fixadaEm(conversa) }),
  }
}
