import { addDays, differenceInCalendarDays, startOfDay, subDays } from 'date-fns'

/**
 * O período que o dono escolhe na aba de Informações do QR Code.
 *
 * São "últimos 7 dias" e não "esta semana" — a diferença importa. Numa
 * segunda-feira, "esta semana" mostra um dia só, e o gráfico despenca sem que
 * nada tenha acontecido no restaurante; na quinta ele mostra quatro. Uma
 * janela que muda de tamanho conforme o dia não se compara com nada, nem com
 * ela mesma na véspera. "Últimos 7 dias" é sempre do mesmo tamanho.
 *
 * É também o que o resto do app já faz (`getPeriodDates` na Visão Geral usa
 * `subDays`), e duas telas com a mesma palavra medindo coisas diferentes é
 * pior que qualquer uma das duas escolhas.
 */
export type PeriodoQr = '7d' | '30d' | 'tudo'

/** Quantos dias cada janela fechada cobre. `tudo` não tem tamanho fixo. */
export const DIAS_DO_PERIODO: Record<Exclude<PeriodoQr, 'tudo'>, number> = {
  '7d': 7,
  '30d': 30,
}

export const ROTULO_DO_PERIODO: Record<PeriodoQr, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  tudo: 'Tudo',
}

/** Acima disto, um ponto por dia vira uma serra ilegível — passa a semanal. */
export const MAX_PONTOS_DIARIOS = 31

/** Menor teto do eixo vertical, pra um período vazio não virar uma régua 0–0. */
const TETO_MINIMO = 4

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export interface PontoDeAbertura {
  /** O que sai no eixo X. */
  label: string
  /** Primeiro dia do balde — usado no balão do tooltip. */
  inicio: Date
  /** Último dia do balde (igual ao início quando é diário). */
  fim: Date
  aberturas: number
  /**
   * O último balde, que ainda está correndo.
   *
   * Importa dizer isso na tela: uma semana que começou anteontem soma dois
   * dias contra sete das anteriores e desenha uma queda que não existe. Quem
   * olhar o gráfico sem esse aviso conclui que o movimento despencou.
   */
  emAndamento: boolean
}

export interface SerieDeAberturas {
  pontos: PontoDeAbertura[]
  /** Aberturas dentro do período escolhido. */
  total: number
  /**
   * Aberturas na janela anterior, do mesmo tamanho. `null` em `tudo`, que não
   * tem "anterior" — é o começo de tudo.
   */
  anterior: number | null
  porSemana: boolean
  /** Dia da primeira abertura registrada, ou `null` se nunca houve uma. */
  primeiraAbertura: Date | null
}

