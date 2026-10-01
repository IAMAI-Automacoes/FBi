import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, Loader2, Lock, Search, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { avisarConversaAtiva } from '@/lib/notificacoes-app'
import {
  agregarReacoes, formatarTelefone, mesmoDia, rotuloDia, type MensagemWa,
} from '@/lib/whatsapp/formatacao'
import { buscarMensagens, buscarPorIds, marcarLidas, urlsAssinadas } from '@/lib/queries/whatsapp'
import { Avatar, SeparadorDia, WA } from './pecas'
import { Balao } from './Balao'
import { Galeria, LeitorPdf, type ItemGaleria } from './midia/Galeria'

/** Linha crua que o Realtime entrega → o formato da tela. */
export function deLinhaRealtime(r: Record<string, any>): MensagemWa {
  return {
    id: r.id, message_id: r.message_id, chat_id: r.chat_id, telefone: r.telefone, nome_exibicao: r.nome_exibicao,
    de_mim: r.de_mim, por_api: r.por_api, grupo: r.grupo, tipo: r.tipo, texto: r.texto, transcricao: r.transcricao,
    reacao: r.reacao, responde_message_id: r.responde_message_id, midia_caminho: r.midia_caminho, midia_mime: r.midia_mime,
    midia_nome: r.midia_nome, status: r.status, editada_em: r.editada_em, enviada_em: r.enviada_em,
    remetente: r.payload?.message?.senderName ?? null,
  }
}

function ordenar(a: MensagemWa, b: MensagemWa) {
  return a.enviada_em < b.enviada_em ? -1 : a.enviada_em > b.enviada_em ? 1 : a.id - b.id
}

const autorChave = (m: MensagemWa) => (m.de_mim ? `eu:${m.por_api}` : m.grupo ? `g:${m.remetente ?? m.telefone}` : 'contato')

export interface PedidoSalto { messageId: string; vez: number }

