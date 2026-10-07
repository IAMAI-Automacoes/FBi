import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EyeOff, Lightbulb, MessagesSquare } from 'lucide-react'
import { useInfluencer } from './contexto'
import { salvarPerfil } from './dados'
import { authInputBlur, authInputFocus, authInputStyle, Aviso, BotaoPrincipal, LayoutEntrada, TituloEntrada } from './ui'

const COMO_FUNCIONA = [
  {
    icon: MessagesSquare,
    titulo: 'O que os clientes comentam',
    texto: 'Os feedbacks que os clientes mandam aos restaurantes, organizados por assunto e por tema, com o que está crescendo.',
  },
  {
    icon: EyeOff,
    titulo: 'Tudo anônimo',
    texto: 'Sem nome de restaurante, de cliente nem telefone. Só números, temas e resumos curtos.',
  },
  {
    icon: Lightbulb,
    titulo: 'Ideias de pauta prontas',
    texto: 'Títulos de vídeo tirados dos dados, cada um com o número que sustenta a ideia.',
  },
]

/* Primeiro acesso: como chamar a pessoa (e o @), depois o que tem no painel. */
export default function BoasVindas() {
  const { perfil, recarregarPerfil } = useInfluencer()
  const navigate = useNavigate()
  const [passo, setPasso] = useState<1 | 2>(perfil?.onboarding_em ? 2 : 1)
  const [nome, setNome] = useState(perfil?.nome ?? '')
  const [arroba, setArroba] = useState(perfil?.arroba ?? '')
  const [cidade, setCidade] = useState(perfil?.cidade ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      await salvarPerfil(nome, arroba, cidade)
      await recarregarPerfil()
      setPasso(2)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar agora.')
    } finally {
      setSalvando(false)
    }
  }

  const rotulo = 'text-[13px] font-medium text-slate-700'

  return (
    <LayoutEntrada>
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-blue-600">Passo {passo} de 2</p>

      {passo === 1 ? (
        <>
          <TituloEntrada titulo="Que bom ter você aqui" subtitulo="Conta um pouco sobre você. Leva menos de um minuto." />
          <form onSubmit={salvar} className="flex flex-col gap-5">
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Como podemos te chamar?</span>
              <input
                type="text" autoComplete="given-name" placeholder="Seu nome" required autoFocus maxLength={60}
                value={nome} onChange={(e) => setNome(e.target.value)} disabled={salvando}
                style={authInputStyle} onFocus={authInputFocus} onBlur={authInputBlur}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Seu @ principal <span className="font-normal text-slate-400">(opcional)</span></span>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">@</span>
                <input
                  type="text" placeholder="seuperfil" maxLength={40}
                  value={arroba} onChange={(e) => setArroba(e.target.value.replace(/^@+/, ''))} disabled={salvando}
                  style={{ ...authInputStyle, paddingLeft: '32px' }} onFocus={authInputFocus} onBlur={authInputBlur}
                />
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Cidade <span className="font-normal text-slate-400">(opcional)</span></span>
              <input
                type="text" autoComplete="address-level2" placeholder="São Paulo" maxLength={60}
                value={cidade} onChange={(e) => setCidade(e.target.value)} disabled={salvando}
                style={authInputStyle} onFocus={authInputFocus} onBlur={authInputBlur}
              />
            </label>
            {erro && <Aviso>{erro}</Aviso>}
            <BotaoPrincipal type="submit" carregando={salvando} disabled={!nome.trim()}>Continuar</BotaoPrincipal>
          </form>
        </>
      ) : (
        <>
          <TituloEntrada titulo={`Pronto${perfil?.nome ? `, ${perfil.nome.split(' ')[0]}` : ''}!`} subtitulo="Isto é o que você vai encontrar no painel:" />
          <ul className="mb-7 flex flex-col gap-4">
            {COMO_FUNCIONA.map((c) => (
              <li key={c.titulo} className="flex gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <c.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-slate-900">{c.titulo}</span>
                  <span className="block text-[13px] leading-relaxed text-slate-500">{c.texto}</span>
                </span>
              </li>
            ))}
          </ul>
          <BotaoPrincipal type="button" onClick={() => navigate('/influencers', { replace: true })}>Ver o painel</BotaoPrincipal>
        </>
      )}
    </LayoutEntrada>
  )
}
