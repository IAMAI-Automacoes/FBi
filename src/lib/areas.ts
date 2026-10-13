/* As versões do EasyFeed, por área de atuação. Sem React e sem banco aqui.
 *
 * Cada conta tem uma área (`restaurantes.area`), escolhida logo depois de criar
 * e-mail e senha:
 *   - restaurante: o produto de sempre (feedback dos clientes);
 *   - rh: feedback dos funcionários, para qualquer empresa.
 *
 * O código é UM só. O que muda de uma versão para a outra (menu, página
 * inicial, rotas, palavras) sai desta lista. Uma versão nova é uma entrada nova
 * aqui, mais o que for só dela.
 *
 * As páginas do RH são as de /equipe: é o endereço que faz o banco entregar só
 * o que os funcionários falaram (ver `publico-rota.ts`). Na conta RH o menu
 * lateral aponta direto para elas.
 *
 * Quem decide e guarda é o banco (migration 20261019000000_area_da_conta.sql).
 */

export type Area = 'restaurante' | 'rh'

export const AREAS: readonly Area[] = ['restaurante', 'rh']

/** A área como veio do banco; qualquer outra coisa (inclusive vazio) é "ainda não escolheu". */
export const areaDe = (v: unknown): Area | null => (v === 'restaurante' || v === 'rh' ? v : null)

/** Como a versão chama o negócio de quem assina. */
export interface Vocabulario {
  /** "restaurante" / "empresa". */
  negocio: string
  /** Com maiúscula: "Restaurante" / "Empresa". */
  Negocio: string
  /** "do restaurante" / "da empresa". */
  doNegocio: string
  /** "seu restaurante" / "sua empresa". */
  seuNegocio: string
  /** "no restaurante" / "na empresa". */
  noNegocio: string
  /** "o restaurante" / "a empresa". */
  oNegocio: string
  /** Nome provisório da conta até o onboarding. */
  nomeProvisorio: string
  /** Quem dá o feedback que a versão ouve: "clientes" / "funcionários". */
  quemFala: string
}

export interface ItemDoMenu { nome: string; href: string; /** Só o admin da plataforma vê, por enquanto. */ soAdmin?: boolean }

export interface DefinicaoDaArea {
  id: Area
  /** O nome na tela de escolha e no painel do admin. */
  nome: string
  /** Uma linha: o que a versão faz. */
  resumo: string
  /** O texto do cartão da tela de escolha. */
  descricao: string
  /** Para quem é. */
  paraQuem: string
  /** A página que abre depois de entrar. */
  inicio: string
  vocabulario: Vocabulario
}

export const DEFINICOES: Record<Area, DefinicaoDaArea> = {
  restaurante: {
    id: 'restaurante',
    nome: 'Restaurante',
    resumo: 'Feedback dos clientes',
    descricao: 'Seus clientes avaliam pelo WhatsApp e a IA mostra o que elogiam, do que reclamam e o que fazer a respeito.',
    paraQuem: 'Para restaurantes, bares, lanchonetes e cafés.',
    inicio: '/',
    vocabulario: {
      negocio: 'restaurante', Negocio: 'Restaurante', doNegocio: 'do restaurante', seuNegocio: 'seu restaurante',
      noNegocio: 'no restaurante', oNegocio: 'o restaurante', nomeProvisorio: 'Meu Restaurante', quemFala: 'clientes',
    },
  },
  rh: {
    id: 'rh',
    nome: 'RH',
    resumo: 'Feedback dos funcionários',
    descricao: 'Sua equipe fala pelo WhatsApp, com a opção de ficar anônima, e a IA mostra o que está pesando no dia a dia e o que fazer a respeito.',
    paraQuem: 'Para qualquer empresa que tem equipe.',
    inicio: '/equipe',
    vocabulario: {
      negocio: 'empresa', Negocio: 'Empresa', doNegocio: 'da empresa', seuNegocio: 'sua empresa',
      noNegocio: 'na empresa', oNegocio: 'a empresa', nomeProvisorio: 'Minha Empresa', quemFala: 'funcionários',
    },
  },
}

