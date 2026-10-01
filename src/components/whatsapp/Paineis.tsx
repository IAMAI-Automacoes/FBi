import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Link2, Loader2, MessageCircle, Play, Search, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatarTelefone, horaCurta, linksDoTexto, previaMensagem, rotuloDia, trechoComTermo, type MensagemWa,
} from '@/lib/whatsapp/formatacao'
import {
  buscarMidiasDaConversa, pesquisarMensagens, urlParaBaixar, urlsAssinadas, type ResultadoBusca,
} from '@/lib/queries/whatsapp'
import { Avatar, TextoWhatsapp, WA } from './pecas'
import { Galeria, LeitorPdf, type ItemGaleria } from './midia/Galeria'

function Cabecalho({ titulo, aoFechar }: { titulo: string; aoFechar: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3" style={{ minHeight: 60, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <button type="button" onClick={aoFechar} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100" aria-label="Fechar">
        <X className="h-5 w-5" />
      </button>
      <p className="text-[16px] font-medium text-gray-800">{titulo}</p>
    </div>
  )
}

// ── Contato ────────────────────────────────────────────────────────────────

type Aba = 'midia' | 'docs' | 'links'

export function PainelContato({
  restauranteId, chatId, nome, foto, telefone, grupo, participante, aoAbrirConversa,
  linkResponder, motivoSemLink, numeroDono, aoFechar,
}: {
  restauranteId: number
  chatId: string
  nome: string
  foto: string | null
  telefone: string | null
  grupo: boolean
  /** Perfil de quem mandou mensagem num grupo (chatId = o grupo). */
  participante?: { nomeGrupo: string; conversaIndividual: string | null }
  /** "Ver conversa": abre a conversa individual com essa pessoa. */
  aoAbrirConversa?: (chatId: string) => void
  linkResponder: string | null
  motivoSemLink: string | null
  /** WhatsApp pessoal do dono, formatado (de onde a mensagem deve sair). */
  numeroDono: string | null
  aoFechar: () => void
}) {
  const [midias, setMidias] = useState<MensagemWa[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [aba, setAba] = useState<Aba>('midia')
  const [galeria, setGaleria] = useState<number | null>(null)
  const [pdf, setPdf] = useState<{ url: string; nome: string } | null>(null)

  useEffect(() => {
    let ativo = true
    setMidias(null)
    buscarMidiasDaConversa(restauranteId, chatId, participante ? telefone : null)
      .then(async (lista) => {
        if (!ativo) return
        setMidias(lista)
        const caminhos = lista.map((m) => m.midia_caminho).filter((c): c is string => !!c)
        if (caminhos.length) { const u = await urlsAssinadas(caminhos); if (ativo) setUrls(u) }
      })
      .catch(() => { if (ativo) setMidias([]) })
    return () => { ativo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restauranteId, chatId, telefone, !!participante])

  const visuais = useMemo(() => (midias ?? []).filter((m) => ['image', 'video', 'gif'].includes(m.tipo) && m.midia_caminho), [midias])
  const docs = useMemo(() => (midias ?? []).filter((m) => m.tipo === 'document'), [midias])
  const links = useMemo(() => (midias ?? []).flatMap((m) => linksDoTexto(m.texto).map((href) => ({ href, m }))), [midias])

  const itens: ItemGaleria[] = visuais.filter((m) => urls[m.midia_caminho!]).map((m) => ({
    id: m.id, tipo: m.tipo as ItemGaleria['tipo'], url: urls[m.midia_caminho!], legenda: m.texto,
    autor: m.de_mim ? 'Você' : m.grupo ? (m.remetente || formatarTelefone(m.telefone)) : nome,
    enviada_em: m.enviada_em, nomeArquivo: m.midia_caminho!.split('/').pop() ?? 'arquivo',
  }))

  const abrirDoc = async (m: MensagemWa) => {
    if (!m.midia_caminho) return
    const ehPdf = (m.midia_mime ?? '').includes('pdf') || /\.pdf$/i.test(m.midia_nome ?? '')
    if (ehPdf && urls[m.midia_caminho]) { setPdf({ url: urls[m.midia_caminho], nome: m.midia_nome || 'Documento.pdf' }); return }
    const link = await urlParaBaixar(m.midia_caminho, m.midia_nome)
    if (link) window.location.href = link
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#F0F2F5]">
      <Cabecalho titulo={participante ? 'Participante do grupo' : grupo ? 'Dados do grupo' : 'Dados do contato'} aoFechar={aoFechar} />
      <div className="sem-barra min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-2 bg-white px-6 pb-6 pt-8 text-center">
          <Avatar nome={nome} grupo={grupo} foto={foto} tamanho={120} />
          <p className="mt-2 text-[22px] text-[#111b21]">{nome}</p>
          {!grupo && telefone && <p className="text-[15px] text-gray-500">{formatarTelefone(telefone)}</p>}
          {participante && <p className="text-[13px] text-gray-400">em {participante.nomeGrupo}</p>}

          {!grupo && (
            linkResponder ? (
              <div className="mt-3 flex w-full max-w-xs flex-col items-center gap-1.5">
                <a
                  href={linkResponder}
                  target={linkResponder.startsWith('intent:') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm hover:brightness-105"
                  style={{ background: WA.VERDE }}
                >
                  <Send className="h-4 w-4" /> Enviar mensagem
                </a>
                {numeroDono && <p className="text-[12px] text-gray-500">Abre no seu WhatsApp {numeroDono}</p>}
              </div>
            ) : (
              <div className="mt-3 w-full max-w-xs rounded-lg bg-[#FFF5C4] px-3 py-2 text-[13px] text-gray-700">
                {motivoSemLink}
                {!numeroDono && (
                  <> <Link to="/configuracoes" className="font-medium text-[#027EB5] underline">Ir para Configurações</Link></>
                )}
              </div>
            )
          )}
        </div>

        {participante?.conversaIndividual && aoAbrirConversa && (
          <div className="mt-2 bg-white">
            <button
              type="button"
              onClick={() => aoAbrirConversa(participante.conversaIndividual!)}
              className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-gray-50"
            >
              <MessageCircle className="h-5 w-5" style={{ color: WA.TEAL }} />
              <span className="flex-1 text-[15px] text-gray-800">Ver conversa com {nome} no painel</span>
            </button>
          </div>
        )}

        <div className="mt-2 bg-white">
          <div className="flex border-b border-gray-100" role="tablist">
            {([['midia', `Mídia ${visuais.length || ''}`], ['docs', `Docs ${docs.length || ''}`], ['links', `Links ${links.length || ''}`]] as [Aba, string][]).map(([chave, rotulo]) => (
              <button key={chave} type="button" role="tab" aria-selected={aba === chave} onClick={() => setAba(chave)}
                className={cn('flex-1 border-b-2 py-3 text-[14px] font-medium', aba === chave ? 'border-[#128C7E] text-[#128C7E]' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                {rotulo.trim()}
              </button>
            ))}
          </div>

          {midias === null ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : aba === 'midia' ? (
            visuais.length === 0 ? <Vazio texto={participante ? 'Essa pessoa não mandou foto, vídeo ou GIF neste grupo.' : 'Nenhuma foto, vídeo ou GIF.'} /> : (
              <div className="grid grid-cols-3 gap-1 p-1">
                {visuais.map((m) => {
                  const u = urls[m.midia_caminho!]
                  const i = itens.findIndex((x) => x.id === m.id)
                  return (
                    <button key={m.id} type="button" onClick={() => i >= 0 && setGaleria(i)} className="relative aspect-square overflow-hidden bg-gray-100">
                      {u && (m.tipo === 'image'
                        ? <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : <video src={`${u}#t=0.1`} muted preload="metadata" className="h-full w-full object-cover" />)}
                      {m.tipo === 'video' && <Play className="absolute bottom-1 left-1 h-4 w-4 fill-white text-white drop-shadow" />}
                      {m.tipo === 'gif' && <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[9px] font-bold text-white">GIF</span>}
                    </button>
                  )
                })}
              </div>
            )
          ) : aba === 'docs' ? (
            docs.length === 0 ? <Vazio texto="Nenhum documento." /> : docs.map((m) => (
              <button key={m.id} type="button" onClick={() => abrirDoc(m)} className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50">
                <FileText className="h-8 w-8 shrink-0 text-red-500" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-gray-800">{m.midia_nome || 'Documento'}</p>
                  <p className="text-[12px] text-gray-500">{rotuloDia(m.enviada_em)} · {horaCurta(m.enviada_em)}</p>
                </div>
              </button>
            ))
          ) : (
            links.length === 0 ? <Vazio texto="Nenhum link." /> : links.map(({ href, m }, n) => (
              <a key={`${m.id}-${n}`} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 hover:bg-gray-50">
                <Link2 className="h-6 w-6 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-[#027EB5]">{href}</p>
                  <p className="text-[12px] text-gray-500">{rotuloDia(m.enviada_em)} · {horaCurta(m.enviada_em)}</p>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
      {galeria !== null && <Galeria itens={itens} inicial={galeria} aoFechar={() => setGaleria(null)} />}
      {pdf && <LeitorPdf url={pdf.url} nome={pdf.nome} aoFechar={() => setPdf(null)} />}
    </div>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <p className="px-4 py-8 text-center text-[13px] text-gray-500">{texto}</p>
}

// ── Pesquisar na conversa ──────────────────────────────────────────────────

/** Um resultado de pesquisa (painel da conversa e seção "Mensagens" da lista). */
export function ItemResultado({ m, termo, autor, aoEscolher }: {
  m: ResultadoBusca | MensagemWa
  termo: string
  /** Quem mandou / em qual conversa (texto de cima). */
  autor: string
  aoEscolher: () => void
}) {
  return (
    <button type="button" onClick={aoEscolher} className="block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50">
      <p className="truncate text-[12px] text-gray-500">{rotuloDia(m.enviada_em)} · {horaCurta(m.enviada_em)} · {autor}</p>
      <p className="line-clamp-2 text-[14px] text-gray-800">
        {/* O trecho em volta da palavra encontrada, não o começo da mensagem. */}
        {m.texto
          ? <TextoWhatsapp texto={trechoComTermo(m.texto, termo)} destaque={termo} />
          : m.transcricao ? <>🎤 <TextoWhatsapp texto={trechoComTermo(m.transcricao, termo)} destaque={termo} /></> : previaMensagem(m)}
      </p>
    </button>
  )
}

export function SecaoResultados({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <>
      <p className="sticky top-0 z-10 bg-white px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide" style={{ color: WA.TEAL }}>{titulo}</p>
      {children}
    </>
  )
}

export function PainelPesquisa({ restauranteId, chatId, nome, aoFechar, aoEscolher }: {
  restauranteId: number
  chatId: string
  nome: string
  aoFechar: () => void
  aoEscolher: (messageId: string) => void
}) {
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[] | null>(null)
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    const t = termo.trim()
    if (t.length < 2) { setResultados(null); return }
    setBuscando(true)
    let ativo = true
    const espera = setTimeout(() => {
      pesquisarMensagens(restauranteId, t, chatId)
        .then((r) => { if (ativo) setResultados(r) })
        .catch(() => { if (ativo) setResultados([]) })
        .finally(() => { if (ativo) setBuscando(false) })
    }, 300)
    return () => { ativo = false; clearTimeout(espera) }
  }, [termo, restauranteId, chatId])

  const exatos = (resultados ?? []).filter((r) => r.relevancia === 1)
  const parecidos = (resultados ?? []).filter((r) => r.relevancia !== 1)
  const autor = (m: MensagemWa) => (m.de_mim ? 'Você' : m.grupo ? (m.remetente || formatarTelefone(m.telefone)) : nome)

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <Cabecalho titulo="Pesquisar mensagens" aoFechar={aoFechar} />
      <div className="px-3 py-2">
        <label className="flex items-center gap-2 rounded-lg bg-[#F0F2F5] px-3 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-gray-500" />
          <input autoFocus value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Pesquisar…"
            className="min-w-0 flex-1 bg-transparent text-[14px] focus:outline-none" aria-label="Texto para pesquisar" />
          {buscando && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </label>
      </div>
      <div className="sem-barra min-h-0 flex-1 overflow-y-auto">
        {resultados === null ? (
          <p className="px-6 py-8 text-center text-[13px] text-gray-500">Pesquise mensagens, legendas, transcrições de áudio e nomes de arquivo com {nome}. Primeiro vem o que está escrito exatamente igual; depois, o parecido.</p>
        ) : resultados.length === 0 && !buscando ? (
          <p className="px-6 py-8 text-center text-[13px] text-gray-500">Nenhuma mensagem encontrada.</p>
        ) : (
          <>
            {exatos.length > 0 && (
              <SecaoResultados titulo="Exatamente como escrito">
                {exatos.map((m) => <ItemResultado key={m.id} m={m} termo={termo} autor={autor(m)} aoEscolher={() => aoEscolher(m.message_id)} />)}
              </SecaoResultados>
            )}
            {parecidos.length > 0 && (
              <SecaoResultados titulo="Parecidos">
                {parecidos.map((m) => <ItemResultado key={m.id} m={m} termo={termo} autor={autor(m)} aoEscolher={() => aoEscolher(m.message_id)} />)}
              </SecaoResultados>
            )}
          </>
        )}
      </div>
    </div>
  )
}
