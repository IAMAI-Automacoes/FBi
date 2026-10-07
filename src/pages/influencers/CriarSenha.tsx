import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabaseInfluencers } from '@/lib/supabase/cliente-influencers'
import { useInfluencer } from './contexto'
import { authInputBlur, authInputFocus, authInputStyle, Aviso, BotaoPrincipal, Carregando, LayoutEntrada, TituloEntrada, rotuloCampo } from './ui'

// O link do e-mail volta com os dados no hash: `#access_token=...&type=recovery`
// quando deu certo, `#error_code=otp_expired&...` quando venceu ou já foi usado.
const hashDoLink = () => new URLSearchParams(window.location.hash.slice(1))

/* /influencers/criar-senha: aberta pelo link "Criar minha senha" (primeiro
   acesso ou "esqueci a senha"). A sessão do link é a da área, não a do
   EasyFeed normal. */
export default function CriarSenha() {
  const { sessao, carregando } = useInfluencer()
  const navigate = useNavigate()
  // Lido na primeira renderização, antes de o supabase-js limpar o hash.
  const [linkInvalido] = useState(() => hashDoLink().has('error_code'))
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (carregando) return <Carregando />

  if (linkInvalido || !sessao) {
    return (
      <LayoutEntrada>
        <TituloEntrada
          titulo="Esse link não vale mais"
          subtitulo="O link expira em 1 hora e só funciona uma vez. Peça um novo na tela de entrada."
        />
        <BotaoPrincipal type="button" onClick={() => navigate('/influencers', { replace: true })}>Pedir um novo link</BotaoPrincipal>
      </LayoutEntrada>
    )
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')
    if (senha !== confirmar) return setErro('As duas senhas não estão iguais.')
    setSalvando(true)
    const { error } = await supabaseInfluencers.auth.updateUser({ password: senha })
    if (error) {
      setSalvando(false)
      setErro(/different from the old/i.test(error.message) ? 'Escolha uma senha diferente da anterior.' : 'Não foi possível salvar a senha. Tente de novo.')
      return
    }
    // A entrada decide o resto: boas-vindas no primeiro acesso, painel depois.
    navigate('/influencers', { replace: true })
  }


  return (
    <LayoutEntrada>
      <TituloEntrada titulo="Crie sua senha" subtitulo={<>Para entrar como <strong className="font-semibold text-slate-900">{sessao.user.email}</strong> nas próximas vezes.</>} />
      <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <span style={rotuloCampo}>Senha</span>
          <input
            type="password" autoComplete="new-password" placeholder="Pelo menos 6 caracteres" required autoFocus
            value={senha} onChange={(e) => setSenha(e.target.value)} disabled={salvando}
            style={authInputStyle} onFocus={authInputFocus} onBlur={authInputBlur}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <span style={rotuloCampo}>Repita a senha</span>
          <input
            type="password" autoComplete="new-password" placeholder="••••••••" required
            value={confirmar} onChange={(e) => setConfirmar(e.target.value)} disabled={salvando}
            style={authInputStyle} onFocus={authInputFocus} onBlur={authInputBlur}
          />
        </label>
        {erro && <Aviso>{erro}</Aviso>}
        <BotaoPrincipal type="submit" carregando={salvando} disabled={!senha || !confirmar}>Salvar e entrar</BotaoPrincipal>
      </form>
    </LayoutEntrada>
  )
}
