import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProvedorInfluencer, useInfluencer } from './contexto'
import BoasVindas from './BoasVindas'
import CriarSenha from './CriarSenha'
import Entrada from './Entrada'
import Painel from './Painel'
import { BotaoPrincipal, Carregando, LayoutEntrada, TituloEntrada } from './ui'

/* EasyFeed Influencers (/influencers). Escondida: nenhum link do site aponta
   para cá, o nome não tem "login", e a página pede para não ser indexada. O
   login é separado do EasyFeed normal (ver `cliente-influencers.ts`). */

function useSemIndexar() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    const tituloAntes = document.title
    document.title = 'EasyFeed Influencers'
    return () => {
      meta.remove()
      document.title = tituloAntes
    }
  }, [])
}

function SemAcesso() {
  const { sessao, sair } = useInfluencer()
  return (
    <LayoutEntrada>
      <TituloEntrada
        titulo="Seu acesso não está liberado"
        subtitulo={<><strong className="font-semibold text-slate-900">{sessao?.user.email}</strong> não está na lista de parceiros do EasyFeed Influencers. Se você é parceiro, fale com a nossa equipe.</>}
      />
      <BotaoPrincipal type="button" onClick={() => sair()}>Entrar com outro e-mail</BotaoPrincipal>
    </LayoutEntrada>
  )
}

function Inicio() {
  const { carregando, sessao, perfil } = useInfluencer()
  if (carregando) return <Carregando />
  if (!sessao) return <Entrada />
  if (!perfil) return <SemAcesso />
  if (!perfil.onboarding_em) return <Navigate to="/influencers/boas-vindas" replace />
  return <Painel />
}

function SoComPerfil({ children }: { children: React.ReactNode }) {
  const { carregando, sessao, perfil } = useInfluencer()
  if (carregando) return <Carregando />
  if (!sessao || !perfil) return <Navigate to="/influencers" replace />
  return <>{children}</>
}

export default function AreaInfluencers() {
  useSemIndexar()
  return (
    <ProvedorInfluencer>
      <Routes>
        <Route index element={<Inicio />} />
        <Route path="criar-senha" element={<CriarSenha />} />
        <Route path="boas-vindas" element={<SoComPerfil><BoasVindas /></SoComPerfil>} />
        <Route path="*" element={<Navigate to="/influencers" replace />} />
      </Routes>
    </ProvedorInfluencer>
  )
}
