import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { idDoAparelho } from '@/lib/aparelho'

/**
 * Silenciar e fixar conversas.
 *   'whatsapp'      → tela WhatsApp do dono (conversa = chat_id)
 *   'suporte'       → chat de suporte do dono (só o canal inteiro)
 *   'suporte_admin' → suporte no painel do admin (conversa = usuario_id)
 * conversa '' = o canal inteiro (o sino do topo).
 *
 * SILENCIAR é por APARELHO (tabela silencios_aparelho, com o id de
 * `idDoAparelho`): silenciar no PC não cala o celular. FIXAR é da conta
 * (preferencias_conversa.fixada_em) e vale em todo lugar.
 * Quem lê o silêncio para decidir se manda notificação é a função enviar-push,
 * inscrição por inscrição; o som da página lê por aqui (`deveAvisar`).
 */
export type Canal = 'whatsapp' | 'suporte' | 'suporte_admin'
export const CANAL_INTEIRO = ''

export interface Preferencia { conversa: string; silenciada: boolean; fixada_em: string | null }

async function listarFixadas(canal: Canal): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('preferencias_conversa')
    .select('conversa, fixada_em')
    .eq('canal', canal)
    .not('fixada_em', 'is', null)
  if (error) throw error
  return new Map((data ?? []).map((p) => [p.conversa, p.fixada_em as string]))
}

async function listarSilencios(canal: Canal): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('silencios_aparelho')
    .select('conversa')
    .eq('canal', canal)
    .eq('aparelho', idDoAparelho())
  if (error) throw error
  return new Set((data ?? []).map((p) => p.conversa))
}

export async function listarPreferencias(canal: Canal): Promise<Preferencia[]> {
  const [fixadas, silencios] = await Promise.all([listarFixadas(canal), listarSilencios(canal)])
  const conversas = new Set([...fixadas.keys(), ...silencios])
  return [...conversas].map((conversa) => ({
    conversa,
    silenciada: silencios.has(conversa),
    fixada_em: fixadas.get(conversa) ?? null,
  }))
}

/** Silencia (ou reativa) a conversa SÓ neste aparelho. */
export async function salvarSilencio(canal: Canal, conversa: string, silenciada: boolean): Promise<void> {
  const aparelho = idDoAparelho()
  const { error } = silenciada
    ? await supabase.from('silencios_aparelho').upsert({ aparelho, canal, conversa }, { onConflict: 'auth_user_id,aparelho,canal,conversa', ignoreDuplicates: true })
    : await supabase.from('silencios_aparelho').delete().eq('aparelho', aparelho).eq('canal', canal).eq('conversa', conversa)
  if (error) throw error
}

/** Fixa (ou desafixa) a conversa na conta — vale em todos os aparelhos. */
export async function salvarFixada(authUserId: string, canal: Canal, conversa: string, fixada: boolean): Promise<void> {
  const { error } = await supabase.from('preferencias_conversa').upsert(
    { auth_user_id: authUserId, canal, conversa, atualizado_em: new Date().toISOString(), fixada_em: fixada ? new Date().toISOString() : null },
    { onConflict: 'auth_user_id,canal,conversa' },
  )
  if (error) throw error
}

/** Preferências de um canal com atualização otimista (a tela muda na hora). */
export function usePreferencias(canal: Canal) {
  const { user } = useAuth()
  const [mapa, setMapa] = useState<Map<string, Preferencia>>(new Map())
  const [carregado, setCarregado] = useState(false)
  const idCanal = useId()

  // Lê do banco e continua ouvindo: silenciar numa aba vale na hora nas
  // outras abas deste aparelho; fixar vale também nos outros aparelhos.
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'silencios_aparelho', filter: `aparelho=eq.${idDoAparelho()}` }, carregar)
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
      if (mudanca.silenciada !== undefined) await salvarSilencio(canal, conversa, mudanca.silenciada)
      if (mudanca.fixada !== undefined) await salvarFixada(user.id, canal, conversa, mudanca.fixada)
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
  /** Notificação e som juntos, neste aparelho: nem o canal inteiro nem a conversa silenciados. */
  const deveAvisar = useCallback((conversa: string) => {
    const m = mapaRef.current
    return !m.get(CANAL_INTEIRO)?.silenciada && !m.get(conversa)?.silenciada
  }, [])

  return {
    /** Já leu do banco (antes disso, quem tiver o valor de outra fonte usa). */
    carregado,
    /** O canal inteiro está silenciado neste aparelho (sino do topo). */
    tudoSilenciado: silenciada(CANAL_INTEIRO),
    silenciada,
    fixadaEm,
    deveAvisar,
    alternarTudo: () => mudar(CANAL_INTEIRO, { silenciada: !silenciada(CANAL_INTEIRO) }),
    alternarSilencio: (conversa: string) => mudar(conversa, { silenciada: !silenciada(conversa) }),
    alternarFixar: (conversa: string) => mudar(conversa, { fixada: !fixadaEm(conversa) }),
  }
}
