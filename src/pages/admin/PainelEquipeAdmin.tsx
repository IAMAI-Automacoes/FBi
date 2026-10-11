import { useCallback, useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { CheckCircle2, FlaskConical, Loader2, RefreshCw, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { SeloCategoria, SeloSentimento } from '@/components/equipe/pecas'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import type { StatusConvite } from '@/lib/equipe'
import { formatarExibicaoTelefone } from '@/lib/telefone'
import { acaoEquipe, buscarConvitesAdmin, type AnaliseSimulada, type ConviteAdmin, type EstadoNumero, type RespostaEquipe } from '@/lib/queries/equipe'
import { CrudTable, Td, Th } from '@/pages/admin/tabela'

/* Aba "Equipe" do painel do admin: o número só do EasyFeed que fala com os
   funcionários dos restaurantes (conectar pelo QR Code), a fila de convites de
   todos os restaurantes (aqui aparece quem recebeu e quem respondeu; na página
   do restaurante, não) e um teste da análise sem precisar de WhatsApp. */

const quando = (iso: string | null) => (iso ? format(parseISO(iso), "dd/MM 'às' HH:mm", { locale: ptBR }) : '')
const qrSrc = (qr: string) => (qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`)
const cartao = 'rounded-xl border border-gray-200 bg-white p-5'

const ROTULO: Record<StatusConvite, string> = { na_fila: 'Na fila', enviando: 'Enviando', enviado: 'Enviado', falhou: 'Não saiu', cancelado: 'Cancelado' }
const COR: Record<StatusConvite, string> = {
  na_fila: 'bg-gray-100 text-gray-600',
  enviando: 'bg-blue-50 text-blue-700',
  enviado: 'bg-emerald-50 text-emerald-700',
  falhou: 'bg-rose-50 text-rose-700',
  cancelado: 'bg-gray-100 text-gray-500',
}

// ── O número do EasyFeed ─────────────────────────────────────────────────────

function NumeroDaEquipe() {
  const { confirmar, dialogo } = useConfirmacao()
  const [estado, setEstado] = useState<EstadoNumero | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [conectando, setConectando] = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const rotina = useRef<ReturnType<typeof setInterval> | null>(null)
  const ultimoQr = useRef(0)

  const parar = useCallback(() => {
    if (rotina.current) { clearInterval(rotina.current); rotina.current = null }
  }, [])

  useEffect(() => {
    let vivo = true
    acaoEquipe<EstadoNumero>('numero_status').then((r) => {
      if (!vivo) return
      if (r.ok) setEstado(r as EstadoNumero)
      else setAviso(r.error || 'Não foi possível consultar o número.')
      setCarregando(false)
    })
    return () => { vivo = false; parar() }
  }, [parar])

  // Lê o que voltou. true = acabou (conectou ou foi recusado).
  const ler = (r: RespostaEquipe<EstadoNumero>): boolean => {
    if (!r.ok) {
      setAviso(r.error || 'Não foi possível conectar.')
      return true
    }
    // O status às vezes vem sem o QR: mantém o que já está na tela.
    setEstado((atual) => ({ ...(r as EstadoNumero), qrcode: r.qrcode ?? (r.conectado ? null : atual?.qrcode ?? null) }))
    if (r.recusado) {
      setAviso(r.recusado)
      return true
    }
    if (r.conectado) {
      toast.success(r.numero ? `Número ${formatarExibicaoTelefone(r.numero)} conectado.` : 'Número conectado.')
      return true
    }
    return false
  }

  const conectar = async () => {
    setAviso(null)
    setConectando(true)
    const pedirQr = async () => {
      ultimoQr.current = Date.now()
      return await acaoEquipe<EstadoNumero>('numero_conectar')
    }
    if (ler(await pedirQr())) return setConectando(false)
    parar()
    // Confere a conexão de 3 em 3 s e renova o QR antes de ele vencer (uns 2 min).
    rotina.current = setInterval(async () => {
      const r = Date.now() - ultimoQr.current > 110_000 ? await pedirQr() : await acaoEquipe<EstadoNumero>('numero_status')
      if (ler(r)) {
        parar()
        setConectando(false)
      }
    }, 3000)
  }

  const desconectar = async (perguntar: boolean) => {
    if (perguntar && !(await confirmar({ titulo: 'Desconectar o número da equipe?', descricao: 'Os pedidos de feedback param de sair e as respostas deixam de chegar, em todos os restaurantes.', confirmar: 'Desconectar', destrutivo: true }))) return
    parar()
    setConectando(false)
    setDesconectando(true)
    const r = await acaoEquipe<EstadoNumero>('numero_desconectar')
    setDesconectando(false)
    if (r.ok) setEstado(r as EstadoNumero)
    else toast.error(r.error || 'Não foi possível desconectar.')
  }

  return (
    <div className={cartao}>
      {dialogo}
      <h3 className="text-[14px] font-semibold text-gray-800">Número do EasyFeed para a equipe</h3>
      <p className="mt-1 text-[12px] text-gray-500">
        É deste número que saem os pedidos de feedback para os funcionários de todos os restaurantes, e é para ele que eles respondem. Tem que ser um número só do EasyFeed: se fosse o do restaurante, o dono leria as respostas no celular.
      </p>

      <div className="mt-4">
        {carregando ? <Skeleton className="h-20 w-full rounded-lg" /> : estado?.conectado ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></span>
              <div>
                <p className="text-[14px] font-semibold text-emerald-800">Conectado</p>
                <p className="text-[13px] text-emerald-700">{estado.numero ? formatarExibicaoTelefone(estado.numero) : 'WhatsApp ativo'}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => desconectar(true)} disabled={desconectando} className="text-rose-700">
              {desconectando ? 'Desconectando…' : 'Desconectar'}
            </Button>
          </div>
        ) : conectando ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="max-w-sm text-center text-[13px] text-gray-600">
              No celular do número do EasyFeed: WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>, e escaneie o QR Code.
            </p>
            <div className="flex h-56 w-56 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white">
              {estado?.qrcode && !estado.qrcode.startsWith('<')
                ? <img src={qrSrc(estado.qrcode)} alt="QR Code do WhatsApp" className="h-full w-full object-contain" />
                : <span className="flex flex-col items-center gap-2 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /><span className="text-[12px]">Gerando o QR Code…</span></span>}
            </div>
            <p className="flex items-center gap-1.5 text-[12px] text-gray-500"><RefreshCw className="h-3.5 w-3.5" /> O QR Code se renova sozinho enquanto esta tela está aberta.</p>
            <Button variant="ghost" size="sm" onClick={() => desconectar(false)}>Cancelar</Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100"><Smartphone className="h-6 w-6 text-gray-400" /></span>
            <p className="text-[13px] text-gray-600">Nenhum número conectado. Sem ele, os pedidos ficam na fila e nada sai.</p>
            <Button size="sm" onClick={conectar} className="bg-[#1D4ED8] hover:bg-[#1E40AF]">Conectar número</Button>
          </div>
        )}
        {aviso && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{aviso}</p>}
      </div>
    </div>
  )
}

// ── Testar a análise ─────────────────────────────────────────────────────────

function TestarAnalise() {
  const [texto, setTexto] = useState('')
  const [rodando, setRodando] = useState(false)
  const [resultado, setResultado] = useState<AnaliseSimulada | null>(null)

  const rodar = async () => {
    if (!texto.trim()) return
    setRodando(true)
    setResultado(null)
    const r = await acaoEquipe<AnaliseSimulada>('simular', { texto })
    setRodando(false)
    if (!r.ok || !r.analise) return toast.error(r.error || 'Não foi possível analisar.')
    setResultado(r as AnaliseSimulada)
  }

  return (
    <div className={cartao}>
      <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-800"><FlaskConical className="h-4 w-4 text-gray-500" /> Testar a análise</h3>
      <p className="mt-1 text-[12px] text-gray-500">Escreva como se fosse um funcionário respondendo. Roda a mesma IA, sem WhatsApp e sem gravar nada.</p>
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} className="mt-3 text-[13px]" placeholder="Ex.: A equipe é boa, mas a escala muda em cima da hora e ninguém avisa." />
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="outline" onClick={rodar} disabled={rodando || !texto.trim()}>
          {rodando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Analisar
        </Button>
      </div>
      {resultado && (
        <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-600">
            A mensagem: <SeloSentimento valor={resultado.sentimento} />
            {resultado.analise.tipo !== 'feedback' && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[12px] text-gray-600">{resultado.analise.tipo === 'pergunta' ? 'É uma pergunta, não feedback' : 'Não é feedback (não grava)'}</span>}
            {resultado.analise.sensivel && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[12px] font-medium text-red-700">Relato sensível</span>}
            {resultado.parar && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-700">Pedido de PARAR</span>}
          </div>
          {resultado.analise.pontos.length > 0 && (
            <ul className="space-y-2">
              {resultado.analise.pontos.map((p, i) => (
                <li key={i} className="text-[13px]">
                  <div className="flex flex-wrap items-center gap-1.5"><SeloCategoria categoria={p.categoria} /><SeloSentimento valor={p.sentimento} /></div>
                  <p className="mt-1 text-gray-800">{p.resumo}</p>
                  <p className="text-[12px] text-gray-400">"{p.texto_original}"</p>
                </li>
              ))}
            </ul>
          )}
          <div>
            <p className="text-[12px] font-semibold text-gray-500">O que a atendente responderia</p>
            <p className="mt-1 whitespace-pre-line rounded-lg bg-gray-50 p-3 text-[13px] text-gray-800">{resultado.resposta ?? '(não responde)'}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── A aba ────────────────────────────────────────────────────────────────────

export function PainelEquipeAdmin() {
  const [carregando, setCarregando] = useState(true)
  const [convites, setConvites] = useState<ConviteAdmin[]>([])

  const carregar = useCallback(async () => {
    try {
      setConvites(await buscarConvitesAdmin())
    } catch {
      toast.error('Não foi possível carregar os convites.')
    } finally {
      setCarregando(false)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const naFila = convites.filter((c) => c.status === 'na_fila' || c.status === 'enviando').length
  const naoSairam = convites.filter((c) => c.status === 'falhou').length
  const enviados = convites.filter((c) => c.status === 'enviado')
  const responderam = enviados.filter((c) => c.respondeu_em).length

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Equipe</h2>
            <p className="mt-1 text-[12px] text-gray-500">
              Feedback dos funcionários: o restaurante cadastra a equipe e pede feedback em Equipe (no menu); as mensagens saem de um número do EasyFeed e a resposta chega anônima para o restaurante.
            </p>
          </div>
          <button
            onClick={() => { setCarregando(true); carregar() }}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <NumeroDaEquipe />
          <TestarAnalise />
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h3 className="text-[14px] font-semibold text-gray-800">Convites (todos os restaurantes)</h3>
            <span className="text-[12px] text-gray-500">
              Na fila: {naFila} · Enviados: {enviados.length} · Responderam: {responderam}{naoSairam ? ` · Não saíram: ${naoSairam}` : ''}
            </span>
          </div>
          {carregando ? <Skeleton className="h-40 w-full rounded-xl" /> : (
            <CrudTable>
              <thead><tr><Th>Restaurante</Th><Th>Funcionário</Th><Th>Situação</Th><Th>Enviado</Th><Th>Respondeu</Th></tr></thead>
              <tbody>
                {convites.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0">
                    <Td className="text-[13px] font-medium text-gray-800">{c.restaurante}</Td>
                    <Td className="text-[13px] text-gray-700">{c.funcionario}<span className="block text-[11px] tabular-nums text-gray-400">{formatarExibicaoTelefone(c.telefone)}</span></Td>
                    <Td>
                      <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', COR[c.status])}>{ROTULO[c.status]}</span>
                      {c.erro && <span className="mt-0.5 block max-w-xs text-[11px] text-rose-600">{c.erro}</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-[12px] text-gray-500">{quando(c.enviado_em) || <span className="text-gray-300">—</span>}</Td>
                    <Td className="whitespace-nowrap text-[12px] text-gray-500">{quando(c.respondeu_em) || <span className="text-gray-300">—</span>}</Td>
                  </tr>
                ))}
                {convites.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-[13px] text-gray-500">Nenhum convite ainda. Eles aparecem quando um restaurante pede feedback para a equipe.</td></tr>
                )}
              </tbody>
            </CrudTable>
          )}
        </div>
      </div>
    </div>
  )
}
