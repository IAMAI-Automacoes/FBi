import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Lock, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { chaveWhatsapp } from '@/lib/telefone'
import {
  detectarAparelho, formatarTelefone, linkEnviarMensagem, nomeConversa, textoApresentacao, type ConversaWa,
} from '@/lib/whatsapp/formatacao'
import { listarConversas, restauranteEhBusiness } from '@/lib/queries/whatsapp'
import { WhatsappIcon } from '@/components/WhatsappIcon'
import { ListaConversas } from '@/components/whatsapp/ListaConversas'
import { Conversa, type PedidoSalto } from '@/components/whatsapp/Conversa'
import { PainelContato, PainelPesquisa } from '@/components/whatsapp/Paineis'
import { AvisoNotificacoes, tocarSomMensagem } from '@/components/whatsapp/Notificacoes'
import { usePreferencias } from '@/lib/queries/preferencias'
import { WA } from '@/components/whatsapp/pecas'

/**
 * Tela WhatsApp: as conversas do número do restaurante, como no WhatsApp.
 *
 * Só mostra — não envia. Para responder, "Enviar mensagem" abre o WhatsApp
 * PESSOAL do dono na conversa com o cliente (SIMULACAO-WHATSAPP.txt, item 9).
 *
 * A URL guarda o estado (?chat=… &painel=contato|pesquisa), então o voltar do
 * celular fecha o painel / volta para a lista, e a notificação abre direto na
 * conversa. ?tel=… (vindo do card de feedback) acha a conversa pelo telefone.
 */