function rotulo(inicio: Date, diasNaJanela: number, porSemana: boolean): string {
  // Numa janela de uma semana, o dia da semana diz mais que a data: o dono
  // reconhece "sábado" sem fazer conta, e é sábado que ele quer comparar com
  // sábado. Em janelas longas o dia da semana se repete e deixa de localizar.
  if (!porSemana && diasNaJanela <= 7) return DIAS_DA_SEMANA[inicio.getDay()]
  const dia = String(inicio.getDate()).padStart(2, '0')
  const mes = String(inicio.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}`
}

/**
 * Transforma os instantes de cada abertura na série que o gráfico desenha.
 *
 * Recebe as datas já carregadas em vez de ir ao banco: assim a regra toda é
 * testável sem subir nada, que é o ponto de ela morar aqui e não na página.
 */
export function montarSerie(
  datas: Date[],
  periodo: PeriodoQr,
  agora: Date = new Date(),
): SerieDeAberturas {
  const hoje = startOfDay(agora)
  const ordenadas = [...datas].sort((a, b) => a.getTime() - b.getTime())
  const primeiraAbertura = ordenadas.length > 0 ? startOfDay(ordenadas[0]) : null

  // O primeiro dia do gráfico. Em `tudo`, a primeira abertura de todas — e o
  // dia de hoje quando ainda não houve nenhuma, pra série nunca sair vazia.
  let inicio: Date
  if (periodo === 'tudo') {
    inicio = primeiraAbertura ?? hoje
  } else {
    inicio = subDays(hoje, DIAS_DO_PERIODO[periodo] - 1)
  }
  if (inicio > hoje) inicio = hoje

  const diasNaJanela = differenceInCalendarDays(hoje, inicio) + 1
  const porSemana = diasNaJanela > MAX_PONTOS_DIARIOS
  const passo = porSemana ? 7 : 1

  const pontos: PontoDeAbertura[] = []
  for (let d = 0; d < diasNaJanela; d += passo) {
    const ini = addDays(inicio, d)
    // O último balde é aparado em hoje: uma semana que ainda não terminou não
    // deve parecer completa nem contar dias que ainda não existem.
    const fim = addDays(ini, Math.min(passo - 1, diasNaJanela - 1 - d))
    pontos.push({
      label: rotulo(ini, diasNaJanela, porSemana),
      inicio: ini,
      fim,
      aberturas: 0,
      emAndamento: d + passo >= diasNaJanela,
    })
  }

  // Um índice por dia decidido uma vez: com um scan por linha, procurar o
  // balde de cada data numa varredura daria O(n × baldes).
  const indicePorDia = new Map<number, number>()
  pontos.forEach((p, i) => {
    for (let d = new Date(p.inicio); d <= p.fim; d = addDays(d, 1)) {
      indicePorDia.set(startOfDay(d).getTime(), i)
    }
  })

  let total = 0
  for (const data of ordenadas) {
    const i = indicePorDia.get(startOfDay(data).getTime())
    if (i === undefined) continue
    pontos[i].aberturas++
    total++
  }

  let anterior: number | null = null
  if (periodo !== 'tudo') {
    const dias = DIAS_DO_PERIODO[periodo]
    const inicioAnterior = subDays(inicio, dias)
    anterior = ordenadas.filter((d) => {
      const dia = startOfDay(d)
      return dia >= inicioAnterior && dia < inicio
    }).length
  }

  return { pontos, total, anterior, porSemana, primeiraAbertura }
}

/**
 * O teto e as marcas do eixo vertical.
 *
 * Deixar o recharts escolher sozinho dava régua torta — com pico 5 ele
 * marcava 0, 2 e 5; com 11, marcava 0, 3, 6 e 11. Marcas em distâncias
 * desiguais fazem a altura da curva mentir, porque o olho mede pelo
 * espaçamento e não pelo número escrito.
 *
 * São sempre inteiros: meia abertura não existe.
 */
export function escalaDoEixo(maximo: number): { teto: number; marcas: number[] } {
  // Sem piso, uma semana zerada desenharia uma régua de 0 a 0.
  const alvo = Math.max(TETO_MINIMO, Math.ceil(maximo))
  const passo = Math.max(1, Math.ceil(alvo / 4))
  const teto = passo * Math.ceil(alvo / passo)
  const marcas: number[] = []
  for (let v = 0; v <= teto; v += passo) marcas.push(v)
  return { teto, marcas }
}

/**
 * A variação contra a janela anterior, no formato que o `TrendIndicator`
 * espera — os mesmos limites que a Visão Geral usa (`visao-geral.ts`), pra
 * seta e cor quererem dizer a mesma coisa nas duas telas.
 */
export function tendenciaDeAberturas(total: number, anterior: number | null) {
  const temAnterior = (anterior ?? 0) > 0
  if (anterior === null || !temAnterior) {
    return {
      trend: total > 0 ? 'novo' : '—',
      hasPrevData: false,
      // Comparar 3 contra 1 vira "+200%" e engana; o corte é o da Visão Geral.
      prevConfiavel: false,
      prevTotal: anterior ?? undefined,
    }
  }
  const v = Math.round(((total - anterior) / anterior) * 100)
  return {
    trend: v === 0 ? 'estável' : `${v >= 0 ? '+' : ''}${v}%`,
    hasPrevData: true,
    prevConfiavel: anterior >= 3,
    prevTotal: anterior,
  }
}
