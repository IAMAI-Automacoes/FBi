import { useEffect } from 'react'

/**
 * Telas de chat (WhatsApp, Sugestões, painel do admin): a PÁGINA não rola —
 * só as listas e as mensagens lá dentro. Põe a classe `tela-fixa` no <html>
 * enquanto a tela está aberta (regras em main.css).
 *
 * Sem isto, no celular, puxar além do fim de uma lista "passava" a rolagem
 * para a página: a barra do navegador sumia, o topo verde saía da tela e o
 * campo de mensagem subia fora do lugar (e, no topo, o Android recarregava a
 * página com o "puxar para atualizar").
 */
export function useTelaFixa(): void {
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('tela-fixa')
    // Se a página já tinha rolado antes de abrir a tela, volta ao topo.
    window.scrollTo(0, 0)
    return () => html.classList.remove('tela-fixa')
  }, [])
}