/** A definição da área da conta. Conta que ainda não escolheu se comporta como restaurante. */
export function definicaoDa(area: unknown): DefinicaoDaArea {
  return DEFINICOES[areaDe(area) ?? 'restaurante']
}

export const vocabularioDa = (area: unknown): Vocabulario => definicaoDa(area).vocabulario

// ── O menu lateral da versão RH ──────────────────────────────────────────────
// (O do restaurante continua em AppSidebar.tsx, como sempre foi.)
export const MENU_DO_RH: readonly ItemDoMenu[] = [
  { nome: 'Visão Geral', href: '/equipe' },
  { nome: 'Feedbacks', href: '/equipe/feedbacks' },
  { nome: 'WhatsApp', href: '/whatsapp' },
  { nome: 'Insights', href: '/equipe/insights' },
  { nome: 'Ações', href: '/equipe/acoes' },
  { nome: 'Relatórios', href: '/equipe/relatorios' },
  { nome: 'Funcionários', href: '/equipe/funcionarios' },
  // A mesma página Descontos do restaurante (vídeos e indicações), com a mesma
  // regra: só o admin da plataforma por enquanto.
  { nome: 'Descontos', href: '/descontos', soAdmin: true },
]

/**
 * O item do menu que a página aberta acende. Vale o endereço mais específico:
 * "/equipe/acoes/arquivadas" acende Ações, e "/equipe" sozinho acende a Visão
 * Geral (sem isso ela ficaria acesa em todas as páginas do RH).
 */
export function itemAtivoDoMenu(itens: readonly ItemDoMenu[], caminho: string): string | null {
  const achado = [...itens]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => caminho === i.href || (i.href !== '/' && caminho.startsWith(`${i.href}/`)))
  return achado?.href ?? null
}

// ── As rotas de cada versão ──────────────────────────────────────────────────
/** O que a conta RH abre além das páginas /equipe. */
const ROTAS_COMUNS = ['/whatsapp', '/descontos', '/configuracoes', '/minha-conta', '/sugestoes', '/assinatura', '/checkout', '/onboarding', '/admin', '/escolher-versao']

const dentroDe = (raiz: string, caminho: string) => caminho === raiz || caminho.startsWith(`${raiz}/`)

/**
 * A conta desta área pode abrir este endereço?
 * Restaurante: tudo como sempre (cada página tem a própria trava, e a Equipe
 * continua só para o admin). RH: só as páginas da equipe e as comuns (WhatsApp,
 * Descontos, Configurações…); QR Code, Garçons, Google e as páginas de cliente
 * não existem nessa versão.
 */
export function rotaPermitidaNaArea(area: unknown, caminho: string): boolean {
  if (areaDe(area) !== 'rh') return true
  return dentroDe('/equipe', caminho) || ROTAS_COMUNS.some((r) => dentroDe(r, caminho))
}

/** Para onde vai quem abriu um endereço que a versão não tem. */
export const inicioDa = (area: unknown): string => definicaoDa(area).inicio

// ── O convite do RH ──────────────────────────────────────────────────────────
/** Por enquanto o RH é por convite: o link do admin traz `?area=rh&convite=CODIGO`. */
export interface ConviteDeArea { area: Area; convite: string }

const CONVITE_VALIDO = /^[A-Za-z0-9_-]{8,64}$/

/** Lê o convite do endereço ("?area=rh&convite=abc…"). Sem os dois, ou malformado, não é convite. */
export function conviteDoEndereco(busca: string): ConviteDeArea | null {
  const q = new URLSearchParams(busca)
  const area = areaDe(q.get('area')?.trim().toLowerCase())
  const convite = q.get('convite')?.trim() ?? ''
  if (!area || !CONVITE_VALIDO.test(convite)) return null
  return { area, convite }
}

