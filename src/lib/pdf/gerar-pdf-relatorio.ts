import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { AnaliseRelatorio } from '@/lib/queries/relatorios'
import {
  barraEmpilhada,
  barrasHorizontais,
  linhaEvolucao,
  VERDE as G_VERDE,
  VERMELHO as G_VERMELHO,
  CINZA as G_CINZA,
} from './graficos'

// Paleta (mesma identidade do app)
const AZUL: [number, number, number] = [29, 78, 216]
const TINTA: [number, number, number] = [15, 23, 42]
const CINZA: [number, number, number] = [100, 116, 139]
const LINHA: [number, number, number] = [226, 232, 240]
const VERDE: [number, number, number] = [16, 185, 129]
const CINZA_NEUTRO: [number, number, number] = [148, 163, 184]
const VERMELHO: [number, number, number] = [244, 63, 94]
const FUNDO_SUAVE: [number, number, number] = [248, 250, 252]

const M = 16 // margem
const LARGURA = 210
const ALTURA = 297
const UTIL = LARGURA - M * 2

/**
 * jsPDF usa fontes padrão (WinAnsi) — travessão, bullet e aspas curvas somem.
 * Trocamos por equivalentes ASCII para não perder caractere no PDF.
 */
function limpar(s: any): string {
  return String(s ?? '')
    .replace(/[‐-―]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
}

export async function gerarPdfRelatorio(
  dadosRelatorio: any,
  analise: AnaliseRelatorio,
  nomeRestaurante: string,
): Promise<Blob> {
  const doc = new jsPDF()
  const kpis = dadosRelatorio.kpis || {}
  const est = dadosRelatorio.estatisticas || {}
  let y = 0

  const setCor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2])
  const setFundo = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2])

  /** Garante espaço na página; abre nova se faltar. */
  const espaco = (h: number) => {
    if (y + h > ALTURA - 22) {
      doc.addPage()
      y = M + 4
    }
  }

  /** Escreve parágrafo com quebra automática. */
  const paragrafo = (
    texto: string,
    opts: { tamanho?: number; cor?: [number, number, number]; estilo?: string; larg?: number; lh?: number } = {},
  ) => {
    const t = limpar(texto).trim()
    if (!t) return
    const tamanho = opts.tamanho ?? 10
    const larg = opts.larg ?? UTIL
    const lh = opts.lh ?? tamanho * 0.52
    doc.setFontSize(tamanho)
    doc.setFont('helvetica', opts.estilo ?? 'normal')
    setCor(opts.cor ?? CINZA)
    const linhas = doc.splitTextToSize(t, larg)
    espaco(linhas.length * lh + 2)
    doc.text(linhas, M, y)
    y += linhas.length * lh + 2
  }

  /** Título de seção com filete azul. */
  const secao = (titulo: string) => {
    espaco(16)
    y += 4
    setFundo(AZUL)
    doc.rect(M, y - 3.2, 2.6, 4.4, 'F')
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    setCor(TINTA)
    doc.text(limpar(titulo), M + 5.5, y)
    y += 6
  }

  // ── Cabeçalho ────────────────────────────────────────────────────────────
  setFundo(AZUL)
  doc.rect(0, 0, LARGURA, 34, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(19)
  doc.setFont('helvetica', 'bold')
  doc.text(limpar(nomeRestaurante || 'Restaurante'), M, 15)
  doc.setFontSize(10.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Relatório de Satisfação dos Clientes', M, 22.5)
  doc.setFontSize(9)
  const dataGer = new Date(dadosRelatorio.geradoEm || Date.now())
  doc.text(
    `${limpar(dadosRelatorio.periodo)}  |  gerado em ${dataGer.toLocaleDateString('pt-BR')}`,
    M,
    28.5,
  )
  y = 46

  // ── Manchete + resumo executivo ──────────────────────────────────────────
  paragrafo(analise.titulo, { tamanho: 15, cor: TINTA, estilo: 'bold', lh: 7 })
  y += 1
  paragrafo(analise.resumo, { tamanho: 10.5, cor: CINZA, lh: 5.4 })

  if (analise.alerta_amostra) {
    espaco(14)
    y += 2
    setFundo([255, 251, 235])
    doc.setDrawColor(253, 230, 138)
    const linhasAviso = doc.splitTextToSize(limpar(analise.alerta_amostra), UTIL - 8)
    const h = linhasAviso.length * 4.6 + 6
    doc.roundedRect(M, y - 4, UTIL, h, 2, 2, 'FD')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(146, 64, 14)
    doc.text(linhasAviso, M + 4, y + 1)
    y += h + 2
  }

  // ── Números do período (caixas) ──────────────────────────────────────────
  secao('Números do período')
  const comparar = kpis.hasPrevData && kpis.prevConfiavel
  const caixas = [
    // Mensagens, igual ao card do topo da tela. O número de assuntos aparece
    // na barra de divisão logo abaixo, que é onde ele é usado.
    { valor: String(kpis.totalMensagens ?? kpis.totalFeedbacks ?? 0), rotulo: 'Avaliações recebidas' },
    { valor: `${kpis.sentiment ?? 0}/100`, rotulo: 'Índice de satisfação' },
    { valor: `${kpis.positivePercent ?? 0}%`, rotulo: 'Positivas' },
    { valor: String(est.clientesUnicos ?? 0), rotulo: 'Clientes' },
  ]
  espaco(26)
  const lg = (UTIL - 3 * 4) / 4
  caixas.forEach((c, i) => {
    const x = M + i * (lg + 4)
    setFundo(FUNDO_SUAVE)
    doc.setDrawColor(LINHA[0], LINHA[1], LINHA[2])
    doc.roundedRect(x, y, lg, 20, 2, 2, 'FD')
    doc.setFontSize(15)
    doc.setFont('helvetica', 'bold')
    setCor(TINTA)
    doc.text(c.valor, x + lg / 2, y + 9, { align: 'center' })
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    setCor(CINZA)
    doc.text(c.rotulo, x + lg / 2, y + 15.5, { align: 'center' })
  })
  y += 24

  // Comparação com o período anterior — só quando é confiável
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  setCor(CINZA)
  doc.text(
    comparar
      ? limpar(`Comparado ao período anterior: ${kpis.totalTrend} em volume, ${kpis.sentimentTrend} de satisfação.`)
      : limpar(`Sem comparação confiável com o período anterior: ele teve apenas ${kpis.prevTotal ?? 0} ${(kpis.prevTotal ?? 0) === 1 ? 'avaliação' : 'avaliações'}.`),
    M,
    y,
  )
  y += 6

  // ── Distribuição das avaliações (barra empilhada) ────────────────────────
  const total = kpis.totalFeedbacks || 0
  if (total > 0) {
    secao('Como as avaliações se dividem')
    // Uma linha dizendo sobre O QUE é a divisão: os números aqui são
    // assuntos, e o card acima mostra mensagens. Sem isto, as duas contagens
    // aparecem na mesma página sem nada ligando uma à outra.
    paragrafo(
      `${total} assuntos citados nas ${kpis.totalMensagens ?? total} mensagens do período.`,
      { tamanho: 9, cor: CINZA, lh: 4.5 },
    )
    espaco(20)
    const pos = kpis.positivos || 0
    const neu = kpis.neutros || 0
    const neg = kpis.negativos || 0
    // Percentuais vêm prontos de `buscarKpis` (mesmos números da tela) em vez
    // de recalculados aqui — evita a legenda do PDF divergir da tela se a
    // fórmula de arredondamento mudar num lugar só.
    const segs = [
      { n: pos, pct: kpis.positivePercent ?? 0, c: VERDE, r: 'Positivas' },
      { n: neu, pct: kpis.neutralPercent ?? 0, c: CINZA_NEUTRO, r: 'Neutras' },
      { n: neg, pct: kpis.negativePercent ?? 0, c: VERMELHO, r: 'Negativas' },
    ]
    y = barraEmpilhada(doc, {
      x: M,
      y,
      largura: UTIL,
      partes: segs.map((s) => ({ rotulo: s.r, valor: s.n, cor: s.c })),
    })
  }

  // ── Pontos fortes e fracos (dois blocos) ─────────────────────────────────
  secao('O que se destacou')
  espaco(30)
  const meia = (UTIL - 5) / 2
  const blocos = [
    { titulo: 'Ponto forte', texto: analise.ponto_forte, cor: VERDE },
    { titulo: 'Precisa de atenção', texto: analise.ponto_fraco, cor: VERMELHO },
  ]
  const alturas = blocos.map((b) => {
    doc.setFontSize(9)
    return doc.splitTextToSize(limpar(b.texto), meia - 9).length * 4.4 + 14
  })
  const hBloco = Math.max(...alturas)
  blocos.forEach((b, i) => {
    const x = M + i * (meia + 5)
    setFundo(FUNDO_SUAVE)
    doc.setDrawColor(LINHA[0], LINHA[1], LINHA[2])
    doc.roundedRect(x, y, meia, hBloco, 2, 2, 'FD')
    setFundo(b.cor)
    doc.rect(x, y, 2, hBloco, 'F')
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(b.cor[0], b.cor[1], b.cor[2])
    doc.text(b.titulo.toUpperCase(), x + 5, y + 6)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    setCor(TINTA)
    doc.text(doc.splitTextToSize(limpar(b.texto), meia - 9), x + 5, y + 12)
  })
  y += hBloco + 4

  // ── Satisfação por categoria ─────────────────────────────────────────────
  const categorias = dadosRelatorio.categorias || []
  if (categorias.length > 0) {
    secao('Satisfação por categoria')
    paragrafo(analise.leitura_categorias, { tamanho: 9.5, lh: 4.8 })
    // Barras e não tabela: a pergunta aqui é "onde estou bem e onde estou
    // mal", e comparar comprimentos responde isso de relance — três colunas
    // de números exigem ler todas para achar a menor.
    espaco(categorias.length * 9 + 14)
    doc.setFontSize(7.5)
    setCor(CINZA)
    doc.text('avaliações', M + 44, y - 1, { align: 'right' })
    doc.text('satisfação (0-100)', M + UTIL, y - 1, { align: 'right' })
    y = barrasHorizontais(doc, {
      x: M,
      y: y + 1,
      largura: UTIL,
      maximo: 100,
      largRotulo: 46,
      itens: categorias.map((c: any) => ({
        rotulo: limpar(c.nome || c.name || '-'),
        valor: Number(c.satisfacao ?? c.score ?? 0),
        detalhe: String(c.total ?? c.count ?? ''),
        semDados: !(c.total ?? c.count),
      })),
    })
    y += 3
  }

  // ── Evolução da satisfação ───────────────────────────────────────────────
  // Faltava no PDF e é a única seção que responde "está melhorando ou
  // piorando?" — a tela mostra o gráfico, e quem recebia o arquivo via só
  // fotografias de um instante.
  const tendencia = dadosRelatorio.tendencia || []
  if (tendencia.length > 1) {
    secao('Evolução da satisfação')
    paragrafo(
      'Linha: satisfação do dia. Barras ao fundo: quantas avaliações houve. Dia sem avaliação não recebe ponto.',
      { tamanho: 9, cor: CINZA, lh: 4.5 },
    )
    espaco(44)
    y = linhaEvolucao(doc, {
      x: M + 6,
      y: y + 2,
      largura: UTIL - 6,
      altura: 30,
      pontos: tendencia.map((t: any) => ({
        rotulo: limpar(t.date),
        valor: t.sentiment ?? null,
        volume: t.avaliacoes ?? 0,
      })),
    })
    y += 2
  }

  // ── O que os clientes mais comentam ──────────────────────────────────────
  const temas = dadosRelatorio.temas || []
  if (temas.length > 0) {
    const porTipo = (tipo: string) =>
      temas
        .filter((t: any) => (t.tipo ?? '').toLowerCase() === tipo)
        .slice(0, 8)
        .map((t: any) => ({
          rotulo: limpar(t.rotulo),
          valor: Number(t.quantidade ?? 0),
          cor: tipo === 'elogio' ? G_VERDE : tipo === 'neutro' ? G_CINZA : G_VERMELHO,
        }))

    const reclamacoes = porTipo('reclamacao')
    const elogios = porTipo('elogio')

    // Os dois lados sempre, com teto SEPARADO para cada um.
    //
    // Antes era uma lista só, cortada em 14, com as reclamações na frente — e
    // como elas são a maioria, os elogios eram empurrados para fora: o
    // relatório do Camelo saiu sem UM elogio sequer, sendo que o assunto mais
    // citado do período era "Comida saborosa", com 19 menções. Quem recebia o
    // arquivo lia um restaurante em que nada dá certo.
    secao('O que os clientes mais comentam')
    paragrafo(
      'Assuntos que a IA agrupou a partir do que foi escrito, e quantas vezes cada um apareceu.',
      { tamanho: 9, cor: CINZA, lh: 4.5 },
    )

    const desenharLista = (titulo: string, itens: any[], cor: [number, number, number]) => {
      if (itens.length === 0) return
      espaco(itens.length * 9 + 16)
      y += 2
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(cor[0], cor[1], cor[2])
      doc.text(titulo.toUpperCase(), M, y)
      y += 4
      y = barrasHorizontais(doc, {
        x: M,
        y,
        largura: UTIL,
        largRotulo: 82,
        alturaBarra: 5.4,
        maximo: Math.max(...itens.map((i) => i.valor), 1),
        sufixo: 'x',
        itens,
      })
      y += 1
    }

    desenharLista('O que mais incomodou', reclamacoes, G_VERMELHO)
    desenharLista('O que mais agradou', elogios, G_VERDE)
    y += 2
  }

  // ── Quando as avaliações chegam ──────────────────────────────────────────
  // Dia da semana e faixa de horário lado a lado: são a mesma pergunta ("em
  // que momento isto acontece") vista por dois cortes, e separá-las em duas
  // seções faria o leitor comparar virando página.
  const porDia = dadosRelatorio.porDiaSemana || []
  const porHora = dadosRelatorio.porFaixaHorario || []
  if (porDia.length > 0 || porHora.length > 0) {
    secao('Quando as avaliacoes chegam')
    paragrafo(
      'Horario em que a mensagem foi enviada, nao o do atendimento. Satisfacao em branco = nenhuma avaliacao naquele recorte.',
      { tamanho: 9, cor: CINZA, lh: 4.5 },
    )
    espaco(18)

    const topoTabelas = y + 1
    const meia = (UTIL - 6) / 2
    const corpo = (linhas: any[]) =>
      linhas.map((d: any) => [
        limpar(d.nome),
        String(d.total ?? 0),
        d.satisfacao == null ? '-' : String(d.satisfacao),
      ])
    const estilo = {
      theme: 'plain' as const,
      styles: { fontSize: 8.5, cellPadding: 2, textColor: TINTA },
      headStyles: { fontStyle: 'bold' as const, textColor: CINZA, fillColor: FUNDO_SUAVE },
      alternateRowStyles: { fillColor: [252, 253, 254] as [number, number, number] },
      columnStyles: { 1: { halign: 'center' as const }, 2: { halign: 'center' as const } },
    }

    if (porDia.length > 0) {
      autoTable(doc, {
        ...estilo,
        startY: topoTabelas,
        head: [['Dia', 'Aval.', 'Satisf.']],
        body: corpo(porDia),
        margin: { left: M },
        tableWidth: meia,
      })
    }
    const fimEsquerda = porDia.length > 0 ? (doc as any).lastAutoTable.finalY : topoTabelas

    if (porHora.length > 0) {
      autoTable(doc, {
        ...estilo,
        startY: topoTabelas,
        head: [['Horario', 'Aval.', 'Satisf.']],
        body: corpo(porHora),
        margin: { left: M + meia + 6 },
        tableWidth: meia,
      })
    }
    const fimDireita = porHora.length > 0 ? (doc as any).lastAutoTable.finalY : topoTabelas

    y = Math.max(fimEsquerda, fimDireita) + 4
  }

  // ── Clientes ─────────────────────────────────────────────────────────────
  if (analise.leitura_clientes) {
    secao('Clientes')
    paragrafo(analise.leitura_clientes, { tamanho: 9.5, lh: 4.8 })
    const detalhes = [
      `Clientes diferentes que avaliaram: ${est.clientesUnicos ?? 0}`,
      `Clientes que avaliaram mais de uma vez: ${est.clientesRecorrentes ?? 0}`,
      est.faixaMaisMovimentada
        ? `Horário com mais avaliações: ${limpar(est.faixaMaisMovimentada.nome)} (${est.faixaMaisMovimentada.total})`
        : '',
      est.melhorDia ? `Melhor dia: ${est.melhorDia.nome} (${est.melhorDia.satisfacao}/100)` : '',
      est.piorDia ? `Dia mais fraco: ${est.piorDia.nome} (${est.piorDia.satisfacao}/100)` : '',
    ].filter(Boolean)
    doc.setFontSize(9)
    setCor(CINZA)
    for (const d of detalhes) {
      espaco(6)
      doc.text(`-  ${limpar(d)}`, M + 1, y)
      y += 4.6
    }
    y += 2
  }

  // ── Recomendações ────────────────────────────────────────────────────────
  if (analise.recomendacoes?.length) {
    secao('O que fazer agora')
    for (let i = 0; i < analise.recomendacoes.length; i++) {
      const linhas = doc.splitTextToSize(limpar(analise.recomendacoes[i]), UTIL - 12)
      espaco(linhas.length * 4.8 + 6)
      setFundo(AZUL)
      doc.circle(M + 2.6, y - 1.3, 2.6, 'F')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      doc.text(String(i + 1), M + 2.6, y + 0.2, { align: 'center' })
      doc.setFontSize(9.5)
      doc.setFont('helvetica', 'normal')
      setCor(TINTA)
      doc.text(linhas, M + 8, y)
      y += linhas.length * 4.8 + 3
    }
  }

  // ── Insights ativos (só se existirem) ────────────────────────────────────
  const insights = dadosRelatorio.insights || []
  if (insights.length > 0) {
    secao('Insights do sistema')
    doc.setFontSize(9.5)
    for (const ins of insights) {
      espaco(7)
      setCor(TINTA)
      doc.text(`-  ${limpar(ins.titulo)} [${limpar(ins.prioridade)}]`, M + 1, y)
      y += 5
    }
    y += 2
  }

  // ── Avaliações do período ────────────────────────────────────────────────
  const feedbacks = dadosRelatorio.feedbacks || []
  if (feedbacks.length > 0) {
    secao('O que os clientes escreveram')
    for (const f of feedbacks) {
      const sent = String(f.sentimento || '').toLowerCase()
      const cor = sent === 'positivo' ? VERDE : sent === 'negativo' ? VERMELHO : CINZA_NEUTRO
      const texto = limpar(f.texto_original || f.resumo || '-')
      const linhas = doc.splitTextToSize(`"${texto}"`, UTIL - 8)
      espaco(linhas.length * 4.4 + 10)
      setFundo(cor)
      doc.rect(M, y - 3.4, 1.6, linhas.length * 4.4 + 6, 'F')
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(cor[0], cor[1], cor[2])
      doc.text(`${limpar(f.categoria || 'Outros').toUpperCase()} - ${sent.toUpperCase()}`, M + 4, y)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'italic')
      setCor(TINTA)
      doc.text(linhas, M + 4, y + 4.6)
      doc.setFont('helvetica', 'normal')
      y += linhas.length * 4.4 + 9
    }
  }

  // ── Rodapé em todas as páginas ───────────────────────────────────────────
    // getNumberOfPages existe em runtime; a tipagem do jsPDF não a declara
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paginas = (doc.internal as any).getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(LINHA[0], LINHA[1], LINHA[2])
    doc.line(M, ALTURA - 14, LARGURA - M, ALTURA - 14)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    setCor(CINZA)
    doc.text(
      limpar(`${nomeRestaurante} - ${dadosRelatorio.periodo}`),
      M,
      ALTURA - 9.5,
    )
    doc.text(`Página ${i} de ${paginas}`, LARGURA / 2, ALTURA - 9.5, { align: 'center' })
    doc.text(
      analise.porIa ? 'Análise gerada por IA · Easy Feed' : 'Easy Feed',
      LARGURA - M,
      ALTURA - 9.5,
      { align: 'right' },
    )
  }

  return doc.output('blob')
}
