import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'

/**
 * Notificação do navegador (Web Notifications API) para o admin da plataforma
 * quando chega mensagem nova de cliente no suporte:
 *   - INSERT em `sugestoes_plataforma`  → nova dúvida/sugestão
 *   - INSERT em `respostas_sugestoes` com autor='usuario' → resposta do cliente
 *
 * A notificação sai no estilo do WhatsApp: foto do restaurante (logo) como
 * ícone, nome do cliente como título e a mensagem no corpo — uma notificação
 * por cliente (tag), então mensagens do mesmo cliente se atualizam em vez de
 * empilhar.
 *
 * Fica montado no App inteiro (dentro do AuthProvider + Router), então funciona
 * em qualquer rota e mesmo com a aba em segundo plano — que é quando a
 * notificação do sistema é útil. Aba visível não notifica (o badge do topo
 * já sinaliza), pra não alertar duas vezes.
 */
export function AdminNotificacoes() {
  const { ehAdminPlataforma } = useAuth()
  const navigate = useNavigate()
  // navigate troca de identidade a cada render; guardamos numa ref pra usar no
  // onclick da notificação sem precisar recriar a subscription do realtime.
  const navRef = useRef(navigate)
  navRef.current = navigate

  useEffect(() => {
    if (!ehAdminPlataforma) return
    if (typeof Notification === 'undefined') return // navegador sem suporte

    // Pedir permissão precisa partir de um gesto do usuário (exigência de
    // Chrome/Firefox/Safari). Pedimos na primeira interação; o listener some
    // assim que dispara.
    let removerGesto: (() => void) | null = null
    if (Notification.permission === 'default') {
      const pedir = () => {
        try {
          Notification.requestPermission()
        } catch {
          /* Safari antigo usa callback; ignoramos o erro */
        }
        removerGesto?.()
      }
      window.addEventListener('pointerdown', pedir, { once: true })
      window.addEventListener('keydown', pedir, { once: true })
      removerGesto = () => {
        window.removeEventListener('pointerdown', pedir)
        window.removeEventListener('keydown', pedir)
      }
    }

    // Só notifica com permissão concedida E aba em segundo plano. Serve de
    // porteiro antes de qualquer consulta, pra não buscar dados à toa.
    const podeNotificar = () => Notification.permission === 'granted' && document.hidden

    const resumo = (texto: string | null | undefined, fallback: string) => {
      const t = (texto ?? '').trim()
      if (!t) return fallback
      return t.length > 140 ? `${t.slice(0, 137)}…` : t
    }

    // Nome (do restaurante) + foto (logo) do cliente, a partir do id do auth.
    // Mesma junção que o painel admin faz. O admin da plataforma enxerga essas
    // linhas por RLS.
    const dadosCliente = async (usuarioId: string | null | undefined) => {
      const padrao = { nome: 'Cliente', foto: '/favicon.png' }
      if (!usuarioId) return padrao
      const { data: rest } = await supabase
        .from('restaurantes')
        .select('nome_restaurante, logo_url')
        .eq('auth_user_id', usuarioId)
        .maybeSingle()
      let nome = rest?.nome_restaurante ?? null
      if (!nome) {
        const { data: pessoa } = await supabase
          .from('usuarios')
          .select('nome')
          .eq('id', usuarioId)
          .maybeSingle()
        nome = pessoa?.nome ?? null
      }
      return { nome: nome || 'Cliente', foto: rest?.logo_url || '/favicon.png' }
    }

    const mostrar = (titulo: string, corpo: string, foto: string, tag: string) => {
      try {
        const n = new Notification(titulo, {
          body: corpo,
          icon: foto, // foto do restaurante (logo) — como o avatar do WhatsApp
          tag, // uma notificação por cliente; nova mensagem atualiza a mesma
          renotify: true, // re-alerta mesmo reaproveitando a tag
        } as NotificationOptions)
        n.onclick = () => {
          window.focus()
          navRef.current('/admin')
          n.close()
        }
      } catch {
        /* alguns navegadores exigem Service Worker p/ Notification; ignoramos */
      }
    }

    const canal = supabase
      .channel('admin-notificacoes-navegador')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sugestoes_plataforma' },
        async (payload) => {
          if (!podeNotificar()) return
          const nova = payload.new as { texto?: string; titulo?: string; usuario_id?: string }
          const { nome, foto } = await dadosCliente(nova.usuario_id)
          mostrar(
            nome,
            resumo(nova.titulo || nova.texto, 'Enviou uma nova dúvida.'),
            foto,
            `easyfeed-cliente-${nova.usuario_id ?? 'x'}`,
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'respostas_sugestoes' },
        async (payload) => {
          if (!podeNotificar()) return
          const nova = payload.new as { texto?: string; autor?: string; sugestao_id?: string }
          if (nova.autor !== 'usuario') return // só mensagens do cliente, não do admin
          // Descobre de qual cliente é a resposta (via a sugestão dona da mensagem).
          const { data: sug } = await supabase
            .from('sugestoes_plataforma')
            .select('usuario_id')
            .eq('id', nova.sugestao_id ?? '')
            .maybeSingle()
          const { nome, foto } = await dadosCliente(sug?.usuario_id)
          mostrar(
            nome,
            resumo(nova.texto, 'Enviou uma nova mensagem.'),
            foto,
            `easyfeed-cliente-${sug?.usuario_id ?? 'x'}`,
          )
        },
      )
      .subscribe()

    return () => {
      removerGesto?.()
      supabase.removeChannel(canal)
    }
  }, [ehAdminPlataforma])

  return null
}