/** O link que o admin manda para alguém criar uma conta RH. */
export function linkDoConvite(site: string, convite: string, area: Area = 'rh'): string {
  return `${site.replace(/\/+$/, '')}/cadastro?area=${area}&convite=${encodeURIComponent(convite)}`
}

/** O que o banco pode recusar na escolha, por extenso. */
export const RECUSA_DA_ESCOLHA: Record<string, string> = {
  convite_invalido: 'Este link de convite não vale mais. Peça um novo a quem enviou.',
  ja_escolhida: 'Esta conta já tem uma versão. Para trocar, fale com o suporte.',
  area_invalida: 'Essa versão não existe.',
  sem_conta: 'Não achamos a sua conta. Recarregue a página e tente de novo.',
}

// ── Versão RH: o perfil da empresa (Configurações → Sobre a empresa) ─────────
/** Os ramos que o onboarding e as Configurações oferecem. */
export const RAMOS_DE_EMPRESA: readonly string[] = [
  'Comércio e varejo', 'Serviços', 'Saúde', 'Educação', 'Indústria', 'Tecnologia', 'Construção',
  'Transporte e logística', 'Alimentação', 'Hotelaria e turismo', 'Outro',
]

/**
 * O que a empresa conta sobre si. A IA usa como contexto ao ler o feedback da
 * equipe e ao sugerir ações. `ramo` e `numero_funcionarios` são colunas de
 * `restaurantes`; os outros três ficam em `perfil_restaurante` (jsonb).
 */
export interface SobreAEmpresa {
  ramo: string
  /** Texto do campo (só dígitos); '' = não informado. */
  numero_funcionarios: string
  o_que_faz: string
  turnos: string
  unidades: string
}

export const SOBRE_A_EMPRESA_VAZIO: SobreAEmpresa = { ramo: '', numero_funcionarios: '', o_que_faz: '', turnos: '', unidades: '' }

export const LIMITES_DA_EMPRESA = { o_que_faz: 500, turnos: 200, unidades: 200, funcionarios: 100000 } as const

const umaLinha = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Lê o perfil da empresa da linha de `restaurantes` (colunas + jsonb). */
export function lerSobreAEmpresa(linha: { ramo?: unknown; numero_funcionarios?: unknown; perfil_restaurante?: unknown } | null | undefined): SobreAEmpresa {
  const p = (linha?.perfil_restaurante && typeof linha.perfil_restaurante === 'object' ? linha.perfil_restaurante : {}) as Record<string, unknown>
  const n = Number(linha?.numero_funcionarios)
  return {
    ramo: umaLinha(linha?.ramo, 80),
    numero_funcionarios: Number.isInteger(n) && n > 0 ? String(n) : '',
    o_que_faz: String(p.o_que_faz ?? '').trim().slice(0, LIMITES_DA_EMPRESA.o_que_faz),
    turnos: umaLinha(p.turnos, LIMITES_DA_EMPRESA.turnos),
    unidades: umaLinha(p.unidades, LIMITES_DA_EMPRESA.unidades),
  }
}

/** O número de funcionários como o banco aceita (1 a 100.000), ou null. */
export function numeroDeFuncionarios(texto: string): number | null {
  const n = Number(String(texto).replace(/\D/g, ''))
  return Number.isInteger(n) && n >= 1 && n <= LIMITES_DA_EMPRESA.funcionarios ? n : null
}

/** As três chaves que vão para `perfil_restaurante`, já limpas (vazio não é gravado). */
export function sobreAEmpresaNoPerfil(e: SobreAEmpresa): Record<string, string> {
  const pares: [string, string][] = [
    ['o_que_faz', e.o_que_faz.trim().slice(0, LIMITES_DA_EMPRESA.o_que_faz)],
    ['turnos', umaLinha(e.turnos, LIMITES_DA_EMPRESA.turnos)],
    ['unidades', umaLinha(e.unidades, LIMITES_DA_EMPRESA.unidades)],
  ]
  return Object.fromEntries(pares.filter(([, v]) => v !== ''))
}
