import { Fragment, useEffect, useState } from 'react'
import { Clock, Mic, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { corAvatar, destaqueParaTexto, iniciais, trechosFormatados } from '@/lib/whatsapp/formatacao'

/** Cores do chat — as mesmas do chat de suporte (Sugestoes.tsx / Admin.tsx). */
export const WA = {
  TEAL: '#128C7E',
  TEAL_ESCURO: '#075E54',
  VERDE: '#25D366',
  FUNDO: '#ECE5DD',
  ENVIADA: '#DCF8C6',
  BARRA: '#F0F2F5',
  AZUL_LIDO: '#34B7F1',
  CINZA_TIQUE: '#8696a0',
}

// ── Tiques ─────────────────────────────────────────────────────────────────

/** SENT ✓ · DELIVERED ✓✓ · READ ✓✓ azul · PLAYED ✓✓ azul (áudio ouvido). */
export function Tiques({ status, className, claro = false }: { status: string | null; className?: string; claro?: boolean }) {
  if (status === 'DELETED') return null
  if (!status || status === 'PENDING') {
    return <Clock className={cn('inline h-3 w-3', claro ? 'text-white/80' : 'text-gray-400', className)} aria-label="Enviando" />
  }
  const lido = status === 'READ' || status === 'PLAYED'
  const cor = lido ? WA.AZUL_LIDO : claro ? 'rgba(255,255,255,0.85)' : WA.CINZA_TIQUE
  const duplo = status !== 'SENT'
  const rotulo = status === 'SENT' ? 'Enviada' : status === 'DELIVERED' ? 'Entregue' : status === 'PLAYED' ? 'Ouvida' : 'Lida'
  return (
    <svg
      width={duplo ? 16 : 12}
      height={10}
      viewBox={duplo ? '0 0 16 10' : '0 0 11 10'}
      fill="none"
      className={cn('inline-block shrink-0 align-middle', className)}
      role="img"
      aria-label={rotulo}
    >
      <path d="M0.5 5 L2.5 7 L7.5 2" stroke={cor} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      {duplo && <path d="M5 5 L7 7 L12 2" stroke={cor} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

export function MicOuvido({ ouvido }: { ouvido: boolean }) {
  return <Mic className="h-3.5 w-3.5" style={{ color: ouvido ? WA.AZUL_LIDO : WA.CINZA_TIQUE }} />
}

// ── Avatar ─────────────────────────────────────────────────────────────────

export function Avatar({ nome, grupo, foto, tamanho = 44, className }: {
  nome: string | null
  grupo?: boolean
  /** Foto do WhatsApp; se não abrir (o link expira), ficam as iniciais. */
  foto?: string | null
  tamanho?: number
  className?: string
}) {
  const [falhou, setFalhou] = useState(false)
  useEffect(() => { setFalhou(false) }, [foto])
  if (foto && !falhou) {
    return (
      <img
        src={foto}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFalhou(true)}
        className={cn('shrink-0 rounded-full bg-gray-200 object-cover', className)}
        style={{ width: tamanho, height: tamanho }}
      />
    )
  }
  return (
    <div
      className={cn('shrink-0 rounded-full flex items-center justify-center text-white font-semibold select-none', className)}
      style={{ width: tamanho, height: tamanho, background: grupo ? '#B7C3CB' : corAvatar(nome), fontSize: tamanho * 0.36 }}
      aria-hidden="true"
    >
      {grupo ? <Users style={{ width: tamanho * 0.5, height: tamanho * 0.5 }} /> : iniciais(nome)}
    </div>
  )
}

// ── Texto com a formatação do WhatsApp ─────────────────────────────────────

const LIMITE_LER_MAIS = 900

/** *negrito*, _itálico_, ~riscado~, `mono`, ```bloco``` e links — e "Ler mais" em texto longo. */
export function TextoWhatsapp({ texto, destaque, className }: { texto: string; destaque?: string; className?: string }) {
  const [inteiro, setInteiro] = useState(false)
  // Palavra pesquisada depois do corte do "Ler mais": mostra o texto todo,
  // senão a marcação ficaria escondida.
  const re = destaque ? destaqueParaTexto(destaque, texto) : null
  const posicao = re ? texto.search(re) : -1
  const longo = texto.length > LIMITE_LER_MAIS && !(posicao >= LIMITE_LER_MAIS * 0.8)
  const mostrado = longo && !inteiro ? cortarEmPalavra(texto, LIMITE_LER_MAIS) : texto
  const marcar = (t: string) => marcarCom(t, re)
  return (
    <span className={cn('whitespace-pre-wrap break-words', className)}>
      {trechosFormatados(mostrado).map((tr, i) => {
        switch (tr.t) {
          case 'negrito': return <strong key={i} className="font-semibold">{marcar(tr.v)}</strong>
          case 'italico': return <em key={i}>{marcar(tr.v)}</em>
          case 'riscado': return <s key={i}>{marcar(tr.v)}</s>
          case 'mono': return <code key={i} className="rounded bg-black/[0.06] px-1 font-mono text-[0.92em]">{tr.v}</code>
          case 'bloco': return <code key={i} className="block my-1 rounded bg-black/[0.06] px-2 py-1 font-mono text-[0.9em] whitespace-pre-wrap">{tr.v}</code>
          case 'link':
            return (
              <a key={i} href={tr.href} target="_blank" rel="noopener noreferrer"
                className="text-[#027EB5] underline break-all hover:text-[#02639a]"
                onClick={(e) => e.stopPropagation()}>
                {tr.v}
              </a>
            )
          default: return <Fragment key={i}>{marcar(tr.v)}</Fragment>
        }
      })}
      {longo && !inteiro && (
        <>
          {'… '}
          <button type="button" className="font-medium text-[#027EB5] hover:underline" onClick={(e) => { e.stopPropagation(); setInteiro(true) }}>
            Ler mais
          </button>
        </>
      )}
    </span>
  )
}

function cortarEmPalavra(t: string, n: number): string {
  const corte = t.slice(0, n)
  const espaco = corte.lastIndexOf(' ')
  return espaco > n * 0.8 ? corte.slice(0, espaco) : corte
}

/**
 * Realça o termo pesquisado (sem diferenciar acento, maiúscula e pontuação)
 * ou, num resultado "parecido", as palavras parecidas — o mesmo amarelo nos
 * resultados da pesquisa e na mensagem aberta.
 */
function marcarCom(texto: string, re: RegExp | null) {
  if (!re) return texto
  re.lastIndex = 0
  return texto.split(re).map((p, i) => (i % 2 === 1 ? <mark key={i} className="bg-yellow-200 rounded-sm">{p}</mark> : p))
}

/** Texto simples (nome de arquivo, transcrição) com o mesmo realce. */
export function Realce({ texto, termo }: { texto: string; termo?: string }) {
  return <>{marcarCom(texto, termo ? destaqueParaTexto(termo, texto) : null)}</>
}

// ── Separador de dia ───────────────────────────────────────────────────────

export function SeparadorDia({ rotulo }: { rotulo: string }) {
  return (
    <div className="sticky top-2 z-10 flex justify-center py-2 pointer-events-none">
      <span className="rounded-lg bg-white/95 px-3 py-1 text-[12px] font-medium text-gray-600 shadow-sm">{rotulo}</span>
    </div>
  )
}
