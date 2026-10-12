/* O menu de subpáginas do cabeçalho (Equipe, Descontos): qual está aberta.
   Sem React aqui, para dar para testar. O desenho fica em components/SubNav.tsx. */

/**
 * A subpágina aberta. A primeira da lista é a raiz da área ("/equipe",
 * "/descontos"). Vale a de endereço mais específico: "/equipe/acoes/arquivadas"
 * ainda é Ações. O que não for de nenhuma (ex.: "/descontos/historico") é da raiz.
 */
export function subpaginaAberta(enderecos: readonly string[], caminho: string): string {
  const achada = [...enderecos]
    .sort((a, b) => b.length - a.length)
    .find((href) => caminho === href || caminho.startsWith(`${href}/`))
  return achada ?? enderecos[0]
}