export default function WhatsApp() {
  const { user, usuario } = useAuth()
  const { toast } = useToast()
  const restauranteId = usuario?.restaurante_id ?? null
  const [params, setParams] = useSearchParams()
  const chatId = params.get('chat')
  const painel = params.get('painel') as 'contato' | 'pesquisa' | null

  const [conversas, setConversas] = useState<ConversaWa[]>([])
  const [carregando, setCarregando] = useState(true)
  // Silenciar/fixar (o sino do topo silencia tudo: push e som).
  const prefs = usePreferencias('whatsapp')
  const [business, setBusiness] = useState<boolean | null>(null)
  const [salto, setSalto] = useState<PedidoSalto | null>(null)
  // Não lidas de cada conversa no momento em que foi aberta: o divisor
  // "N mensagens não lidas" usa esse número, mesmo depois de zerar na lista.
  const naoLidasAoAbrir = useRef(new Map<string, number>())

  // O que esta tela empilhou no histórico: só isso o "voltar" desempilha.
  // (Quem chegou pelo card de feedback ou pela notificação não volta para
  // fora da tela ao fechar a conversa.)
  const empilhouConversa = useRef(false)
  const empilhouPainel = useRef(false)

  // Voltar do próprio aparelho fecha painel/conversa sem passar pelos botões.
  useEffect(() => { if (!painel) empilhouPainel.current = false }, [painel])
  useEffect(() => { if (!chatId) empilhouConversa.current = false }, [chatId])

  const chatRef = useRef(chatId)
  chatRef.current = chatId
  const somRef = useRef({ tudo: prefs.tudoSilenciado, conversas: new Set<string>() })
  somRef.current = { tudo: prefs.tudoSilenciado, conversas: new Set(conversas.filter((c) => c.silenciada).map((c) => c.chat_id)) }

  const recarregar = useCallback(async () => {
    if (!restauranteId) return
    try {
      const lista = await listarConversas(restauranteId)
      // A conversa aberta não mostra contador: está sendo lida.
      setConversas(lista.map((c) => (c.chat_id === chatRef.current ? { ...c, nao_lidas: 0 } : c)))
    } catch {
      toast({ title: 'Não consegui carregar as conversas', description: 'Confira a internet e recarregue a página.', variant: 'destructive' })
    } finally {
      setCarregando(false)
    }
  }, [restauranteId, toast])

  useEffect(() => { recarregar() }, [recarregar])

  // Tempo real: qualquer mensagem do restaurante reordena a lista (com folga,
  // porque um áudio chega junto com status e outros eventos).
  useEffect(() => {
    if (!restauranteId) return
    let espera: ReturnType<typeof setTimeout> | null = null
    const agendar = () => {
      if (espera) clearTimeout(espera)
      espera = setTimeout(recarregar, 400)
    }
    const canal = supabase
      .channel(`wa-lista-${restauranteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens_whatsapp', filter: `restaurante_id=eq.${restauranteId}` },
        (p) => {
          agendar()
          const m = p.new as { de_mim?: boolean; tipo?: string; chat_id?: string }
          const estaVendo = m.chat_id === chatRef.current && document.visibilityState === 'visible'
          const silencio = somRef.current.tudo || (m.chat_id ? somRef.current.conversas.has(m.chat_id) : false)
          if (p.eventType === 'INSERT' && m.de_mim === false && m.tipo !== 'reaction' && !estaVendo && !silencio) {
            tocarSomMensagem()
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens_whatsapp_leitura', filter: `restaurante_id=eq.${restauranteId}` }, agendar)
      .subscribe()
    return () => { if (espera) clearTimeout(espera); supabase.removeChannel(canal) }
  }, [restauranteId, recarregar])

  // "Enviar mensagem" no Android abre o app que NÃO é o do restaurante.
  useEffect(() => {
    if (usuario?.whatsapp_token) restauranteEhBusiness().then(setBusiness)
  }, [usuario?.whatsapp_token])

  // ?tel= (card de feedback): acha a conversa pelo telefone, com ou sem o 9.
  const tel = params.get('tel')
  useEffect(() => {
    if (!tel || carregando) return
    const alvo = conversas.find((c) => !c.grupo && c.telefone && chaveWhatsapp(c.telefone) === chaveWhatsapp(tel))
    if (alvo) {
      naoLidasAoAbrir.current.set(alvo.chat_id, alvo.nao_lidas)
      setParams({ chat: alvo.chat_id }, { replace: true })
    } else {
      setParams({}, { replace: true })
      toast({ title: 'Ainda não há conversa com esse número', description: `${formatarTelefone(tel)} não mandou mensagem desde que o WhatsApp foi conectado ao EasyFeed.` })
    }
  }, [tel, carregando, conversas, setParams, toast])

  const abrir = useCallback((id: string) => {
    if (id === chatRef.current) return
    const c = conversas.find((x) => x.chat_id === id)
    naoLidasAoAbrir.current.set(id, c?.nao_lidas ?? 0)
    setConversas((lista) => lista.map((x) => (x.chat_id === id ? { ...x, nao_lidas: 0 } : x)))
    // Abrir a conversa a partir da lista empilha no histórico: o voltar do
    // celular volta à lista. Trocar de conversa no computador só substitui.
    const empilhar = !chatRef.current
    empilhouConversa.current = empilhar || empilhouConversa.current
    empilhouPainel.current = false
    setParams({ chat: id }, { replace: !empilhar })
  }, [conversas, setParams])

  const fecharPainel = () => {
    if (!chatId) return
    if (empilhouPainel.current) { empilhouPainel.current = false; window.history.back() }
    else setParams({ chat: chatId }, { replace: true })
  }
  const abrirPainel = (p: 'contato' | 'pesquisa') => {
    if (!chatId) return
    if (painel === p) { fecharPainel(); return }
    if (!painel) empilhouPainel.current = true
    setParams({ chat: chatId, painel: p }, { replace: !!painel })
  }
  const voltarParaLista = () => {
    if (empilhouConversa.current && !painel) { empilhouConversa.current = false; window.history.back() }
    else { empilhouConversa.current = false; empilhouPainel.current = false; setParams({}, { replace: true }) }
  }

  // Fixar e silenciar mudam a lista na hora (e a ordem: fixadas no topo).
  const { alternarFixar, alternarSilencio } = prefs
  const ordenar = (lista: ConversaWa[]) => lista.slice().sort((a, b) => {
    if (!!a.fixada_em !== !!b.fixada_em) return a.fixada_em ? -1 : 1
    if (a.fixada_em && b.fixada_em && a.fixada_em !== b.fixada_em) return a.fixada_em > b.fixada_em ? -1 : 1
    return a.ultima_enviada_em > b.ultima_enviada_em ? -1 : 1
  })
  const fixar = useCallback((id: string) => {
    alternarFixar(id)
    setConversas((lista) => ordenar(lista.map((c) => (c.chat_id === id ? { ...c, fixada_em: c.fixada_em ? null : new Date().toISOString() } : c))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alternarFixar])
  const silenciar = useCallback((id: string) => {
    alternarSilencio(id)
    setConversas((lista) => lista.map((c) => (c.chat_id === id ? { ...c, silenciada: !c.silenciada } : c)))
  }, [alternarSilencio])

  // Dados da conversa aberta (da lista; se ainda não está nela, do próprio id).
  const aberta = conversas.find((c) => c.chat_id === chatId) ?? null
  const grupo = aberta?.grupo ?? (chatId?.endsWith('@g.us') ?? false)
  const telefone = aberta?.telefone ?? (chatId && !grupo ? chatId.split('@')[0].replace(/\D/g, '') : null)
  const nome = aberta ? nomeConversa(aberta) : chatId ? formatarTelefone(telefone) || chatId : ''

  const donoNum = (usuario as { whatsapp_dono?: string | null } | null)?.whatsapp_dono ?? null
  const nomeRestaurante = (usuario as { nome_restaurante?: string | null } | null)?.nome_restaurante ?? null
  const { linkResponder, motivoSemLink } = useMemo(() => {
    if (!chatId) return { linkResponder: null, motivoSemLink: null }
    if (grupo) return { linkResponder: null, motivoSemLink: 'Esta tela mostra as conversas; não envia mensagens.' }
    if (!donoNum) return { linkResponder: null, motivoSemLink: 'Cadastre seu WhatsApp pessoal em Configurações para responder clientes por aqui.' }
    if (!telefone) return { linkResponder: null, motivoSemLink: 'Este contato não tem telefone visível.' }
    return {
      linkResponder: linkEnviarMensagem({
        telefoneCliente: telefone,
        texto: textoApresentacao(aberta?.nome_exibicao ?? null, nomeRestaurante),
        aparelho: detectarAparelho(navigator.userAgent),
        restauranteBusiness: business,
      }),
      motivoSemLink: null,
    }
  }, [chatId, grupo, donoNum, telefone, aberta?.nome_exibicao, nomeRestaurante, business])

  if (!restauranteId || !user) return null

  const desconectado = !usuario?.whatsapp_token
  const aviso = (
    <>
      {desconectado && (
        <div className="flex shrink-0 items-start gap-3 bg-[#FDECEA] px-4 py-3 text-[13.5px] text-gray-700">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <p>
            <span className="font-medium text-gray-900">WhatsApp desconectado.</span> Mensagens novas não chegam aqui.{' '}
            <Link to="/configuracoes" className="font-medium text-[#027EB5] underline">Conectar</Link>
          </p>
        </div>
      )}
      <AvisoNotificacoes />
    </>
  )

  return (
    <div
      // Ocupa a tela inteira dentro do Layout (o cabeçalho fixo some nesta
      // rota, ver ROTAS_SEM_TOPO), como a página de Sugestões.
      className="-ml-4 -mr-8 -my-4 sm:-ml-6 sm:-my-6 lg:-ml-8 lg:-my-8 flex overflow-hidden bg-white"
      style={{ height: '100dvh' }}
    >
      {/* Lista */}
      <div className={cn(
        'h-full w-full shrink-0 border-r border-gray-200 md:w-[360px] lg:w-[400px]',
        // Com o painel do contato/pesquisa aberto, a lista sai em telas que não
        // comportam as quatro colunas (menu + lista + conversa + painel) —
        // senão a conversa ficava espremida em ~220 px.
        chatId ? (painel ? 'hidden 2xl:block' : 'hidden md:block') : 'block',
      )}>
        <ListaConversas
          conversas={conversas}
          carregando={carregando}
          ativa={chatId}
          aoAbrir={abrir}
          aoFixar={fixar}
          aoSilenciar={silenciar}
          tudoSilenciado={prefs.tudoSilenciado}
          aoAlternarTudo={prefs.alternarTudo}
          aviso={aviso}
        />
      </div>

      {/* Conversa */}
      <div className={cn('h-full min-w-0 flex-1', chatId ? 'flex' : 'hidden md:flex')}>
        {chatId && !carregando ? (
          <Conversa
            key={chatId}
            restauranteId={restauranteId}
            chatId={chatId}
            nome={nome}
            foto={aberta?.foto_url ?? null}
            telefone={telefone}
            grupo={grupo}
            naoLidasNaAbertura={naoLidasAoAbrir.current.get(chatId) ?? aberta?.nao_lidas ?? 0}
            linkResponder={linkResponder}
            motivoSemLink={motivoSemLink}
            salto={salto}
            aoVoltar={voltarParaLista}
            aoAbrirContato={() => abrirPainel('contato')}
            aoAbrirPesquisa={() => abrirPainel('pesquisa')}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-10 text-center" style={{ background: '#F0F2F5', borderBottom: `6px solid ${WA.VERDE}` }}>
            <WhatsappIcon className="h-20 w-20 text-[#25D366] opacity-80" />
            <h2 className="text-[26px] font-light text-gray-700">WhatsApp do restaurante</h2>
            <p className="max-w-md text-[14px] leading-relaxed text-gray-500">
              Todas as conversas do número conectado ao EasyFeed, com fotos, áudios e documentos.
              Para responder um cliente, abra a conversa e toque em <b>Enviar mensagem</b>: abre no seu WhatsApp pessoal.
            </p>
            <p className="mt-6 flex items-center gap-1.5 text-[12px] text-gray-400">
              <Lock className="h-3.5 w-3.5" /> Só a sua conta vê as conversas do seu restaurante.
            </p>
          </div>
        )}
      </div>

      {/* Painel lateral: contato ou pesquisa (no celular, por cima de tudo) */}
      {chatId && painel && (
        <div className="fixed inset-0 z-50 md:static md:z-auto md:h-full md:w-[360px] md:shrink-0 md:border-l md:border-gray-200 lg:w-[400px]">
          {painel === 'contato' ? (
            <PainelContato
              restauranteId={restauranteId}
              chatId={chatId}
              nome={nome}
              foto={aberta?.foto_url ?? null}
              telefone={telefone}
              grupo={grupo}
              fixada={!!aberta?.fixada_em}
              silenciada={!!aberta?.silenciada}
              aoFixar={() => fixar(chatId)}
              aoSilenciar={() => silenciar(chatId)}
              linkResponder={linkResponder}
              motivoSemLink={motivoSemLink}
              numeroDono={donoNum ? formatarTelefone(donoNum) : null}
              aoFechar={fecharPainel}
            />
          ) : (
            <PainelPesquisa
              restauranteId={restauranteId}
              chatId={chatId}
              nome={nome}
              aoFechar={fecharPainel}
              aoEscolher={(messageId) => {
                setSalto({ messageId, vez: Date.now() })
                if (window.innerWidth < 768) fecharPainel()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
