import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { buscarConteudo, buscarPreviaLink, type PreviaLink } from '@/lib/queries/whatsapp'

interface Mostrar {
  titulo: string | null
  descricao: string | null
  imagem: string | null
  /** Miniatura pequena (a do próprio WhatsApp): vai ao lado, não em cima. */
  miniatura: boolean
  site: string | null
}

const limpo = (t: unknown) => (typeof t === 'string' && t.trim() ? t.trim() : null)

/**
 * Prévia do primeiro link da mensagem, como o WhatsApp mostra: imagem,
 * título, descrição e site. Vem da função previa-link (lê as tags da página,
 * como o WhatsApp faz); se o site não tiver prévia, usa a miniatura que o
 * próprio WhatsApp mandou no evento. Só busca quando o balão aparece na tela.
 */
export function PreviaLinkCartao({ url, idMensagem, deMim }: { url: string; idMensagem: number; deMim: boolean }) {
  const caixa = useRef<HTMLAnchorElement>(null)
  const [dados, setDados] = useState<Mostrar | null>(null)
  const [imagemFalhou, setImagemFalhou] = useState(false)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    let ativo = true
    const obs = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      const p: PreviaLink = await buscarPreviaLink(url)
      if (!ativo) return
      if (p.ok) {
        setDados({ titulo: p.titulo, descricao: p.descricao, imagem: p.imagem, miniatura: false, site: p.site })
        return
      }
      // Reserva: o que o WhatsApp mandou (título/descrição às vezes vêm em branco).
      const c = await buscarConteudo(idMensagem).catch(() => null)
      if (!ativo || !c) return
      const thumb = limpo(c.JPEGThumbnail)
      const titulo = limpo(c.title)
      const descricao = limpo(c.description)
      if (thumb || titulo) {
        setDados({
          titulo, descricao,
          imagem: thumb ? `data:image/jpeg;base64,${thumb}` : null,
          miniatura: true,
          site: (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return null } })(),
        })
      }
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => { ativo = false; obs.disconnect() }
  }, [url, idMensagem])

  const temImagem = !!dados?.imagem && !imagemFalhou
  return (
    <a
      ref={caixa}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'mb-1 block w-[min(330px,72vw)] overflow-hidden rounded-md transition-colors',
        dados ? (deMim ? 'bg-[#cfe9ba] hover:bg-[#c5e3ae]' : 'bg-[#f5f6f6] hover:bg-[#eceeee]') : 'h-0',
      )}
      aria-label={dados?.titulo ? `Abrir ${dados.titulo}` : 'Abrir link'}
    >
      {dados && (
        <div className={cn(dados.miniatura && temImagem && 'flex items-stretch')}>
          {temImagem && (
            <img
              src={dados.imagem!}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImagemFalhou(true)}
              className={dados.miniatura ? 'h-[72px] w-[72px] shrink-0 object-cover' : 'max-h-[220px] w-full object-cover'}
            />
          )}
          <div className="min-w-0 px-2.5 py-2">
            {dados.titulo && <p className="line-clamp-2 text-[13.5px] font-medium leading-snug text-[#111b21]">{dados.titulo}</p>}
            {dados.descricao && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-gray-500">{dados.descricao}</p>}
            {dados.site && <p className="mt-0.5 truncate text-[11.5px] lowercase text-gray-400">{dados.site}</p>}
          </div>
        </div>
      )}
    </a>
  )
}
