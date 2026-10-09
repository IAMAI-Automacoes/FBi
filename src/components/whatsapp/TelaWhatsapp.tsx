import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { chaveWhatsapp } from '@/lib/telefone'
import {
  detectarAparelho, formatarTelefone, linkEnviarMensagem, nomeConversa, textoApresentacao, type ConversaWa,
} from '@/lib/whatsapp/formatacao'
import {
  acharMensagensDoFeedback, fixadasDoRestaurante, fotoConhecida, fotosDeParticipantes, listarConversas, restauranteEhBusiness,
} from '@/lib/queries/whatsapp'
import { WhatsappIcon } from '@/components/WhatsappIcon'
import { ListaConversas } from '@/components/whatsapp/ListaConversas'
import { Conversa, type PedidoSalto } from '@/components/whatsapp/Conversa'
import { PainelContato, PainelPesquisa } from '@/components/whatsapp/Paineis'
import { AvisoNotificacoes } from '@/components/whatsapp/Notificacoes'
import { usePreferencias } from '@/lib/queries/preferencias'
import { WA } from '@/components/whatsapp/pecas'

/** O restaurante cujas conversas a tela mostra. */
export interface RestauranteDaTela {
  id: number
  nome: string | null
  /** WhatsApp conectado de verdade. As páginas só abrem esta tela conectadas
   *  (senão mostram WhatsappDesconectado); aqui ele só decide o WhatsApp Business. */
  conectado: boolean
  /** WhatsApp pessoal do dono (o "Enviar mensagem" abre nele). */
  whatsappDono: string | null
}

const AVISO_ADMIN = 'Visualização do admin: só leitura. Nada aqui marca mensagens como lidas.'

/**
 * As conversas do número de um restaurante, como no WhatsApp.
 *
 *  modo 'dono'  → a página /whatsapp (src/pages/WhatsApp.tsx).
 *  modo 'admin' → o painel do admin, aba WhatsApp: exatamente o que o dono
 *                 vê, mas SÓ LEITURA — não marca como lida (nem o contador
 *                 do dono, nem os tiques azuis do cliente), sem sino,
 *                 fixar/silenciar, instalar ou "Enviar mensagem". As
 *                 fixadas mostradas são as do dono.
 *
 * Só mostra — não envia. Para responder, "Enviar mensagem" abre o WhatsApp
 * PESSOAL do dono na conversa com o cliente (SIMULACAO-WHATSAPP.txt, item 9).
 *
 * A URL guarda o estado (?chat=… &painel=contato|pesquisa), então o voltar do
 * celular fecha o painel / volta para a lista, e a notificação abre direto na
 * conversa. ?tel=… (vindo do card de feedback) acha a conversa pelo telefone;
 * com &feedback=<id>, rola até as mensagens daquele feedback e as destaca.
 * `paramsBase` são parâmetros que toda navegação preserva (no admin,
 * ?restaurante=<id>, a escolha do restaurante).
 */
