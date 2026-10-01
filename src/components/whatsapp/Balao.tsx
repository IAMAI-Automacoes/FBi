import { memo } from 'react'
import { Ban, Bot, ChevronDown, Copy, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  corRemetente, formatarTelefone, horaCurta, linksDoTexto, previaMensagem, soEmoji,
  type MensagemWa, type ReacaoVisivel,
} from '@/lib/whatsapp/formatacao'
import { urlParaBaixar } from '@/lib/queries/whatsapp'
import { TextoWhatsapp, Tiques, WA } from './pecas'
import { PlayerAudio, Transcricao } from './midia/PlayerAudio'
import { PreviaLinkCartao } from './midia/PreviaLink'
import {
  CartaoConteudo, CartaoDocumento, Figurinha, MidiaGif, MidiaImagem, MidiaIndisponivel, MidiaVideo, NaoSuportada,
} from './midia/Midias'

export interface PropsBalao {
  m: MensagemWa
  /** Primeira de uma sequência do mesmo autor: leva o "rabinho" e, em grupo, o nome. */
  primeiroDoGrupo: boolean
  nomeContato: string
  /** Foto do contato (conversa individual): vai no player de áudio. */
  fotoContato?: string | null
  /** URL assinada da mídia ('' = sem arquivo). */
  url: string
  /** undefined = não é resposta; null = a mensagem citada não está no histórico. */
  citada: MensagemWa | null | undefined
  reacoes: ReacaoVisivel[]
  destaque?: string
  piscando?: boolean
  autoTocar?: boolean
  aoAbrirMidia: (id: number) => void
  aoAbrirPdf: (m: MensagemWa) => void
  aoIrParaCitada: (messageId: string) => void
  aoTerminarAudio: (id: number) => void
}

function autorDe(m: MensagemWa, nomeContato: string): string {
  if (m.de_mim) return m.por_api ? 'EasyFeed (automática)' : 'Você'
  if (m.grupo) return m.remetente || formatarTelefone(m.telefone) || 'Participante'
  return nomeContato
}

/** Largura que o horário ocupa no canto: o texto quebra antes dela. */
function larguraMeta(m: MensagemWa): number {
  return 42 + (m.de_mim ? 20 : 0) + (m.editada_em ? 48 : 0)
}

/** Horário + "Editada" + tiques, no canto do balão. */
function Meta({ m, sobreMidia = false }: { m: MensagemWa; sobreMidia?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap text-[11px] leading-none select-none',
      sobreMidia ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]' : 'text-gray-500',
    )}>
      {m.editada_em && <span className="italic">Editada</span>}
      {horaCurta(m.enviada_em)}
      {m.de_mim && <Tiques status={m.status} claro={sobreMidia} />}
    </span>
  )
}

function Citacao({ citada, nomeContato, aoIr }: { citada: MensagemWa | null; nomeContato: string; aoIr: (id: string) => void }) {
  if (citada === null) {
    return (
      <div className="mb-1 rounded-md border-l-4 border-gray-400 bg-black/[0.05] px-2 py-1 text-[12px] italic text-gray-500">
        Mensagem não disponível
      </div>
    )
  }
  const autor = autorDe(citada, nomeContato)
  const cor = citada.de_mim ? WA.TEAL : citada.grupo ? corRemetente(citada.remetente ?? citada.telefone) : '#6B4FBB'
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); aoIr(citada.message_id) }}
      className="mb-1 flex w-full min-w-0 overflow-hidden rounded-md bg-black/[0.05] text-left hover:bg-black/[0.08]"
    >
      <span className="w-1 shrink-0" style={{ background: cor }} />
      <span className="min-w-0 px-2 py-1">
        <span className="block truncate text-[12px] font-semibold" style={{ color: cor }}>{autor}</span>
        <span className="block truncate text-[12px] text-gray-600">{previaMensagem(citada)}</span>
      </span>
    </button>
  )
}

function Reacoes({ reacoes, deMim }: { reacoes: ReacaoVisivel[]; deMim: boolean }) {
  const porEmoji = new Map<string, ReacaoVisivel[]>()
  for (const r of reacoes) porEmoji.set(r.emoji, [...(porEmoji.get(r.emoji) ?? []), r])
  const titulo = reacoes.map((r) => `${r.de_mim ? 'Você' : r.nome || 'Contato'}: ${r.emoji}`).join('\n')
  return (
    <div
      className={cn('absolute -bottom-3.5 flex items-center gap-0.5 rounded-full border border-white bg-white px-1.5 py-0.5 shadow-sm', deMim ? 'right-2' : 'left-2')}
      title={titulo}
    >
      {Array.from(porEmoji, ([emoji, lista]) => (
        <span key={emoji} className="text-[14px] leading-none">
          {emoji}{lista.length > 1 && <span className="ml-0.5 text-[11px] text-gray-500">{lista.length}</span>}
        </span>
      ))}
    </div>
  )
}

