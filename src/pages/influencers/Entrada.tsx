import { useEffect, useState } from 'react'
import { MailCheck } from 'lucide-react'
import { consultarEntrada, entrarComSenha, ErroEntrada, pedirLinkDeSenha } from './dados'
import { authInputBlur, authInputFocus, authInputStyle, Aviso, BotaoPrincipal, BotaoTexto, LayoutEntrada, TituloEntrada, rotuloCampo } from './ui'

type Etapa = 'email' | 'senha' | 'link' | 'sem_acesso'

/* Entrada do EasyFeed Influencers. O e-mail decide o caminho:
   fora da lista → sem acesso; já tem senha → senha; primeiro acesso → link no
   e-mail para criar a senha (confirma que o e-mail é dele). */
export default function Entrada() {
  const [etapa, setEtapa] = useState<Etapa>('email')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // "Reenviar" só depois de 1 minuto (a função não manda dois links seguidos).
  const [podeReenviarEm, setPodeReenviarEm] = useState(0)
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    if (etapa !== 'link') return
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [etapa])

  const falhou = (e: unknown) => setErro(e instanceof ErroEntrada ? e.message : 'Não foi possível continuar agora. Tente de novo.')

  const irPara = (situacao: Awaited<ReturnType<typeof consultarEntrada>>) => {
    if (situacao === 'entrar') setEtapa('senha')
    else if (situacao === 'link_enviado') {
      setEtapa('link')
      setPodeReenviarEm(Date.now() + 60_000)
    } else setEtapa('sem_acesso')
  }

  const continuar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    try {
      irPara(await consultarEntrada(email))
    } catch (err) {
      falhou(err)
    } finally {
      setCarregando(false)
    }
  }

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    try {
      await entrarComSenha(email, senha)
      // A sessão nova chega pelo contexto e a página troca sozinha para o painel.
    } catch (err) {
      falhou(err)
      setCarregando(false)
    }
  }

  const mandarLink = async () => {
    setErro(null)
    setCarregando(true)
    try {
      irPara(await pedirLinkDeSenha(email))
    } catch (err) {
      falhou(err)
    } finally {
      setCarregando(false)
    }
  }

  const trocarEmail = () => {
    setEtapa('email')
    setSenha('')
    setErro(null)
  }


  return (
    <LayoutEntrada>
      {etapa === 'email' && (
        <>
          <TituloEntrada titulo="Entrar" subtitulo="Acesso dos parceiros do EasyFeed. Digite o e-mail que você passou para a nossa equipe." />
          <form onSubmit={continuar} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <span style={rotuloCampo}>E-mail</span>
              <input
                type="email" autoComplete="email" placeholder="voce@email.com" required autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)} disabled={carregando}
                style={authInputStyle} onFocus={authInputFocus} onBlur={authInputBlur}
              />
            </label>
            {erro && <Aviso>{erro}</Aviso>}
            <BotaoPrincipal type="submit" carregando={carregando} disabled={!email}>Continuar</BotaoPrincipal>
          </form>
        </>
      )}

      {etapa === 'senha' && (
        <>
          <TituloEntrada
            titulo="Digite sua senha"
            subtitulo={<>Entrando como <strong className="font-semibold text-slate-900">{email}</strong>.</>}
          />
          <form onSubmit={entrar} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <span style={rotuloCampo}>Senha</span>
              <input
                type="password" autoComplete="current-password" placeholder="••••••••" required autoFocus
                value={senha} onChange={(e) => setSenha(e.target.value)} disabled={carregando}
                style={authInputStyle} onFocus={authInputFocus} onBlur={authInputBlur}
              />
            </label>
            {erro && <Aviso>{erro}</Aviso>}
            <BotaoPrincipal type="submit" carregando={carregando} disabled={!senha}>Entrar</BotaoPrincipal>
            <div className="flex items-center justify-between">
              <BotaoTexto onClick={trocarEmail} disabled={carregando}>Usar outro e-mail</BotaoTexto>
              <BotaoTexto onClick={mandarLink} disabled={carregando}>Esqueci a senha</BotaoTexto>
            </div>
          </form>
        </>
      )}

      {etapa === 'link' && (
        <>
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <MailCheck className="h-6 w-6" />
          </div>
          <TituloEntrada
            titulo="Veja o seu e-mail"
            subtitulo={<>Mandamos um link para <strong className="font-semibold text-slate-900">{email}</strong>. Abra o e-mail e clique em "Criar minha senha". O link vale por 1 hora.</>}
          />
          {erro && <div className="mb-4"><Aviso>{erro}</Aviso></div>}
          <div className="flex items-center justify-between">
            <BotaoTexto onClick={trocarEmail} disabled={carregando}>Usar outro e-mail</BotaoTexto>
            <BotaoTexto onClick={mandarLink} disabled={carregando || agora < podeReenviarEm}>
              {agora < podeReenviarEm ? `Reenviar em ${Math.ceil((podeReenviarEm - agora) / 1000)}s` : 'Não chegou? Reenviar'}
            </BotaoTexto>
          </div>
          <p className="mt-6 text-[12px] leading-relaxed text-slate-400">Não achou? Confira a caixa de spam. O e-mail vem de nao-responda@easyfeed.com.br.</p>
        </>
      )}

      {etapa === 'sem_acesso' && (
        <>
          <TituloEntrada
            titulo="Este e-mail não tem acesso"
            subtitulo={<><strong className="font-semibold text-slate-900">{email}</strong> não está na lista de parceiros. Se você é parceiro do EasyFeed, fale com a nossa equipe para liberar o acesso.</>}
          />
          <BotaoPrincipal type="button" onClick={trocarEmail}>Tentar outro e-mail</BotaoPrincipal>
        </>
      )}
    </LayoutEntrada>
  )
}