export function TelaWhatsapp({ restaurante, modo, paramsBase, className }: {
  restaurante: RestauranteDaTela
  modo: 'dono' | 'admin'
  paramsBase?: Record<string, string>
  /** Classes da raiz (o tamanho e a posição vêm de quem usa). */
  className?: string
}) {
  const admin = modo === 'admin'
  const restauranteId = restaurante.id
  const idFotos = admin ? restauranteId : undefined
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const chatId = params.get('chat')
  const painel = params.get('painel') as 'contato' | 'pesquisa' | 'pessoa' | null

  // Toda navegação desta tela passa por aqui: preserva os parâmetros de quem
  // a usa (no admin, a escolha do restaurante).
  const baseRef = useRef(paramsBase)
  baseRef.current = paramsBase
  const irPara = useCallback((p: Record<string, string>, opts?: { replace?: boolean }) => {
    setParams({ ...(baseRef.current ?? {}), ...p }, opts)
  }, [setParams])

  // Aberto pelo ícone do app (?app=whatsapp) ou vindo de "Instalar app" em
  // outra página (?instalar=1): limpa a URL; no segundo caso, o botão de
  // instalar fica em destaque (o navegador só instala com um toque).
  const [destacarInstalar] = useState(() => !admin && params.get('instalar') === '1')
  useEffect(() => {
    if (admin || (!params.has('app') && !params.has('instalar'))) return
    const limpo = new URLSearchParams(params)
    limpo.delete('app')
    limpo.delete('instalar')
    setParams(limpo, { replace: true })
  }, [admin, params, setParams])

  // Participante de grupo aberto no painel (nome e telefone de quem mandou).
  const pessoaTel = params.get('pessoa')
  const [pessoaNome, setPessoaNome] = useState<string | null>(null)
  const [pessoaFoto, setPessoaFoto] = useState<string | null>(null)
  // Perfil aberto (inclusive por link/recarga): a foto, se a pessoa mostra.
  useEffect(() => {
    if (!pessoaTel) { setPessoaFoto(null); return }
    setPessoaFoto(fotoConhecida(pessoaTel, idFotos))
    let ativo = true
    fotosDeParticipantes([pessoaTel], idFotos).then((f) => { if (ativo) setPessoaFoto(f[pessoaTel] ?? null) })
    return () => { ativo = false }
  }, [pessoaTel, idFotos])

  const [conversas, setConversas] = useState<ConversaWa[]>([])
  const [carregando, setCarregando] = useState(true)
  // Silenciar/fixar do dono (o sino do topo silencia tudo: push e som). O som
  // em si toca no AvisosDoPainel. No admin não vale: lá as fixadas são as do
  // dono (abaixo) e silenciar é coisa de cada aparelho.
  const prefs = usePreferencias('whatsapp')
  const [fixadasDono, setFixadasDono] = useState<Map<string, string> | null>(null)
  useEffect(() => {
    if (!admin) return
    let ativo = true
    fixadasDoRestaurante(restauranteId)
      .then((m) => { if (ativo) setFixadasDono(m) })
      .catch(() => { if (ativo) setFixadasDono(new Map()) })
    return () => { ativo = false }
  }, [admin, restauranteId])
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

  const recarregar = useCallback(async () => {
    try {
      const lista = await listarConversas(restauranteId)
      // A conversa aberta não mostra contador: está sendo lida. No admin o
      // contador fica como o dono vê (o admin não lê por ele).
      setConversas(admin ? lista : lista.map((c) => (c.chat_id === chatRef.current ? { ...c, nao_lidas: 0 } : c)))
    } catch {
      toast({ title: 'Não consegui carregar as conversas', description: 'Confira a internet e recarregue a página.', variant: 'destructive' })
    } finally {
      setCarregando(false)
    }
  }, [restauranteId, admin, toast])

  useEffect(() => { recarregar() }, [recarregar])

  // Tempo real: qualquer mensagem do restaurante reordena a lista (com folga,
  // porque um áudio chega junto com status e outros eventos).
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | null = null
    const agendar = () => {
      if (espera) clearTimeout(espera)
      espera = setTimeout(recarregar, 400)
    }
    const canal = supabase
      .channel(`wa-lista-${modo}-${restauranteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens_whatsapp', filter: `restaurante_id=eq.${restauranteId}` }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens_whatsapp_leitura', filter: `restaurante_id=eq.${restauranteId}` }, agendar)
      .subscribe()
    return () => { if (espera) clearTimeout(espera); supabase.removeChannel(canal) }
  }, [restauranteId, modo, recarregar])

  // "Enviar mensagem" no Android abre o app que NÃO é o do restaurante.
  useEffect(() => {
    if (!admin && restaurante.conectado) restauranteEhBusiness().then(setBusiness)
  }, [admin, restaurante.conectado])

  // ?tel= (card de feedback): acha a conversa pelo telefone, com ou sem o 9.
  // Com &feedback=, pede para a conversa rolar até as mensagens que viraram
  // aquele feedback e destacá-las.
  const tel = params.get('tel')
  const feedbackId = params.get('feedback')
  useEffect(() => {
    if (!tel || carregando) return
    const alvo = conversas.find((c) => !c.grupo && c.telefone && chaveWhatsapp(c.telefone) === chaveWhatsapp(tel))
    if (alvo) {
      naoLidasAoAbrir.current.set(alvo.chat_id, alvo.nao_lidas)
      irPara({ chat: alvo.chat_id }, { replace: true })
      if (feedbackId) {
        const chat = alvo.chat_id
        acharMensagensDoFeedback(restauranteId, chat, feedbackId)
          .then((ids) => { if (ids.length) setSalto({ chatId: chat, messageId: ids[0], vez: Date.now(), realcar: ids }) })
          .catch(() => {})
      }
    } else {
      irPara({}, { replace: true })
      toast({ title: 'Ainda não há conversa com esse número', description: `${formatarTelefone(tel)} não mandou mensagem desde que o WhatsApp foi conectado ao EasyFeed.` })
    }
  }, [tel, feedbackId, carregando, conversas, irPara, toast, restauranteId])

  const abrir = useCallback((id: string) => {
    if (id === chatRef.current) return
    const c = conversas.find((x) => x.chat_id === id)
    naoLidasAoAbrir.current.set(id, c?.nao_lidas ?? 0)
    if (!admin) {
      setConversas((lista) => lista.map((x) => (x.chat_id === id ? { ...x, nao_lidas: 0 } : x)))
      // O número do menu lateral diminui 1 na hora (o banco confirma depois).
      window.dispatchEvent(new CustomEvent('easyfeed:whatsapp-conversa-lida', { detail: { chatId: id } }))
    }
    // Abrir a conversa a partir da lista empilha no histórico: o voltar do
    // celular volta à lista. Trocar de conversa no computador só substitui.
    const empilhar = !chatRef.current
    empilhouConversa.current = empilhar || empilhouConversa.current
    empilhouPainel.current = false
    irPara({ chat: id }, { replace: !empilhar })
  }, [conversas, admin, irPara])

  const fecharPainel = () => {
    if (!chatId) return
    if (empilhouPainel.current) { empilhouPainel.current = false; window.history.back() }
    else irPara({ chat: chatId }, { replace: true })
  }
  const abrirPainel = (p: 'contato' | 'pesquisa') => {
    if (!chatId) return
    if (painel === p) { fecharPainel(); return }
    if (!painel) empilhouPainel.current = true
    irPara({ chat: chatId, painel: p }, { replace: !!painel })
  }
  // Clique no nome/número de quem mandou, num grupo: o perfil dessa pessoa.
  const abrirPessoa = useCallback((p: { nome: string | null; telefone: string | null }) => {
    if (!chatRef.current || !p.telefone) return
    setPessoaNome(p.nome)
    const jaTinhaPainel = !!params.get('painel')
    if (!jaTinhaPainel) empilhouPainel.current = true
    irPara({ chat: chatRef.current, painel: 'pessoa', pessoa: p.telefone }, { replace: jaTinhaPainel })
  }, [params, irPara])
  const voltarParaLista = () => {
    if (empilhouConversa.current && !painel) { empilhouConversa.current = false; window.history.back() }
    else { empilhouConversa.current = false; empilhouPainel.current = false; irPara({}, { replace: true }) }
  }

  // Fixada/silenciada vêm das preferências sincronizadas (mudou noutra aba,
  // muda aqui). Antes de elas carregarem, vale o que a lista trouxe do banco.
  // No admin: as fixadas do DONO; silenciar não aparece (é por aparelho).
  const { alternarFixar: fixar, alternarSilencio: silenciar, silenciada, fixadaEm, carregado } = prefs
  const conversasVistas = useMemo(() => conversas
    .map((c) => {
      if (admin) return { ...c, silenciada: false, fixada_em: fixadasDono?.get(c.chat_id) ?? null }
      return carregado ? { ...c, silenciada: silenciada(c.chat_id), fixada_em: fixadaEm(c.chat_id) } : c
    })
    .sort((a, b) => {
      if (!!a.fixada_em !== !!b.fixada_em) return a.fixada_em ? -1 : 1
      if (a.fixada_em && b.fixada_em && a.fixada_em !== b.fixada_em) return a.fixada_em > b.fixada_em ? -1 : 1
      return a.ultima_enviada_em > b.ultima_enviada_em ? -1 : 1
    }), [conversas, admin, fixadasDono, carregado, silenciada, fixadaEm])

  // Resultado da pesquisa na lista: abre a conversa já na mensagem.
  const abrirNaMensagem = useCallback((id: string, messageId: string, termo: string) => {
    abrir(id)
    setSalto({ chatId: id, messageId, vez: Date.now(), termo })
  }, [abrir])

  // Dados da conversa aberta (da lista; se ainda não está nela, do próprio id).
  const aberta = conversas.find((c) => c.chat_id === chatId) ?? null
  const grupo = aberta?.grupo ?? (chatId?.endsWith('@g.us') ?? false)
  const telefone = aberta?.telefone ?? (chatId && !grupo ? chatId.split('@')[0].replace(/\D/g, '') : null)
  const nome = aberta ? nomeConversa(aberta) : chatId ? formatarTelefone(telefone) || chatId : ''

  const donoNum = restaurante.whatsappDono
  const nomeRestaurante = restaurante.nome
  const { linkResponder, motivoSemLink } = useMemo(() => {
    if (!chatId) return { linkResponder: null, motivoSemLink: null }
    // O "Enviar mensagem" abriria o WhatsApp do ADMIN para falar com o cliente do restaurante.
    if (admin) return { linkResponder: null, motivoSemLink: AVISO_ADMIN }
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
  }, [chatId, admin, grupo, donoNum, telefone, aberta?.nome_exibicao, nomeRestaurante, business])

  // Perfil do participante do grupo: mesmo botão, para o telefone dele.
  const conversaDaPessoa = pessoaTel
    ? conversas.find((c) => !c.grupo && c.telefone && chaveWhatsapp(c.telefone) === chaveWhatsapp(pessoaTel)) ?? null
    : null
  const nomePessoa = pessoaNome ?? conversaDaPessoa?.nome_exibicao ?? null
  const linkPessoa = pessoaTel && donoNum && !admin
    ? linkEnviarMensagem({
        telefoneCliente: pessoaTel,
        texto: textoApresentacao(nomePessoa, nomeRestaurante),
        aparelho: detectarAparelho(navigator.userAgent),
        restauranteBusiness: business,
      })
    : null
  const motivoPessoa = admin ? AVISO_ADMIN : donoNum ? null : 'Cadastre seu WhatsApp pessoal em Configurações para responder por aqui.'

  const aviso = (
    <>
      {!admin && <AvisoNotificacoes />}
    </>
  )

  return (
    <div className={className}>
      {/* Lista */}
      <div className={cn(
        'h-full w-full shrink-0 border-r border-gray-200 md:w-[360px] lg:w-[400px]',
        // Com o painel do contato/pesquisa aberto, a lista sai em telas que não
        // comportam as quatro colunas (menu + lista + conversa + painel) —
        // senão a conversa ficava espremida em ~220 px.
        chatId ? (painel ? 'hidden 2xl:block' : 'hidden md:block') : 'block',
      )}>
        <ListaConversas
          restauranteId={restauranteId}
          conversas={conversasVistas}
          carregando={carregando}
          ativa={chatId}
          aoAbrir={abrir}
          aoAbrirMensagem={abrirNaMensagem}
          aoFixar={fixar}
          aoSilenciar={silenciar}
          tudoSilenciado={prefs.tudoSilenciado}
          aoAlternarTudo={prefs.alternarTudo}
          destacarInstalar={destacarInstalar}
          somenteLeitura={admin}
          aviso={aviso}
        />
      </div>

      {/* Conversa */}
      <div className={cn('h-full min-w-0 flex-1', chatId ? 'flex' : 'hidden md:flex')}>
        {chatId && !carregando ? (
          <Conversa
            key={`${restauranteId}-${chatId}`}
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
            aoAbrirPessoa={abrirPessoa}
            somenteLeitura={admin}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-10 text-center" style={{ background: '#F0F2F5', borderBottom: `6px solid ${WA.VERDE}` }}>
            <WhatsappIcon className="h-20 w-20 text-[#25D366] opacity-80" />
            <h2 className="text-[26px] font-light text-gray-700">
              {admin ? `WhatsApp ${nomeRestaurante ? `do ${nomeRestaurante}` : 'do restaurante'}` : 'WhatsApp do restaurante'}
            </h2>
            {admin ? (
              <>
                <p className="max-w-md text-[14px] leading-relaxed text-gray-500">
                  Exatamente o que o dono vê na tela WhatsApp dele: as conversas, as não lidas e as fixadas.
                </p>
                <p className="mt-6 flex items-center gap-1.5 text-[12px] text-gray-400">
                  <Eye className="h-3.5 w-3.5" /> Visualização do admin — só leitura. Abrir uma conversa não marca nada como lido.
                </p>
              </>
            ) : (
              <>
                <p className="max-w-md text-[14px] leading-relaxed text-gray-500">
                  Todas as conversas do número conectado ao EasyFeed, com fotos, áudios e documentos.
                  Para responder um cliente, abra a conversa e toque em <b>Enviar mensagem</b>: abre no seu WhatsApp pessoal.
                </p>
                <p className="mt-6 flex items-center gap-1.5 text-[12px] text-gray-400">
                  <Lock className="h-3.5 w-3.5" /> Só a sua conta vê as conversas do seu restaurante.
                </p>
              </>
            )}
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
              linkResponder={linkResponder}
              motivoSemLink={motivoSemLink}
              numeroDono={donoNum ? formatarTelefone(donoNum) : null}
              somenteLeitura={admin}
              aoFechar={fecharPainel}
            />
          ) : painel === 'pessoa' && pessoaTel ? (
            <PainelContato
              key={pessoaTel}
              restauranteId={restauranteId}
              chatId={chatId}
              participante={{ nomeGrupo: nome, conversaIndividual: conversaDaPessoa?.chat_id ?? null }}
              aoAbrirConversa={(id) => { empilhouPainel.current = false; abrir(id) }}
              nome={nomePessoa || formatarTelefone(pessoaTel)}
              foto={pessoaFoto ?? conversaDaPessoa?.foto_url ?? null}
              telefone={pessoaTel}
              grupo={false}
              linkResponder={linkPessoa}
              motivoSemLink={motivoPessoa}
              numeroDono={donoNum ? formatarTelefone(donoNum) : null}
              somenteLeitura={admin}
              aoFechar={fecharPainel}
            />
          ) : (
            <PainelPesquisa
              restauranteId={restauranteId}
              chatId={chatId}
              nome={nome}
              aoFechar={fecharPainel}
              aoEscolher={(messageId, termo) => {
                setSalto({ chatId, messageId, vez: Date.now(), termo })
                if (window.innerWidth < 768) fecharPainel()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
