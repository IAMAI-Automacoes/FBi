import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Check, Clapperboard, Copy, ExternalLink, Link2, Loader2, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { linkDeIndicacao } from '@/lib/indicacoes'
import { COR_VIDEO, DIAS_DA_JANELA, redeDoVideo, ROTULO_VIDEO, textoDaComissao, urlDoVideo, videosNaJanela } from '@/lib/influenciadores'
import { buscarMeuLink, registrarVideo, removerVideo, type MeuLink } from './dados'

/* O topo do painel do influenciador (pedido do Raver, 21/10/2026): o link de
   criação de conta dele para copiar, quanto ele ganha, os números do link e
   os vídeos que ele postou (o combinado é postar vendendo o EasyFeed com o
   link; a equipe confere cada vídeo). */

/** O endereço público do site: é para lá que o link aponta. */
function siteDoEasyFeed(): string {
  return ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '') || window.location.origin
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-xl bg-muted/50 px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums text-foreground">{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  )
}

export function SeuLink() {
  const [dados, setDados] = useState<MeuLink | null>(null)
  const [erro, setErro] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [url, setUrl] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [tirando, setTirando] = useState<string | null>(null)

  const carregar = useCallback(() => {
    buscarMeuLink().then((d) => { setDados(d); setErro(false) }).catch(() => setErro(true))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  if (erro) return null
  if (!dados) return <Skeleton className="h-56 w-full rounded-xl" />

  const link = dados.codigo ? linkDeIndicacao(siteDoEasyFeed(), dados.codigo) : ''
  const naJanela = videosNaJanela(dados.videos)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sem permissão de copiar */ }
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const limpo = urlDoVideo(url)
    if (!limpo) return setAviso('Confira o link: copie o endereço do vídeo no app e cole aqui.')
    setEnviando(true)
    setAviso(null)
    const problema = await registrarVideo(limpo)
    setEnviando(false)
    if (problema) return setAviso(problema)
    setUrl('')
    carregar()
  }

  const tirar = async (id: string) => {
    setTirando(id)
    try {
      await removerVideo(id)
      carregar()
    } catch {
      setAviso('Não foi possível tirar agora. Tente de novo.')
    } finally {
      setTirando(null)
    }
  }

  return (
    <Card className="shadow-subtle">
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b border-border p-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1D4ED8]">
          <Link2 className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <CardTitle className="text-base font-semibold">Seu link de indicação</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Quem criar a conta do EasyFeed por ele fica ligado a você.</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-5 pt-5">
        {!dados.codigo ? (
          <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">Seu link ainda não está pronto. Fale com a nossa equipe.</p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex h-11 min-w-0 items-center rounded-xl border border-border bg-muted/30 px-3 sm:flex-1">
                <span className="truncate text-sm text-foreground" title={link}>{link}</span>
              </div>
              <button
                onClick={copiar}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1E40AF]"
              >
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiado ? 'Link copiado' : 'Copiar link'}
              </button>
            </div>
            {dados.comissaoPct != null && dados.comissaoMeses != null && dados.comissaoPct > 0 && (
              <p className="text-sm text-muted-foreground">
                Quem assinar pelo seu link rende a você <b className="font-semibold text-foreground">{textoDaComissao(dados.comissaoPct, dados.comissaoMeses)}</b>.
                A conta é sobre o valor líquido (sem taxas e custos) e acaba se a pessoa cancelar.
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Numero rotulo={`Visitas no link (${DIAS_DA_JANELA} dias)`} valor={dados.visitas30} />
              <Numero rotulo="Criaram conta" valor={dados.contas} />
              <Numero rotulo="Assinando hoje" valor={dados.assinando} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clapperboard className="h-4 w-4 text-muted-foreground" /> Seus vídeos sobre o EasyFeed
            </p>
            {dados.videosPorMes > 0 && (
              <p className={cn('text-xs font-medium', naJanela >= dados.videosPorMes ? 'text-emerald-700' : 'text-muted-foreground')}>
                {naJanela} de {dados.videosPorMes} nos últimos {DIAS_DA_JANELA} dias
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {dados.videosPorMes > 0
              ? `O combinado é ${dados.videosPorMes === 1 ? '1 vídeo' : `${dados.videosPorMes} vídeos`} por mês vendendo o EasyFeed, com o seu link. `
              : 'Poste vídeos vendendo o EasyFeed, com o seu link. '}
            Postou? Cole o link do vídeo aqui para a nossa equipe conferir.
          </p>
          <form onSubmit={enviar} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              onChange={(e) => { setUrl(e.target.value); setAviso(null) }}
              placeholder="Link do vídeo (Instagram, TikTok, YouTube…)"
              inputMode="url"
              disabled={enviando}
              aria-label="Link do vídeo"
              className="h-11 min-w-0 rounded-xl border border-border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-1"
            />
            <button
              type="submit"
              disabled={!url.trim() || enviando}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-white px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Mandar
            </button>
          </form>
          {aviso && <p className="text-xs text-rose-600">{aviso}</p>}
          {dados.videos.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {dados.videos.map((v) => (
                <li key={v.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline">
                      <span className="truncate">{redeDoVideo(v.url) ?? 'Vídeo'} · {format(parseISO(v.criado_em), 'dd/MM/yyyy')}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </a>
                    <p className="truncate text-xs text-muted-foreground">{v.url}</p>
                    {v.situacao === 'recusado' && v.recado && <p className="mt-1 text-xs text-rose-700">{v.recado}</p>}
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', COR_VIDEO[v.situacao])}>{ROTULO_VIDEO[v.situacao]}</span>
                  {v.situacao === 'pendente' && (
                    <button
                      onClick={() => tirar(v.id)}
                      disabled={tirando === v.id}
                      title="Tirar da lista"
                      aria-label="Tirar o vídeo da lista"
                      className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {tirando === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
