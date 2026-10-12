import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, Copy, ExternalLink, List, Phone, Reply } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  foiEscolhido, linkSeguro, telefoneParaLigar,
  type BotaoWa, type EscolhaWa, type InterativoWa,
} from '@/lib/whatsapp/formatacao'
import { TextoWhatsapp } from '../pecas'

/* Mensagem com botões ou com menu de lista, desenhada como no WhatsApp: o
   texto no balão e os botões embaixo, um por linha.

   A tela só MOSTRA: botão de resposta e item de lista não dá para tocar daqui
   (a resposta precisa sair do WhatsApp de quem recebeu). Quando a resposta já
   chegou, a opção escolhida fica marcada. Botão de link, de ligar e de copiar
   funciona, porque não manda nada para ninguém. */

/** A cor dos botões no WhatsApp. */
const COR = '#008069'
const LINHA = 'flex w-full items-center justify-center gap-1.5 px-3 py-2 text-center text-[14px] font-medium leading-[19px]'

const ICONE = { resposta: Reply, link: ExternalLink, ligar: Phone, copiar: Copy, outro: Reply } as const

function Botao({ b, escolhido }: { b: BotaoWa; escolhido: boolean }) {
  const Icone = ICONE[b.tipo] ?? Reply
  const miolo = (
    <>
      <Icone className="h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{b.texto}</span>
      {escolhido && <Check className="h-4 w-4 shrink-0" aria-label="Opção escolhida" />}
    </>
  )
  const link = b.tipo === 'link' ? linkSeguro(b.valor) : null
  if (link) {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={cn(LINHA, 'hover:bg-black/[0.04]')} style={{ color: COR }}>
        {miolo}
      </a>
    )
  }
  const tel = b.tipo === 'ligar' ? telefoneParaLigar(b.valor) : null
  if (tel) {
    return (
      <a href={`tel:${tel}`} onClick={(e) => e.stopPropagation()} className={cn(LINHA, 'hover:bg-black/[0.04]')} style={{ color: COR }}>
        {miolo}
      </a>
    )
  }
  if (b.tipo === 'copiar' && b.valor) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(b.valor!) }} className={cn(LINHA, 'hover:bg-black/[0.04]')} style={{ color: COR }}>
        {miolo}
      </button>
    )
  }
  return (
    <div
      className={cn(LINHA, escolhido && 'font-semibold')}
      style={{ color: COR, background: escolhido ? 'rgba(0,128,105,0.10)' : undefined }}
      title={escolhido ? 'Foi a opção escolhida' : 'Botão de resposta: só dá para tocar pelo WhatsApp'}
    >
      {miolo}
    </div>
  )
}

function Lista({ i, escolhida }: { i: Extract<InterativoWa, { tipo: 'lista' }>; escolhida?: EscolhaWa | null }) {
  // Já abre quando a resposta chegou: dá para ver o que foi escolhido sem clicar.
  const [aberta, setAberta] = useState(!!escolhida)
  const secoes = i.secoes ?? []
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setAberta((a) => !a) }}
        aria-expanded={aberta}
        className={cn(LINHA, 'hover:bg-black/[0.04]')}
        style={{ color: COR }}
      >
        <List className="h-4 w-4 shrink-0" />
        <span className="min-w-0 break-words">{i.botao_lista || 'Ver opções'}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', aberta && 'rotate-180')} />
      </button>
      {aberta && (
        <div className="border-t border-black/10 px-2 pb-1.5 pt-1">
          {secoes.map((s, n) => (
            <div key={n} className={cn(n > 0 && 'mt-1.5')}>
              {s.titulo && <p className="px-1 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{s.titulo}</p>}
              {(s.itens ?? []).map((item, k) => {
                const marcado = foiEscolhido({ id: item.id, texto: item.titulo }, escolhida)
                return (
                  <div
                    key={`${item.id ?? item.titulo}-${k}`}
                    className={cn('flex items-start gap-2 rounded-md px-1.5 py-1', marcado && 'bg-[rgba(0,128,105,0.10)]')}
                    title={marcado ? 'Foi a opção escolhida' : undefined}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn('block break-words text-[13.5px] leading-[18px] text-[#111b21]', marcado && 'font-semibold')}>{item.titulo}</span>
                      {item.descricao && <span className="block break-words text-[12px] leading-[16px] text-gray-500">{item.descricao}</span>}
                    </span>
                    {marcado && <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: COR }} aria-label="Opção escolhida" />}
                  </div>
                )
              })}
            </div>
          ))}
          {secoes.every((s) => (s.itens ?? []).length === 0) && <p className="px-1 py-1 text-[12px] text-gray-500">Sem opções.</p>}
        </div>
      )}
    </>
  )
}

export function MensagemInterativa({ i, escolhida, destaque, meta }: {
  i: Exclude<InterativoWa, { tipo: 'escolha' }>
  /** A resposta que chegou a esta mensagem, se chegou. */
  escolhida?: EscolhaWa | null
  destaque?: string
  /** Horário e tiques, no canto do texto. */
  meta: ReactNode
}) {
  const botoes = i.tipo === 'botoes' ? (i.botoes ?? []) : []
  return (
    <div className="min-w-[min(250px,68vw)]">
      {i.titulo && <p className="break-words text-[14.2px] font-semibold leading-[19px] text-[#111b21]">{i.titulo}</p>}
      {i.corpo && <TextoWhatsapp texto={i.corpo} destaque={destaque} className="text-[14.2px] leading-[19px] text-[#111b21]" />}
      <div className="mt-0.5 flex items-end justify-between gap-3">
        <span className="min-w-0 break-words text-[12.5px] leading-[16px] text-gray-500">{i.rodape}</span>
        <span className="shrink-0 pb-px">{meta}</span>
      </div>

      {/* Os botões ocupam a largura do balão, encostados nas bordas, como no WhatsApp. */}
      {(i.tipo === 'lista' || botoes.length > 0) && (
        <div className="-mx-2 -mb-1.5 mt-1.5 divide-y divide-black/10 overflow-hidden rounded-b-lg border-t border-black/10">
          {i.tipo === 'lista'
            ? <Lista i={i} escolhida={escolhida} />
            : botoes.map((b, n) => <Botao key={`${b.id ?? b.texto}-${n}`} b={b} escolhido={b.tipo === 'resposta' && foiEscolhido(b, escolhida)} />)}
        </div>
      )}
    </div>
  )
}
