import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import {
  listarDocumentosGlobais, indexarDocumentoGlobal, removerDocumento,
  buscarConteudoDocumento, extrairTextoDeUrl, extrairTextoDePdf, DocumentoIA,
} from '@/lib/queries/conhecimento'
import {
  Globe, FileText, Link2, Type, Trash2, Loader2, Upload, CheckCircle2, AlertCircle,
  Eye, ExternalLink,
} from 'lucide-react'

/**
 * Base de conhecimento GLOBAL da plataforma. É o material padrão que a IA
 * consulta para TODOS os restaurantes (escopo='global', restaurante_id=null).
 * Só admins da plataforma abrem esta tela; os restaurantes NÃO veem estes
 * documentos nas próprias Configurações.
 */
export function ConhecimentoGlobal() {
  const { confirmar, dialogo } = useConfirmacao()
  const { toast } = useToast()
  const [docs, setDocs] = useState<DocumentoIA[]>([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [url, setUrl] = useState('')
  const [tituloTexto, setTituloTexto] = useState('')
  const [texto, setTexto] = useState('')
  const [vendo, setVendo] = useState<DocumentoIA | null>(null)
  const [conteudoVisto, setConteudoVisto] = useState<string | null>(null)

  const carregar = async () => {
    try {
      setDocs(await listarDocumentosGlobais())
    } catch { /* silencioso */ }
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  const abrirVisualizacao = async (doc: DocumentoIA) => {
    setVendo(doc)
    setConteudoVisto(null)
    try {
      setConteudoVisto(await buscarConteudoDocumento(doc.id))
    } catch {
      setConteudoVisto('Não foi possível carregar o conteúdo.')
    }
  }

  const indexar = async (entrada: { titulo: string; texto: string; origem?: string; url?: string }) => {
    setProcessando(true)
    setProgresso({ feito: 0, total: 0 })
    try {
      await indexarDocumentoGlobal(entrada, (feito, total) => setProgresso({ feito, total }))
      toast({ title: 'Material adicionado', description: 'A IA de todos os restaurantes já pode consultar este conteúdo.' })
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
    const ok = await confirmar({
      titulo: `Remover "${doc.titulo}"?`,
      descricao: 'Afeta a IA de todos os restaurantes.',
      confirmar: 'Remover',
      destrutivo: true,
    })
    if (!ok) return
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
      {dialogo}
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Cabeçalho */}
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#1D4ED8]" />
            <h2 className="text-lg font-semibold text-gray-800">Base de conhecimento global</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Material padrão da plataforma — boas práticas de atendimento, feedback, operação de
            restaurante. A IA de <strong>todos</strong> os restaurantes consulta este conteúdo por
            padrão, e ele <strong>não</strong> aparece nas Configurações de cada cliente.
          </p>
        </div>

        {/* Envio */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <Tabs defaultValue="texto">
            <TabsList>
              <TabsTrigger value="texto">Escrever</TabsTrigger>
              <TabsTrigger value="arquivo">Arquivo</TabsTrigger>
              <TabsTrigger value="link">Link</TabsTrigger>
            </TabsList>

            <TabsContent value="texto" className="pt-5 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="g-titulo">Título</Label>
                <Input
                  id="g-titulo" value={tituloTexto} onChange={(e) => setTituloTexto(e.target.value)}
                  placeholder="Ex: Como responder a uma reclamação de demora" disabled={processando}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-texto">Conteúdo</Label>
                <Textarea
                  id="g-texto" rows={8} className="resize-none"
                  value={texto} onChange={(e) => setTexto(e.target.value)}
                  placeholder="Cole ou escreva o material de referência para a IA…"
                  disabled={processando}
                />
              </div>
              <Button
                onClick={() => indexar({ titulo: tituloTexto || 'Material', texto })}
                disabled={processando || texto.trim().length < 200}
              >
                Adicionar à base global
              </Button>
              {texto.trim().length > 0 && texto.trim().length < 200 && (
                <p className="text-xs text-amber-600">Escreva um pouco mais (mínimo ~200 caracteres).</p>
              )}
            </TabsContent>

            <TabsContent value="arquivo" className="pt-5">
              <div
                onClick={() => !processando && fileRef.current?.click()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-[#1D4ED8]/50 hover:bg-gray-50 transition-colors"
              >
                <Upload className="h-7 w-7 mx-auto text-gray-400 mb-2" />
                <p className="text-sm font-medium">Enviar PDF ou arquivo de texto</p>
                <p className="text-xs text-gray-500 mt-1">
                  Até 20 MB. O texto precisa ser selecionável (PDF digitalizado não funciona).
                </p>
                <input
                  ref={fileRef} type="file" className="hidden"
                  accept=".pdf,.txt,.md,.csv"
                  onChange={enviarArquivo} disabled={processando}
                />
              </div>
            </TabsContent>

            <TabsContent value="link" className="pt-5 space-y-3">
              <Label htmlFor="g-url">Endereço da página</Label>
              <div className="flex gap-2">
                <Input
                  id="g-url" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..." disabled={processando}
                />
                <Button onClick={enviarUrl} disabled={processando || !url.trim()}>Adicionar</Button>
              </div>
              <p className="text-xs text-gray-500">
                Alguns sites bloqueiam leitura automática. Se der erro, baixe o PDF e envie pela aba Arquivo.
              </p>
            </TabsContent>
          </Tabs>

          {processando && (
            <div className="mt-5 flex items-center gap-3 rounded-lg border bg-gray-50 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-[#1D4ED8]" />
              <span className="text-sm text-gray-500">
                {progresso?.total
                  ? `Processando… ${progresso.feito} de ${progresso.total} trechos`
                  : 'Lendo o material…'}
              </span>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">
            Materiais na base global {docs.length > 0 && <span className="text-gray-400 font-normal">· {docs.length}</span>}
          </h3>
          {carregando ? (
            <p className="text-sm text-gray-500">Carregando…</p>
          ) : docs.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nenhum material global ainda. Adicione a cartilha de boas práticas ou procedimentos padrão.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-gray-400 shrink-0">{iconeOrigem(d.origem)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate text-gray-800">{d.titulo}</p>
                    <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                      {d.status === 'indexado' ? (
                        <><CheckCircle2 className="h-3 w-3 text-emerald-600" />{d.total_trechos} trechos indexados</>
                      ) : d.status === 'erro' ? (
                        <><AlertCircle className="h-3 w-3 text-rose-500" />{d.erro || 'falhou'}</>
                      ) : 'processando…'}
                    </p>
                  </div>
                  {d.status === 'indexado' && (
                    <Button
                      variant="ghost" size="icon" onClick={() => abrirVisualizacao(d)}
                      title="Visualizar conteúdo"
                      className="text-gray-400 hover:text-gray-700 shrink-0"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="icon" onClick={() => excluir(d)}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Visualização */}
      <Dialog open={!!vendo} onOpenChange={(o) => !o && setVendo(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <span className="truncate">{vendo?.titulo}</span>
            </DialogTitle>
          </DialogHeader>
          {vendo?.url && (
            <a
              href={vendo.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir a página original
            </a>
          )}
          <div className="min-h-0 flex-1 overflow-hidden mt-1">
            <div className="h-full overflow-y-auto rounded-lg border bg-gray-50 p-4">
              {conteudoVisto === null ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap leading-relaxed text-gray-700">
                  {conteudoVisto || 'Sem conteúdo.'}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
