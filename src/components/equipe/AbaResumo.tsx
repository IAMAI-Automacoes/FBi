import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { CheckCircle2, Flag, Lightbulb, Loader2, MessageSquareText, Send, Sparkles, TriangleAlert, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  climaDosPontos, contasDoEnvio, fraseDeRespostas, podeReceber, temasDosPontos,
  type ConviteAnonimo, type Envio, type Funcionario, type PontoEquipe, type RespostaAnonima, type ResumoEquipe,
} from '@/lib/equipe'
import { acaoEquipe } from '@/lib/queries/equipe'
import { BarraClima, Cartao, Rotulo, SeloCategoria } from './pecas'

const dia = (iso: string) => format(parseISO(iso), "dd 'de' MMM", { locale: ptBR })

function Numero({ icone: Icone, valor, rotulo, detalhe }: { icone: typeof Users; valor: string; rotulo: string; detalhe?: string }) {
  return (
    <Cartao className="flex items-start gap-3 p-4 sm:p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50"><Icone className="h-4 w-4 text-blue-700" /></span>
      <div className="min-w-0">
        <p className="text-xl font-bold tabular-nums leading-tight text-gray-900">{valor}</p>
        <p className="text-sm text-gray-600">{rotulo}</p>
        {detalhe && <p className="mt-0.5 text-xs text-gray-400">{detalhe}</p>}
      </div>
    </Cartao>
  )
}

function Lista({ titulo, itens, icone: Icone, cor }: { titulo: string; itens: string[]; icone: typeof Users; cor: string }) {
  if (!itens.length) return null
  return (
    <div>
      <Rotulo className="mb-2">{titulo}</Rotulo>
      <ul className="space-y-1.5">
        {itens.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-800"><Icone className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} /> <span>{t}</span></li>
        ))}
      </ul>
    </div>
  )
}

/** O resumo que a IA escreveu do envio. */
function ResumoDaIA({ resumo }: { resumo: ResumoEquipe }) {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-gray-800">{resumo.clima}</p>
      {resumo.por_onde_comecar && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700"><Flag className="h-3.5 w-3.5" /> Por onde começar</p>
          <p className="mt-1 text-sm text-gray-900">{resumo.por_onde_comecar}</p>
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-3">
        <Lista titulo="O que incomoda" itens={resumo.incomoda} icone={TriangleAlert} cor="text-rose-500" />
        <Lista titulo="O que vai bem" itens={resumo.vai_bem} icone={CheckCircle2} cor="text-emerald-600" />
        <Lista titulo="Ideias da equipe" itens={resumo.sugestoes} icone={Lightbulb} cor="text-sky-600" />
      </div>
    </div>
  )
}

