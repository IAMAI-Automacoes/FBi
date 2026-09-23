import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/** Intervalo mínimo entre duas conferências (a aba pode ganhar foco muitas vezes). */
const INTERVALO_MINIMO_MS = 60_000
/** Conferência de fundo, para aba que fica visível o tempo todo. */
const CONFERENCIA_PERIODICA_MS = 10 * 60_000

function scriptPrincipal(html: string): string | null {
  return html.match(/src="(\/assets\/main-[^"]+\.js)"/)?.[1] ?? null
}

/**
 * Aba aberta antes de um deploy continua rodando o código antigo até recarregar
 * — se ficou aberta de um dia para o outro, é o código de ontem. Foi assim que
 * uma conta de vendedor não viu o "Pular por agora" do onboarding, publicado
 * minutos antes de ele abrir a aba.
 *
 * Confere o index.html publicado quando a aba volta a ficar visível e a cada
 * 10 min. Se o script principal mudou, recarrega na PRÓXIMA troca de página —
 * nunca no meio de uma tela, para não perder o que a pessoa está digitando.
 */
export function AtualizacaoDoApp() {
  const { pathname } = useLocation()
  const temVersaoNova = useRef(false)
  const caminhoAnterior = useRef(pathname)

  useEffect(() => {
    if (import.meta.env.DEV) return
    const atual = document.querySelector('script[type="module"][src*="/assets/main-"]')?.getAttribute('src')
    if (!atual) return

    let ultimaConferencia = 0
    const conferir = async () => {
      if (temVersaoNova.current || Date.now() - ultimaConferencia < INTERVALO_MINIMO_MS) return
      ultimaConferencia = Date.now()
      try {
        const resposta = await fetch(`/?versao=${Date.now()}`, { cache: 'no-store' })
        const publicado = scriptPrincipal(await resposta.text())
        if (publicado && publicado !== atual) temVersaoNova.current = true
      } catch {
        /* sem internet agora: confere de novo depois */
      }
    }

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') conferir()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    const id = setInterval(conferir, CONFERENCIA_PERIODICA_MS)
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar)
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (pathname === caminhoAnterior.current) return
    caminhoAnterior.current = pathname
    if (temVersaoNova.current) window.location.reload()
  }, [pathname])

  return null
}
