import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  listarDocumentos, indexarDocumento, removerDocumento, buscarConteudoDocumento,
  extrairTextoDeUrl, extrairTextoDePdf, DocumentoIA,
} from '@/lib/queries/conhecimento'
import {
  BookOpen, FileText, Link2, Type, Trash2, Loader2, Upload, CheckCircle2, AlertCircle,
  Eye, ExternalLink,
} from 'lucide-react'

export function ConhecimentoTab({ restauranteId }: { restauranteId: number | null }) {
  const { toast } = useToast()
  const [docs, setDocs] = useState<DocumentoIA[]>([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [url, setUrl] = useState('')
  const [tituloTexto, setTituloTexto] = useState('')
  const [texto, setTexto] = useState('')
  // Visualização de um material dentro do sistema
  const [vendo, setVendo] = useState<DocumentoIA | null>(null)
  const [conteudoVisto, setConteudoVisto] = useState<string | null>(null)

  const abrirVisualizacao = async (doc: DocumentoIA) => {
    setVendo(doc)
    setConteudoVisto(null)
    try {
      setConteudoVisto(await buscarConteudoDocumento(doc.id))
    } catch {
      setConteudoVisto('Não foi possível carregar o conteúdo.')
    }
  }

  const carregar = async () => {
    try {
      setDocs(await listarDocumentos())
    } catch {
      /* silencioso */
    }
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [])

  const indexar = async (
    entrada: { titulo: string; texto: string; origem?: string; url?: string },
  ) => {
    if (!restauranteId) return
    setProcessando(true)
    setProgresso({ feito: 0, total: 0 })
    try {
      await indexarDocumento(restauranteId, entrada, (feito, total) => setProgresso({ feito, total }))
      toast({ title: 'Material adicionado', description: 'A IA já pode consultar este conteúdo.' })
      setUrl(''); setTexto(''); setTituloTexto('')
      await carregar()
    } catch (e: any) {
      toast({ title: 'Não foi possível processar', description: e.message, variant: 'destructive' })
    } finally {
      setProcessando(false)
      setProgresso(null)
    }
  }

  const enviarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 20 MB', variant: 'destructive' })
      return
    }
    setProcessando(true)
    try {
      const conteudo = file.type === 'application/pdf'
        ? await extrairTextoDePdf(file)
        : await file.text()
      if (conteudo.trim().length < 200) {
        throw new Error('O arquivo não tem texto suficiente (PDFs de imagem escaneada não funcionam).')
      }
      await indexar({ titulo: file.name, texto: conteudo, origem: 'arquivo' })
    } catch (err: any) {
      toast({ title: 'Erro ao ler o arquivo', description: err.message, variant: 'destructive' })
      setProcessando(false)
    }
  }

  const enviarUrl = async () => {
    if (!url.trim()) return
    setProcessando(true)
    try {
      const r = await extrairTextoDeUrl(url.trim())
      if (!r.ok) throw new Error(r.motivo || 'Página sem texto legível')
      await indexar({ titulo: r.titulo!, texto: r.texto!, origem: 'url', url: url.trim() })
    } catch (err: any) {
      toast({ title: 'Não foi possível ler a página', description: err.message, variant: 'destructive' })
      setProcessando(false)
    }
  }

  const excluir = async (doc: DocumentoIA) => {
    try {
      await removerDocumento(doc.id)
      setDocs((p) => p.filter((d) => d.id !== doc.id))
    } catch {
      toast({ title: 'Erro ao remover', variant: 'destructive' })
    }
  }

  const iconeOrigem = (origem: string) =>
    origem === 'url' ? <Link2 className="h-4 w-4" />
      : origem === 'arquivo' ? <FileText className="h-4 w-4" />
      : <Type className="h-4 w-4" />

  return (
    <Card className="shadow-subtle border-gray-200/75 rounded-xl overflow-hidden">
      <CardHeader className="bg-white pb-6 border-b border-gray-100">
        <CardTitle className="text-xl flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          Base de conhecimento
        </CardTitle>
        <CardDescription className="text-sm mt-1">
          Envie manuais, cartilhas, seu cardápio, procedimentos internos ou links úteis. A IA lê
          esse material e passa a responder com base nele — citando de onde tirou a informação.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-6 sm:p-8 bg-white space-y-8">
        <Tabs defaultValue="arquivo">
          <TabsList>
            <TabsTrigger value="arquivo">Arquivo</TabsTrigger>
            <TabsTrigger value="link">Link</TabsTrigger>
            <TabsTrigger value="texto">Escrever</TabsTrigger>
          </TabsList>

          <TabsContent value="arquivo" className="pt-5">
            <div
              onClick={() => !processando && fileRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <Upload className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Enviar PDF ou arquivo de texto</p>
              <p className="text-xs text-muted-foreground mt-1">
                Até 20 MB. PDFs digitalizados (imagem) não funcionam — o texto precisa ser selecionável.
              </p>
              <input
                ref={fileRef} type="file" className="hidden"
                accept=".pdf,.txt,.md,.csv"
                onChange={enviarArquivo} disabled={processando}
              />
            </div>
          </TabsContent>

          <TabsContent value="link" className="pt-5 space-y-3">
            <Label htmlFor="url-doc">Endereço da página</Label>
            <div className="flex gap-2">
              <Input
                id="url-doc" value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..." disabled={processando}
              />
              <Button onClick={enviarUrl} disabled={processando || !url.trim()}>Adicionar</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Alguns sites do governo bloqueiam leitura automática. Se der erro, baixe o PDF e envie pela aba Arquivo.
            </p>
          </TabsContent>

          <TabsContent value="texto" className="pt-5 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="titulo-doc">Título</Label>
              <Input
                id="titulo-doc" value={tituloTexto} onChange={(e) => setTituloTexto(e.target.value)}
                placeholder="Ex: Procedimento de fechamento do caixa" disabled={processando}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="texto-doc">Conteúdo</Label>
              <Textarea
                id="texto-doc" rows={8} className="resize-none"
                value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Cole ou escreva aqui: cardápio, receitas, regras da casa, treinamento da equipe..."
                disabled={processando}
              />
            </div>
            <Button
              onClick={() => indexar({ titulo: tituloTexto || 'Anotação', texto })}
              disabled={processando || texto.trim().length < 200}
            >
              Adicionar à base
            </Button>
            {texto.trim().length > 0 && texto.trim().length < 200 && (
              <p className="text-xs text-amber-600">Escreva um pouco mais (mínimo ~200 caracteres).</p>
            )}
          </TabsContent>
        </Tabs>

        {processando && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {progresso?.total
                ? `Processando… ${progresso.feito} de ${progresso.total} trechos`
                : 'Lendo o material…'}
            </span>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold mb-3">Materiais cadastrados</h3>
          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum material ainda. Comece enviando a cartilha de boas práticas ou o seu cardápio.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-muted-foreground shrink-0">{iconeOrigem(d.origem)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.titulo}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      {d.status === 'indexado' ? (
                        <><CheckCircle2 className="h-3 w-3 text-emerald-600" />{d.total_trechos} trechos indexados</>
                      ) : d.status === 'erro' ? (
                        <><AlertCircle className="h-3 w-3 text-rose-500" />{d.erro || 'falhou'}</>
                      ) : 'processando…'}
                      {d.escopo === 'global' && ' · material de referência'}
                    </p>
                  </div>
                  {d.status === 'indexado' && (
                    <Button
                      variant="ghost" size="icon" onClick={() => abrirVisualizacao(d)}
                      title="Visualizar conteúdo"
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  {d.escopo !== 'global' && (
                    <Button
                      variant="ghost" size="icon" onClick={() => excluir(d)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      {/* Visualização do material dentro do sistema */}
      <Dialog open={!!vendo} onOpenChange={(o) => !o && setVendo(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <span className="truncate">{vendo?.titulo}</span>
            </DialogTitle>
          </DialogHeader>
          {vendo?.origem === 'url' && vendo.url && (
            <a
              href={vendo.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir a página original
            </a>
          )}
          <div className="overflow-y-auto sem-barra rounded-lg border bg-muted/30 p-4 mt-1">
            {conteudoVisto === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                {conteudoVisto || 'Sem conteúdo.'}
              </p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground shrink-0">
            Este é o texto que a IA lê. Arquivos são guardados como texto extraído — o arquivo
            original não fica salvo.
          </p>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
