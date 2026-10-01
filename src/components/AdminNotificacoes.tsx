import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { buscarTotalNaoLidas } from '@/lib/queries/admin'
import { atualizarBadgeApp, estaOlhando, somCabeAEstaAba } from '@/lib/notificacoes-app'
import { inscreverPush } from '@/lib/push'
import { usePreferencias } from '@/lib/queries/preferencias'
import { tocarSom } from '@/components/whatsapp/Notificacoes'

// sugestão → dono da conversa (usuario_id), para o "silenciar esta conversa".
const donoDaSugestao = new Map<string, string | null>()
async function usuarioDaSugestao(sugestaoId: string): Promise<string | null> {
  if (donoDaSugestao.has(sugestaoId)) return donoDaSugestao.get(sugestaoId) ?? null
  const { data } = await supabase.from('sugestoes_plataforma').select('usuario_id').eq('id', sugestaoId).maybeSingle()
  const id = (data?.usuario_id as string | undefined) ?? null
  donoDaSugestao.set(sugestaoId, id)
  return id
}

/**
 * Inscreve o admin da plataforma no Web Push, pra receber notificação de
 * mensagem de cliente MESMO com o app fechado. Quem mostra a notificação é o
 * service worker (sw.js), a partir do push enviado pela edge function
 * `enviar-push` (disparada por gatilho no banco). Este componente só:
 * cria/recupera a inscrição de push e a salva em `push_subscriptions` (quando
 * a permissão já foi dada — quem pede é o cartão PedirNotificacoes).
 */
export function AdminNotificacoes() {
  const { ehAdminPlataforma, user } = useAuth()
  // Silenciar do suporte (sino do topo = tudo; conversa = usuario_id),
  // sincronizado entre abas: vale para o push E para o som.
  const prefs = usePreferencias('suporte_admin')
  const deveAvisar = useRef(prefs.deveAvisar)
  deveAvisar.current = prefs.deveAvisar

  useEffect(() => {
    if (!ehAdminPlataforma || !user) return
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return

    let cancelado = false

    const inscrever = async () => {
      if (cancelado) return
      await inscreverPush(user.id)
    }

    // Quem pede a permissão é o cartão PedirNotificacoes (num clique, com
    // explicação). Aqui só inscreve quando ela já foi dada.
    if (Notification.permission === 'granted') inscrever()

    return () => {
      cancelado = true
    }
  }, [ehAdminPlataforma, user])

  /**
   * Mantém o badge do ícone do app (celular) com o total de mensagens de
   * suporte não lidas — igual ao numerozinho que WhatsApp/Instagram mostram.
   * Este componente fica montado o tempo todo (App.tsx), então funciona em
   * qualquer página do painel, não só dentro de /admin.
   *
   * Três fontes, para o número nunca ficar desatualizado:
   *  1. Busca inicial ao montar.
   *  2. Evento `fib-unread-update`: quando o Admin.tsx está aberto, ele já
   *     recalcula o total localmente — reaproveita em vez de buscar de novo.
   *  3. Realtime: cobre quando o admin está em outra página (Admin.tsx
   *     desmontado) e chega mensagem nova ou uma conversa é marcada como lida.
   */
  useEffect(() => {
    if (!ehAdminPlataforma) return

    const atualizar = () => buscarTotalNaoLidas().then(atualizarBadgeApp).catch(() => {})
    atualizar()

    const aoAtualizarEvento = (e: Event) => {
      atualizarBadgeApp((e as CustomEvent<{ count: number }>).detail.count)
    }
    window.addEventListener('fib-unread-update', aoAtualizarEvento)

    // Som de mensagem de cliente no suporte (o mesmo toque do suporte do
    // dono), se não estiver silenciado e a conversa não estiver aberta na tela.
    const tocarSePrecisar = (usuarioId: string | null) => {
      if (!usuarioId || estaOlhando(usuarioId) || !deveAvisar.current(usuarioId) || !somCabeAEstaAba()) return
      tocarSom('suporte')
    }

    const ch = supabase
      .channel('badge-app-nao-lidas')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'respostas_sugestoes' }, (p) => {
        atualizar()
        const r = p.new as { autor?: string; sugestao_id?: string }
        if (r.autor === 'usuario' && r.sugestao_id) usuarioDaSugestao(r.sugestao_id).then(tocarSePrecisar).catch(() => {})
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sugestoes_plataforma' }, (p) => {
        const s = p.new as { id?: string; usuario_id?: string }
        if (s.id && s.usuario_id) donoDaSugestao.set(s.id, s.usuario_id)
        tocarSePrecisar(s.usuario_id ?? null)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sugestoes_plataforma' }, atualizar)
      .subscribe()

    return () => {
      window.removeEventListener('fib-unread-update', aoAtualizarEvento)
      supabase.removeChannel(ch)
    }
  }, [ehAdminPlataforma])

  return null
}