export function Conversa({
  restauranteId, chatId, nome, foto, telefone, grupo, naoLidasNaAbertura, linkResponder, motivoSemLink,
  salto, aoVoltar, aoAbrirContato, aoAbrirPesquisa, aoAbrirPessoa,
}: {
  restauranteId: number
  chatId: string
  nome: string
  foto: string | null
  telefone: string | null
  grupo: boolean
  naoLidasNaAbertura: number
  /** Link do botão "Enviar mensagem" (WhatsApp pessoal do dono); null = não dá. */
  linkResponder: string | null
  motivoSemLink: string | null
  /** Pedido para rolar até uma mensagem (vem da pesquisa). */
  salto: PedidoSalto | null
  aoVoltar: () => void
  aoAbrirContato: () => void
  aoAbrirPesquisa: () => void
  aoAbrirPessoa: (p: { nome: string | null; telefone: string | null }) => void
}) {
  const { toast } = useToast()
  const [mensagens, setMensagens] = useState<MensagemWa[]>([])
  const [temMais, setTemMais] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  // Citadas fora das páginas carregadas; null = não existe no histórico.
  const [extras, setExtras] = useState<Map<string, MensagemWa | null>>(new Map())
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [divisorId, setDivisorId] = useState<number | null>(null)
  const [qtdDivisor, setQtdDivisor] = useState(0)
  const [pertoDoFim, setPertoDoFim] = useState(true)
  const [novasLonge, setNovasLonge] = useState(0)
  const [galeria, setGaleria] = useState<number | null>(null)
  const [pdf, setPdf] = useState<{ url: string; nome: string } | null>(null)
  const [piscando, setPiscando] = useState<string | null>(null)
  const [autoTocarId, setAutoTocarId] = useState<number | null>(null)

  const rolagem = useRef<HTMLDivElement>(null)
  const fim = useRef<HTMLDivElement>(null)
  const divisorRef = useRef<HTMLDivElement>(null)
  const alturaAntes = useRef<number | null>(null)
  const posicionouInicio = useRef(false)
  const marcadaAte = useRef<string | null>(null)
  const temMaisRef = useRef(temMais)
  temMaisRef.current = temMais
  const mensagensRef = useRef(mensagens)
  mensagensRef.current = mensagens

  // ── Carga inicial ──
  useEffect(() => {
    let ativo = true
    setCarregando(true)
    posicionouInicio.current = false
    buscarMensagens(restauranteId, chatId)
      .then(({ mensagens: lista, temMais: mais }) => {
        if (!ativo) return
        setMensagens(lista)
        setTemMais(mais)
        // Divisor "N mensagens não lidas" antes da primeira não lida (contada
        // como na lista de conversas: recebidas, sem reação nem apagadas).
        const recebidas = lista.filter((m) => !m.de_mim && m.tipo !== 'reaction' && m.status !== 'DELETED')
        const n = Math.min(naoLidasNaAbertura, recebidas.length)
        setQtdDivisor(n)
        setDivisorId(n > 0 ? recebidas[recebidas.length - n].id : null)
      })
      .catch(() => toast({ title: 'Não consegui abrir a conversa', description: 'Confira a internet e tente de novo.', variant: 'destructive' }))
      .finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
    // naoLidasNaAbertura é lido só ao abrir, de propósito (o divisor não anda).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restauranteId, chatId])

  // ── Tempo real: mensagem nova, status, edição, exclusão ──
  useEffect(() => {
    const canal = supabase
      .channel(`wa-conversa-${restauranteId}-${chatId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens_whatsapp', filter: `restaurante_id=eq.${restauranteId}` },
        (p) => {
          const linha = p.new as Record<string, any>
          if (!linha || linha.chat_id !== chatId) return
          const m = deLinhaRealtime(linha)
          setMensagens((atual) => {
            const i = atual.findIndex((x) => x.id === m.id)
            if (i >= 0) { const c = atual.slice(); c[i] = m; return c }
            return [...atual, m].sort(ordenar)
          })
          if (p.eventType === 'INSERT' && m.tipo !== 'reaction') {
            const el = rolagem.current
            const longe = el ? el.scrollHeight - el.scrollTop - el.clientHeight > 160 : false
            if (longe && !m.de_mim) setNovasLonge((n) => n + 1)
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [restauranteId, chatId])

  // ── URLs assinadas das mídias que ainda não têm ──
  useEffect(() => {
    const faltam = mensagens.map((m) => m.midia_caminho).filter((c): c is string => !!c && !(c in urls))
    if (faltam.length === 0) return
    let ativo = true
    urlsAssinadas(faltam).then((novas) => { if (ativo) setUrls((u) => ({ ...u, ...novas })) })
    return () => { ativo = false }
  }, [mensagens, urls])

  // ── Citações de mensagens fora das páginas carregadas ──
  const porMessageId = useMemo(() => {
    const m = new Map<string, MensagemWa | null>(extras)
    for (const x of mensagens) m.set(x.message_id, x)
    return m
  }, [mensagens, extras])

  useEffect(() => {
    const faltam = Array.from(new Set(
      mensagens.filter((m) => m.tipo !== 'reaction' && m.responde_message_id && !porMessageId.has(m.responde_message_id))
        .map((m) => m.responde_message_id!),
    ))
    if (faltam.length === 0) return
    let ativo = true
    buscarPorIds(restauranteId, faltam).then((achadas) => {
      if (!ativo) return
      setExtras((e) => {
        const n = new Map(e)
        for (const id of faltam) n.set(id, achadas.find((a) => a.message_id === id) ?? null)
        return n
      })
    }).catch(() => {})
    return () => { ativo = false }
  }, [mensagens, porMessageId, restauranteId])

  const visiveis = useMemo(() => mensagens.filter((m) => m.tipo !== 'reaction'), [mensagens])
  const reacoes = useMemo(() => agregarReacoes(mensagens), [mensagens])

  // ── Posição da rolagem ──
  useLayoutEffect(() => {
    const el = rolagem.current
    if (!el || carregando) return
    if (alturaAntes.current !== null) {
      // Carregou mensagens antigas em cima: mantém o que estava na tela parado.
      el.scrollTop += el.scrollHeight - alturaAntes.current
      alturaAntes.current = null
      return
    }
    if (!posicionouInicio.current) {
      posicionouInicio.current = true
      if (divisorRef.current) divisorRef.current.scrollIntoView({ block: 'start' })
      else el.scrollTop = el.scrollHeight
      return
    }
    if (pertoDoFim) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [visiveis.length, carregando, pertoDoFim])

  const carregarMais = useCallback(async (): Promise<boolean> => {
    if (!temMaisRef.current || carregandoMais) return false
    const primeira = mensagensRef.current[0]
    if (!primeira) return false
    setCarregandoMais(true)
    try {
      const { mensagens: antigas, temMais: mais } = await buscarMensagens(restauranteId, chatId, primeira.enviada_em)
      alturaAntes.current = rolagem.current?.scrollHeight ?? null
      setMensagens((atual) => {
        const ids = new Set(atual.map((m) => m.id))
        return [...antigas.filter((m) => !ids.has(m.id)), ...atual]
      })
      setTemMais(mais)
      temMaisRef.current = mais
      return antigas.length > 0
    } finally {
      setCarregandoMais(false)
    }
  }, [restauranteId, chatId, carregandoMais])

  const aoRolar = () => {
    const el = rolagem.current
    if (!el) return
    if (el.scrollTop < 300 && temMais && !carregandoMais) carregarMais()
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (perto !== pertoDoFim) setPertoDoFim(perto)
    if (perto && novasLonge) setNovasLonge(0)
  }

  // ── Marcar como lida (no painel e no WhatsApp) quando o fim aparece na tela ──
  const marcarSePreciso = useCallback(() => {
    if (document.visibilityState !== 'visible') return
    const recebidas = mensagensRef.current.filter((m) => !m.de_mim && m.tipo !== 'reaction')
    const ultima = recebidas[recebidas.length - 1]
    if (!ultima || marcadaAte.current === ultima.message_id) return
    marcadaAte.current = ultima.message_id
    marcarLidas(chatId)
  }, [chatId])

  useEffect(() => {
    const alvo = fim.current
    const raiz = rolagem.current
    if (!alvo || !raiz) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) marcarSePreciso() }, { root: raiz, threshold: 0.1 })
    obs.observe(alvo)
    return () => obs.disconnect()
  }, [marcarSePreciso, carregando])

  // Chegou mensagem com o fim na tela: marca também.
  useEffect(() => { if (pertoDoFim) marcarSePreciso() }, [visiveis.length, pertoDoFim, marcarSePreciso])

  // Diz ao service worker que esta conversa está aberta (não notifica ela).
  useEffect(() => {
    const avisar = () => {
      avisarConversaAtiva(document.visibilityState === 'visible' ? `wa:${chatId}` : null)
      if (document.visibilityState === 'visible') marcarSePreciso()
    }
    avisar()
    document.addEventListener('visibilitychange', avisar)
    return () => { document.removeEventListener('visibilitychange', avisar); avisarConversaAtiva(null) }
  }, [chatId, marcarSePreciso])

  // ── Ir até uma mensagem (citação, pesquisa) ──
  const irPara = useCallback(async (messageId: string) => {
    const achar = () => rolagem.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`)
    let el = achar()
    for (let tentativa = 0; !el && tentativa < 20 && temMaisRef.current; tentativa++) {
      const veio = await carregarMais()
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      el = achar()
      if (!veio) break
    }
    if (!el) {
      toast({ title: 'Mensagem não encontrada', description: 'Ela é anterior ao histórico guardado desta conversa.' })
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setPiscando(messageId)
    setTimeout(() => setPiscando((p) => (p === messageId ? null : p)), 1800)
  }, [carregarMais, toast])

  // Pula só depois da carga inicial (vindo da pesquisa da lista, a conversa
  // abre e o pedido chega antes das mensagens) — e uma vez por pedido.
  const saltoFeito = useRef<number | null>(null)
  useEffect(() => {
    if (!salto || carregando || saltoFeito.current === salto.vez) return
    saltoFeito.current = salto.vez
    irPara(salto.messageId)
  }, [salto, carregando, irPara])

  // ── Galeria e áudio seguido ──
  const itensGaleria: ItemGaleria[] = useMemo(() => visiveis
    .filter((m) => ['image', 'video', 'gif'].includes(m.tipo) && m.status !== 'DELETED' && m.midia_caminho && urls[m.midia_caminho])
    .map((m) => ({
      id: m.id,
      tipo: m.tipo as ItemGaleria['tipo'],
      url: urls[m.midia_caminho!],
      legenda: m.texto,
      autor: m.de_mim ? 'Você' : m.grupo ? (m.remetente || formatarTelefone(m.telefone)) : nome,
      enviada_em: m.enviada_em,
      nomeArquivo: m.midia_caminho!.split('/').pop() ?? 'arquivo',
    })), [visiveis, urls, nome])

  const abrirMidia = useCallback((id: number) => {
    const i = itensGaleria.findIndex((x) => x.id === id)
    if (i >= 0) setGaleria(i)
  }, [itensGaleria])

  const abrirPdf = useCallback((m: MensagemWa) => {
    const u = m.midia_caminho ? urls[m.midia_caminho] : ''
    if (u) setPdf({ url: u, nome: m.midia_nome || 'Documento.pdf' })
  }, [urls])

  const aoTerminarAudio = useCallback((id: number) => {
    const i = visiveis.findIndex((m) => m.id === id)
    const prox = visiveis[i + 1]
    setAutoTocarId(prox && prox.tipo === 'audio' && prox.status !== 'DELETED' ? prox.id : null)
  }, [visiveis])

  const descer = () => {
    const el = rolagem.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setNovasLonge(0)
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Cabeçalho */}
      <div className="flex shrink-0 items-stretch" style={{ background: WA.TEAL, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <button type="button" onClick={aoVoltar} className="flex items-center pl-2 pr-1 text-white/90 hover:text-white md:hidden" aria-label="Voltar para as conversas">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={aoAbrirContato} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:brightness-95" title="Dados do contato">
          <Avatar nome={nome} grupo={grupo} foto={foto} tamanho={40} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight text-white">{nome}</p>
            <p className="truncate text-[12px] text-white/75">
              {grupo ? 'Grupo · toque para ver mídias' : telefone ? formatarTelefone(telefone) : 'toque para ver o contato'}
            </p>
          </div>
        </button>
        <button type="button" onClick={aoAbrirPesquisa} className="flex w-12 items-center justify-center text-white/90 hover:text-white" aria-label="Pesquisar na conversa" title="Pesquisar na conversa">
          <Search className="h-5 w-5" />
        </button>
      </div>

      {/* Mensagens */}
      <div className="relative min-h-0 flex-1">
        <div ref={rolagem} onScroll={aoRolar} className="sem-barra h-full overflow-y-auto pb-3 pt-1" style={{ background: WA.FUNDO }}>
          {carregando ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: WA.TEAL }} /></div>
          ) : (
            <>
              <div className="flex justify-center py-2">
                {carregandoMais ? <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                  : !temMais && (
                    <span className="mx-4 flex max-w-md items-center gap-1.5 rounded-lg bg-[#FFF5C4] px-3 py-1.5 text-center text-[12px] text-gray-600 shadow-sm">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      Início do histórico guardado. Mensagens de antes de conectar o WhatsApp ao EasyFeed não aparecem aqui.
                    </span>
                  )}
              </div>
              {visiveis.map((m, i) => {
                const ant = visiveis[i - 1]
                const novoDia = !ant || !mesmoDia(ant.enviada_em, m.enviada_em)
                const primeiro = novoDia || !ant || autorChave(ant) !== autorChave(m) || m.id === divisorId
                const citada = m.responde_message_id ? (porMessageId.has(m.responde_message_id) ? porMessageId.get(m.responde_message_id) ?? null : null) : undefined
                return (
                  <Fragment key={m.id}>
                    {novoDia && <SeparadorDia rotulo={rotuloDia(m.enviada_em)} />}
                    {m.id === divisorId && qtdDivisor > 0 && (
                      <div ref={divisorRef} className="my-2 flex justify-center bg-white/40 py-1">
                        <span className="rounded-full px-4 py-1 text-[12px] font-semibold text-white" style={{ background: WA.TEAL }}>
                          {qtdDivisor} mensage{qtdDivisor === 1 ? 'm não lida' : 'ns não lidas'}
                        </span>
                      </div>
                    )}
                    <Balao
                      m={m}
                      primeiroDoGrupo={primeiro}
                      nomeContato={nome}
                      fotoContato={foto}
                      url={m.midia_caminho ? urls[m.midia_caminho] ?? '' : ''}
                      citada={citada}
                      reacoes={reacoes.get(m.message_id) ?? []}
                      piscando={piscando === m.message_id}
                      autoTocar={autoTocarId === m.id}
                      aoAbrirMidia={abrirMidia}
                      aoAbrirPdf={abrirPdf}
                      aoIrParaCitada={irPara}
                      aoTerminarAudio={aoTerminarAudio}
                      aoAbrirPessoa={aoAbrirPessoa}
                    />
                  </Fragment>
                )
              })}
              {visiveis.length === 0 && (
                <p className="mt-10 text-center text-sm text-gray-500">Nenhuma mensagem nesta conversa.</p>
              )}
            </>
          )}
          <div ref={fim} className="h-px" />
        </div>

        {!pertoDoFim && !carregando && (
          <button
            type="button"
            onClick={descer}
            className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-600 shadow-md hover:bg-gray-50"
            aria-label="Ir para a última mensagem"
          >
            <ChevronDown className="h-6 w-6" />
            {novasLonge > 0 && (
              <span className="absolute -top-1.5 -right-1 min-w-[20px] rounded-full px-1 text-center text-[11px] font-bold leading-5 text-white" style={{ background: WA.VERDE }}>
                {novasLonge}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Rodapé: a tela não envia. Responder = WhatsApp pessoal do dono. */}
      <div
        className="flex shrink-0 items-center gap-3 border-t border-black/5 px-3 py-2.5"
        style={{ background: WA.BARRA, paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.625rem)' }}
      >
        <p className="min-w-0 flex-1 line-clamp-2 text-[12.5px] leading-snug text-gray-500" title={linkResponder ? 'Para responder, use o seu WhatsApp pessoal.' : motivoSemLink ?? undefined}>
          {linkResponder
            ? 'Para responder, use o seu WhatsApp pessoal.'
            : motivoSemLink ?? 'Esta tela mostra as conversas; não envia mensagens.'}
        </p>
        {linkResponder && (
          <a
            href={linkResponder}
            // intent:// (Android) precisa abrir na mesma aba para o sistema
            // entregar ao app; wa.me abre em aba nova para não sair do painel.
            target={linkResponder.startsWith('intent:') ? undefined : '_blank'}
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold text-white shadow-sm hover:brightness-105"
            style={{ background: WA.VERDE }}
          >
            <Send className="h-4 w-4" /> Enviar mensagem
          </a>
        )}
      </div>

      {galeria !== null && <Galeria itens={itensGaleria} inicial={galeria} aoFechar={() => setGaleria(null)} />}
      {pdf && <LeitorPdf url={pdf.url} nome={pdf.nome} aoFechar={() => setPdf(null)} />}
    </div>
  )
}