export function AbaResumo({ funcionarios, envios, convites, respostas, pontos, onMudou, onPedir, onCadastrar }: {
  funcionarios: Funcionario[]
  envios: Envio[]
  convites: ConviteAnonimo[]
  respostas: RespostaAnonima[]
  pontos: PontoEquipe[]
  onMudou: () => void
  onPedir: () => void
  onCadastrar: () => void
}) {
  // O que o resumo olha: um envio ou tudo. Começa no envio mais recente.
  const [escolhido, setEscolhido] = useState<number | 'todos' | null>(null)
  const [gerando, setGerando] = useState(false)
  const escopo = escolhido ?? envios[0]?.id ?? 'todos'
  const envio = escopo === 'todos' ? null : envios.find((e) => e.id === escopo) ?? null

  const respostasDoEscopo = useMemo(() => (escopo === 'todos' ? respostas : respostas.filter((r) => r.envio_id === escopo)), [respostas, escopo])
  const pontosDoEscopo = useMemo(() => {
    const ids = new Set(respostasDoEscopo.map((r) => r.id))
    return pontos.filter((p) => ids.has(p.resposta_id))
  }, [pontos, respostasDoEscopo])
  const clima = climaDosPontos(pontosDoEscopo)
  const temas = temasDosPontos(pontosDoEscopo)
  const recebem = funcionarios.filter(podeReceber).length
  const ultimo = envios[0] ?? null
  const contasDoUltimo = ultimo ? contasDoEnvio(convites.filter((c) => c.envio_id === ultimo.id)) : null

  const gerar = async () => {
    if (!envio) return
    setGerando(true)
    const r = await acaoEquipe('gerar_resumo', { envio_id: envio.id })
    setGerando(false)
    if (!r.ok) return toast.error(r.error || 'Não foi possível gerar o resumo.')
    toast.success('Resumo pronto.')
    onMudou()
  }

  if (!funcionarios.length && !envios.length) {
    return (
      <Cartao className="py-10">
        <div className="mx-auto max-w-md text-center">
          <Users className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-base font-semibold text-gray-900">Ouça quem trabalha com você</p>
          <ol className="mt-4 space-y-2 text-left text-sm text-gray-600">
            <li className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">1</span> Cadastre o nome e o número de cada funcionário.</li>
            <li className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">2</span> Peça feedback: cada um recebe uma mensagem no WhatsApp, de um número do EasyFeed.</li>
            <li className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">3</span> As respostas chegam aqui analisadas, sem nome e sem número.</li>
          </ol>
          <Button onClick={onCadastrar} className="mt-5 bg-[#1D4ED8] hover:bg-[#1E40AF]">Cadastrar a equipe</Button>
        </div>
      </Cartao>
    )
  }

  const novas = envio?.resumo ? respostasDoEscopo.length - (envio.resumo.respostas ?? 0) : 0

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Numero icone={Users} valor={String(recebem)} rotulo={recebem === 1 ? 'funcionário recebe os pedidos' : 'funcionários recebem os pedidos'} detalhe={funcionarios.length > recebem ? `de ${funcionarios.length} cadastrados` : undefined} />
        <Numero
          icone={Send}
          valor={ultimo ? dia(ultimo.criado_em) : 'Nenhum'}
          rotulo={ultimo ? 'último pedido de feedback' : 'pedido de feedback ainda'}
          detalhe={contasDoUltimo ? fraseDeRespostas(contasDoUltimo) : undefined}
        />
        <Numero icone={MessageSquareText} valor={String(respostas.length)} rotulo={respostas.length === 1 ? 'resposta no total' : 'respostas no total'} />
      </div>

      {!envios.length ? (
        <Cartao className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-gray-600">A equipe está cadastrada. Falta pedir o primeiro feedback.</p>
          <Button onClick={onPedir} className="bg-[#1D4ED8] hover:bg-[#1E40AF]"><Send className="mr-1.5 h-4 w-4" /> Pedir feedback</Button>
        </Cartao>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="escopo-resumo" className="text-sm text-gray-600">Olhando</label>
            <select
              id="escopo-resumo"
              value={String(escopo)}
              onChange={(e) => setEscolhido(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm outline-none focus:border-[#1D4ED8]"
            >
              {envios.map((e) => <option key={e.id} value={e.id}>Pedido de {dia(e.criado_em)}</option>)}
              <option value="todos">Tudo, com as respostas espontâneas</option>
            </select>
            <span className="text-sm text-gray-500">{respostasDoEscopo.length} {respostasDoEscopo.length === 1 ? 'resposta' : 'respostas'}</span>
          </div>

          {!pontosDoEscopo.length ? (
            <Cartao className="py-8 text-center text-sm text-gray-500">
              {respostasDoEscopo.length ? 'As respostas chegaram, mas ainda sem análise.' : 'Ainda não chegou resposta. Elas aparecem aqui assim que a equipe responder.'}
            </Cartao>
          ) : (
            <div className="grid items-start gap-5 md:grid-cols-2">
              <Cartao>
                <h2 className="text-base font-bold text-gray-900">Clima</h2>
                <p className="mt-0.5 text-xs text-gray-500">{clima.total} {clima.total === 1 ? 'ponto levantado' : 'pontos levantados'} pela equipe</p>
                <BarraClima clima={clima} legenda className="mt-4" />
              </Cartao>
              <Cartao>
                <h2 className="text-base font-bold text-gray-900">Assuntos mais falados</h2>
                <ul className="mt-3 space-y-3">
                  {temas.slice(0, 6).map((t) => (
                    <li key={t.categoria}>
                      <div className="flex items-center justify-between gap-2">
                        <SeloCategoria categoria={t.categoria} />
                        <span className="text-xs tabular-nums text-gray-500">{t.total} {t.total === 1 ? 'ponto' : 'pontos'}</span>
                      </div>
                      <BarraClima clima={t} className="mt-1.5" />
                    </li>
                  ))}
                </ul>
              </Cartao>
            </div>
          )}

          {envio && (
            <Cartao>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-1.5 text-base font-bold text-gray-900"><Sparkles className="h-4 w-4 text-blue-600" /> Resumo da IA</h2>
                  <p className="mt-0.5 text-xs text-gray-500">Pergunta: "{envio.pergunta}"</p>
                </div>
                <Button variant="outline" size="sm" onClick={gerar} disabled={gerando || !pontosDoEscopo.length} className="shrink-0">
                  {gerando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                  {envio.resumo ? 'Atualizar resumo' : 'Gerar resumo'}
                </Button>
              </div>
              <div className="mt-4">
                {envio.resumo ? (
                  <>
                    <ResumoDaIA resumo={envio.resumo} />
                    <p className="mt-4 text-xs text-gray-400">
                      Feito com {envio.resumo.respostas ?? 0} {(envio.resumo.respostas ?? 0) === 1 ? 'resposta' : 'respostas'}
                      {envio.resumo_em ? `, em ${dia(envio.resumo_em)}` : ''}.
                      {novas > 0 && <span className="text-amber-700"> {novas === 1 ? 'Chegou 1 resposta nova' : `Chegaram ${novas} respostas novas`} depois disso.</span>}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">
                    {pontosDoEscopo.length
                      ? 'A IA lê tudo o que a equipe respondeu e diz o que vai bem, o que incomoda e por onde começar.'
                      : 'O resumo fica disponível quando chegar a primeira resposta.'}
                  </p>
                )}
              </div>
            </Cartao>
          )}
        </>
      )}
    </div>
  )
}
