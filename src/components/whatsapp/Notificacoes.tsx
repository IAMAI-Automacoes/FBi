import { useEffect, useRef, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { usePermissoes } from '@/hooks/use-permissoes'
import { supabase } from '@/lib/supabase/client'
import { estaOlhando, somCabeAEstaAba } from '@/lib/notificacoes-app'
import { CANAL_INTEIRO, usePreferencias } from '@/lib/queries/preferencias'
import { iphoneSemApp, inscreverPush, pedirPermissaoEInscrever, pushSuportado } from '@/lib/push'

// ── Sons (gerados na hora, sem arquivo para baixar) ───────────────────────
// 'whatsapp': "plim" de duas notas subindo (mensagem de cliente).
// 'suporte' : três notas descendo, timbre de sino, mais suave — dá para saber
//             sem olhar que é o suporte, não um cliente (decisão do Raver).

export type Som = 'whatsapp' | 'suporte'

const NOTAS: Record<Som, { tipo: OscillatorType; volume: number; dura: number; notas: Array<[number, number]> }> = {
  whatsapp: { tipo: 'sine', volume: 0.18, dura: 0.22, notas: [[880, 0], [1318.5, 0.09]] },
  suporte: { tipo: 'triangle', volume: 0.14, dura: 0.42, notas: [[1046.5, 0], [783.99, 0.13], [659.25, 0.26]] },
}

let ctxSom: AudioContext | null = null
export function tocarSom(qual: Som) {
  // Avisa quem estiver ouvindo (os testes de tela contam por aqui).
  window.dispatchEvent(new CustomEvent('easyfeed:som', { detail: { qual } }))
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctxSom ??= new Ctx()
    const ctx = ctxSom
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const agora = ctx.currentTime
    const cfg = NOTAS[qual]
    for (const [freq, ini] of cfg.notas) {
      const osc = ctx.createOscillator()
      const ganho = ctx.createGain()
      osc.type = cfg.tipo
      osc.frequency.value = freq
      ganho.gain.setValueAtTime(0.0001, agora + ini)
      ganho.gain.exponentialRampToValueAtTime(cfg.volume, agora + ini + 0.015)
      ganho.gain.exponentialRampToValueAtTime(0.0001, agora + ini + cfg.dura)
      osc.connect(ganho).connect(ctx.destination)
      osc.start(agora + ini)
      osc.stop(agora + ini + cfg.dura + 0.03)
    }
  } catch { /* navegador sem áudio: só não toca */ }
}

// ── Avisos do painel do dono (montado no Layout) ───────────────────────────

/**
 * Em qualquer página logada (montado no App, como o AdminNotificacoes):
 *  - inscreve o aparelho no push (se a pessoa já deu permissão — nunca pede
 *    sozinho; quem pede é o aviso da tela WhatsApp ou o sino, num clique);
 *  - toca o som quando chega mensagem no WhatsApp ou resposta do suporte.
 *
 * Som e notificação seguem a MESMA regra (preferencias_conversa, sincronizada
 * entre abas e aparelhos): silenciado não toca nem notifica; reativado, os
 * dois voltam. E não toca na conversa que a pessoa já está olhando.
 */
export function AvisosDoPainel() {
  const { user, usuario } = useAuth()
  const { podeVer, carregando } = usePermissoes()
  const restauranteId = usuario?.restaurante_id ?? null
  const veWhatsapp = !carregando && !!restauranteId && podeVer('whatsapp')
  const prefsWa = usePreferencias('whatsapp')
  const prefsSup = usePreferencias('suporte')
  const avisaWa = useRef(prefsWa.deveAvisar)
  avisaWa.current = prefsWa.deveAvisar
  const avisaSup = useRef(prefsSup.deveAvisar)
  avisaSup.current = prefsSup.deveAvisar

  useEffect(() => {
    if (!user || !restauranteId || !pushSuportado() || Notification.permission !== 'granted') return
    inscreverPush(user.id)
  }, [user, restauranteId])

  // WhatsApp: mensagem recebida (não reação) numa conversa não silenciada.
  useEffect(() => {
    if (!veWhatsapp || !restauranteId) return
    const ch = supabase
      .channel(`avisos-wa-${restauranteId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_whatsapp', filter: `restaurante_id=eq.${restauranteId}` },
        (p) => {
          const m = p.new as { de_mim?: boolean; tipo?: string; chat_id?: string }
          if (m.de_mim !== false || m.tipo === 'reaction' || !m.chat_id) return
          if (estaOlhando(`wa:${m.chat_id}`) || !avisaWa.current(m.chat_id) || !somCabeAEstaAba()) return
          tocarSom('whatsapp')
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [veWhatsapp, restauranteId])

  // Suporte: resposta do suporte (a RLS só entrega as conversas do dono).
  useEffect(() => {
    if (!user || !restauranteId) return
    const ch = supabase
      .channel(`avisos-suporte-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'respostas_sugestoes' },
        (p) => {
          const r = p.new as { autor?: string }
          if (!r.autor || r.autor === 'usuario') return
          if (estaOlhando('suporte') || !avisaSup.current(CANAL_INTEIRO) || !somCabeAEstaAba()) return
          tocarSom('suporte')
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, restauranteId])

  return null
}

// ── Aviso no topo da lista ─────────────────────────────────────────────────

const CHAVE_AVISO = 'easyfeed:wa-aviso-notificacao'

export function AvisoNotificacoes() {
  const { user } = useAuth()
  const [estado, setEstado] = useState<NotificationPermission | 'sem-suporte' | 'iphone'>(() => {
    if (iphoneSemApp()) return 'iphone'
    if (!pushSuportado()) return 'sem-suporte'
    return Notification.permission
  })
  const [fechado, setFechado] = useState(() => {
    try { return localStorage.getItem(CHAVE_AVISO) === estado } catch { return false }
  })
  const [pedindo, setPedindo] = useState(false)

  if (fechado || estado === 'granted' || estado === 'sem-suporte') return null

  const fechar = () => {
    setFechado(true)
    try { localStorage.setItem(CHAVE_AVISO, estado) } catch { /* ignora */ }
  }

  const ativar = async () => {
    if (!user) return
    setPedindo(true)
    setEstado(await pedirPermissaoEInscrever(user.id))
    setPedindo(false)
  }

  return (
    <div className="flex shrink-0 items-start gap-3 bg-[#E7F3FF] px-4 py-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#53BDEB] text-white">
        <BellRing className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 text-[13.5px] leading-snug text-gray-700">
        {estado === 'default' && (
          <>
            <p className="font-medium text-gray-900">Receba aviso de mensagens novas</p>
            <button type="button" onClick={ativar} disabled={pedindo} className="mt-0.5 font-medium text-[#027EB5] hover:underline disabled:opacity-60">
              {pedindo ? 'Ativando…' : 'Ativar notificações'}
            </button>
          </>
        )}
        {estado === 'denied' && (
          <p>As notificações estão bloqueadas neste navegador. Para receber avisos, libere nas permissões do site (ícone do cadeado ao lado do endereço).</p>
        )}
        {estado === 'iphone' && (
          <p>No iPhone, as notificações só funcionam com o EasyFeed na Tela de Início: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b> e abra por lá.</p>
        )}
      </div>
      <button type="button" onClick={fechar} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="Fechar aviso">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