function MenuMensagem({ m }: { m: MensagemWa }) {
  const temTexto = !!(m.texto || m.transcricao)
  const temArquivo = !!m.midia_caminho
  if (!temTexto && !temArquivo) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-inherit text-gray-500 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        aria-label="Opções da mensagem"
        onClick={(e) => e.stopPropagation()}
      >
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {temTexto && (
          <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(m.texto || m.transcricao || '')}>
            <Copy className="mr-2 h-4 w-4" /> Copiar {m.texto ? 'texto' : 'transcrição'}
          </DropdownMenuItem>
        )}
        {temArquivo && (
          <DropdownMenuItem onClick={async () => {
            const link = await urlParaBaixar(m.midia_caminho!, m.midia_nome)
            if (link) window.location.href = link
          }}>
            <Download className="mr-2 h-4 w-4" /> Baixar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BalaoBase({
  m, primeiroDoGrupo, nomeContato, fotoContato, url, citada, reacoes, destaque, piscando, autoTocar,
  aoAbrirMidia, aoAbrirPdf, aoIrParaCitada, aoTerminarAudio,
}: PropsBalao) {
  const deMim = m.de_mim
  const apagada = m.status === 'DELETED'
  const emojis = !apagada && m.tipo === 'text' && !citada ? soEmoji(m.texto) : 0
  const semBalao = !apagada && (m.tipo === 'sticker' || emojis > 0)
  const ehMidiaVisual = !apagada && ['image', 'video', 'gif'].includes(m.tipo)
  const legenda = ehMidiaVisual ? m.texto : null
  const mostrarRemetente = !deMim && m.grupo && primeiroDoGrupo
  const corNome = corRemetente(m.remetente ?? m.telefone)

  let corpo: React.ReactNode
  if (apagada) {
    corpo = (
      <p className="flex items-center gap-1.5 pr-14 text-[14px] italic text-gray-500">
        <Ban className="h-4 w-4 shrink-0" />
        {deMim ? 'Você apagou esta mensagem' : 'Esta mensagem foi apagada'}
      </p>
    )
  } else if (emojis > 0) {
    corpo = <p className="leading-tight" style={{ fontSize: emojis === 1 ? 52 : emojis === 2 ? 42 : 34 }}>{m.texto}</p>
  } else {
    switch (m.tipo) {
      case 'image':
        corpo = url ? <MidiaImagem url={url} aoAbrir={() => aoAbrirMidia(m.id)} /> : <MidiaIndisponivel />
        break
      case 'video':
        corpo = url ? <MidiaVideo url={url} aoAbrir={() => aoAbrirMidia(m.id)} /> : <MidiaIndisponivel />
        break
      case 'gif':
        corpo = url ? <MidiaGif url={url} aoAbrir={() => aoAbrirMidia(m.id)} /> : <MidiaIndisponivel />
        break
      case 'sticker':
        corpo = url ? <Figurinha url={url} /> : <MidiaIndisponivel rotulo="Figurinha indisponível" />
        break
      case 'audio':
        corpo = (
          <>
            {url
              ? <PlayerAudio url={url} caminho={m.midia_caminho!} deMim={deMim} ouvido={m.status === 'PLAYED'}
                  nomeContato={autorDe(m, nomeContato)} fotoContato={m.grupo ? null : fotoContato} autoTocar={autoTocar} aoTerminar={() => aoTerminarAudio(m.id)} />
              : <MidiaIndisponivel rotulo="Áudio indisponível" />}
            {m.transcricao && <Transcricao texto={m.transcricao} deMim={deMim} />}
          </>
        )
        break
      case 'document':
        corpo = url
          ? <CartaoDocumento url={url} caminho={m.midia_caminho!} nome={m.midia_nome} mime={m.midia_mime} deMim={deMim} aoAbrirPdf={() => aoAbrirPdf(m)} />
          : <MidiaIndisponivel rotulo={m.midia_nome ? `${m.midia_nome} indisponível` : 'Documento indisponível'} />
        break
      case 'location':
      case 'contact':
        corpo = <CartaoConteudo id={m.id} tipo={m.tipo} />
        break
      case 'text': {
        // Prévia do primeiro link em cima do texto, como no WhatsApp.
        const link = linksDoTexto(m.texto)[0]
        corpo = m.texto
          ? (
            <>
              {link && <PreviaLinkCartao url={link} idMensagem={m.id} deMim={deMim} />}
              <TextoWhatsapp texto={m.texto} destaque={destaque} className="text-[14.2px] leading-[19px] text-[#111b21]" />
            </>
          )
          : <NaoSuportada />
        break
      }
      default:
        corpo = m.texto ? <TextoWhatsapp texto={m.texto} destaque={destaque} className="text-[14.2px] text-[#111b21]" /> : <NaoSuportada />
    }
  }

  // Onde fica o horário: por cima da foto (sem legenda), logo abaixo da mídia,
  // ou flutuando no fim do texto (o espaçador reserva o lugar dele).
  const metaSobreMidia = ehMidiaVisual && !legenda && !!url
  const metaNoTexto = !semBalao && !ehMidiaVisual && (m.tipo === 'text' || apagada || !['audio', 'document', 'location', 'contact'].includes(m.tipo))

  return (
    <div
      data-message-id={m.message_id}
      className={cn('flex px-[3%] md:px-[6%]', deMim ? 'justify-end' : 'justify-start', primeiroDoGrupo ? 'mt-2' : 'mt-0.5', reacoes.length > 0 && 'mb-3.5')}
    >
      <div
        className={cn(
          'group relative max-w-[85%] md:max-w-[65%] transition-shadow duration-500',
          !semBalao && 'rounded-lg shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
          !semBalao && (ehMidiaVisual || m.tipo === 'document' ? 'p-1' : 'px-2 pb-1.5 pt-1.5'),
          !semBalao && primeiroDoGrupo && (deMim ? 'rounded-tr-none' : 'rounded-tl-none'),
          piscando && 'ring-4 ring-[#25D366]/50',
        )}
        style={semBalao ? undefined : { background: deMim ? WA.ENVIADA : '#FFFFFF' }}
      >
        {/* Rabinho do balão, só na primeira mensagem da sequência */}
        {!semBalao && primeiroDoGrupo && (
          <span
            aria-hidden="true"
            className={cn('absolute top-0 h-3 w-2', deMim ? '-right-2' : '-left-2')}
            style={{
              background: deMim ? WA.ENVIADA : '#FFFFFF',
              clipPath: deMim ? 'polygon(0 0, 100% 0, 0 100%)' : 'polygon(0 0, 100% 0, 100% 100%)',
            }}
          />
        )}

        {!semBalao && !apagada && <MenuMensagem m={m} />}

        {mostrarRemetente && (
          <p className={cn('truncate text-[12.8px] font-semibold', (ehMidiaVisual || m.tipo === 'document') && 'px-1 pt-0.5')} style={{ color: corNome }}>
            {m.remetente || formatarTelefone(m.telefone)}
            {m.remetente && m.telefone && <span className="ml-1.5 font-normal text-gray-400">{formatarTelefone(m.telefone)}</span>}
          </p>
        )}

        {deMim && m.por_api && primeiroDoGrupo && !apagada && (
          <p className={cn('mb-0.5 flex items-center gap-1 text-[11px] font-semibold', (ehMidiaVisual || m.tipo === 'document') && 'px-1 pt-0.5')} style={{ color: WA.TEAL }}>
            <Bot className="h-3.5 w-3.5" /> Resposta automática do EasyFeed
          </p>
        )}

        {citada !== undefined && !apagada && (
          <div className={cn((ehMidiaVisual || m.tipo === 'document') && 'px-0.5 pt-0.5')}>
            <Citacao citada={citada} nomeContato={nomeContato} aoIr={aoIrParaCitada} />
          </div>
        )}

        <div className="relative">
          {corpo}
          {metaNoTexto && (
            <>
              {/* Espaçador invisível do tamanho do horário: o texto quebra antes dele. */}
              <span aria-hidden="true" className="invisible inline-block" style={{ width: larguraMeta(m) }} />
              <span className="absolute bottom-[-3px] right-0"><Meta m={m} /></span>
            </>
          )}
          {metaSobreMidia && (
            <span className="pointer-events-none absolute bottom-1 right-1.5 rounded px-1 pb-0.5" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.35))' }}>
              <Meta m={m} sobreMidia />
            </span>
          )}
        </div>

        {legenda && (
          <div className="relative px-1 pb-0.5 pt-1">
            <TextoWhatsapp texto={legenda} destaque={destaque} className="text-[14.2px] leading-[19px] text-[#111b21]" />
            <span aria-hidden="true" className="invisible inline-block" style={{ width: larguraMeta(m) }} />
            <span className="absolute bottom-0 right-1"><Meta m={m} /></span>
          </div>
        )}

        {!semBalao && !metaNoTexto && !metaSobreMidia && !legenda && (
          <div className="flex justify-end px-1 pt-0.5"><Meta m={m} /></div>
        )}

        {semBalao && (
          <div className={cn('mt-0.5 flex', deMim ? 'justify-end' : 'justify-start')}>
            <span className="rounded-full bg-white/80 px-1.5 py-0.5"><Meta m={m} /></span>
          </div>
        )}

        {reacoes.length > 0 && <Reacoes reacoes={reacoes} deMim={deMim} />}
      </div>
    </div>
  )
}

export const Balao = memo(BalaoBase)
