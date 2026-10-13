/**
 * Testes das versões do EasyFeed por área (src/lib/areas.ts).
 *   node --experimental-strip-types src/lib/__testes__/areas.teste.ts
 */
import {
  areaDe, AREAS, conviteDoEndereco, DEFINICOES, definicaoDa, inicioDa, itemAtivoDoMenu, linkDoConvite, MENU_DO_RH,
  RECUSA_DA_ESCOLHA, rotaPermitidaNaArea, vocabularioDa,
} from '../areas.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// ── A área da conta ──────────────────────────────────────────────────────────
ok('as duas versões de hoje', AREAS.join() === 'restaurante,rh' && Object.keys(DEFINICOES).join() === 'restaurante,rh')
ok('lê a área do banco', areaDe('restaurante') === 'restaurante' && areaDe('rh') === 'rh')
ok('qualquer outra coisa é "ainda não escolheu"', [null, undefined, '', 'RH', 'clinica', 1, {}].every((v) => areaDe(v) === null))
ok('conta sem versão se comporta como restaurante', definicaoDa(null).id === 'restaurante' && inicioDa(undefined) === '/' && vocabularioDa('').negocio === 'restaurante')
ok('cada versão tem nome, resumo, descrição e para quem', AREAS.every((a) => {
  const d = DEFINICOES[a]
  return d.id === a && [d.nome, d.resumo, d.descricao, d.paraQuem, d.inicio].every((t) => t.trim().length > 0)
}))
ok('onde cada versão começa', inicioDa('restaurante') === '/' && inicioDa('rh') === '/equipe')

// ── O vocabulário ────────────────────────────────────────────────────────────
const vr = vocabularioDa('restaurante')
const ve = vocabularioDa('rh')
ok('restaurante fala restaurante', vr.negocio === 'restaurante' && vr.doNegocio === 'do restaurante' && vr.seuNegocio === 'seu restaurante' && vr.nomeProvisorio === 'Meu Restaurante' && vr.quemFala === 'clientes')
ok('RH fala empresa, com o gênero certo', ve.negocio === 'empresa' && ve.Negocio === 'Empresa' && ve.doNegocio === 'da empresa' && ve.seuNegocio === 'sua empresa'
  && ve.noNegocio === 'na empresa' && ve.oNegocio === 'a empresa' && ve.quemFala === 'funcionários')
const chavesV = Object.keys(vr) as (keyof typeof vr)[]
ok('nenhuma palavra do RH fala de restaurante', chavesV.every((k) => !/restaurante/i.test(ve[k])) && !/restaurante|gar[cç]om|card[aá]pio|mesa/i.test(`${DEFINICOES.rh.descricao} ${DEFINICOES.rh.paraQuem} ${DEFINICOES.rh.resumo}`))

// ── O menu do RH ─────────────────────────────────────────────────────────────
ok('menu do RH, na ordem', MENU_DO_RH.map((i) => i.nome).join() === 'Visão Geral,Feedbacks,WhatsApp,Insights,Ações,Relatórios,Funcionários,Descontos')
ok('Descontos no RH segue a regra do restaurante: só o admin por enquanto', MENU_DO_RH.filter((i) => i.soAdmin).map((i) => i.href).join() === '/descontos')
ok('o menu do RH não tem QR Code, Garçons nem Google', !MENU_DO_RH.some((i) => /qr|gar[cç]|google/i.test(i.nome + i.href)))
ok('todo item do menu do RH é um endereço que o RH pode abrir', MENU_DO_RH.every((i) => rotaPermitidaNaArea('rh', i.href)))
ok('/equipe acende só a Visão Geral', itemAtivoDoMenu(MENU_DO_RH, '/equipe') === '/equipe')
ok('cada página acende o próprio item, não a Visão Geral', MENU_DO_RH.every((i) => itemAtivoDoMenu(MENU_DO_RH, i.href) === i.href))
ok('subpágina acende o item de cima', itemAtivoDoMenu(MENU_DO_RH, '/equipe/acoes/arquivadas') === '/equipe/acoes')
ok('página fora do menu não acende nada', itemAtivoDoMenu(MENU_DO_RH, '/configuracoes') === null && itemAtivoDoMenu(MENU_DO_RH, '/sugestoes') === null)
ok('a raiz "/" não acende em toda página (menu do restaurante)', itemAtivoDoMenu([{ nome: 'Visão Geral', href: '/' }, { nome: 'Feedbacks', href: '/feedbacks' }], '/feedbacks') === '/feedbacks'
  && itemAtivoDoMenu([{ nome: 'Visão Geral', href: '/' }], '/qrcode') === null && itemAtivoDoMenu([{ nome: 'Visão Geral', href: '/' }], '/') === '/')

// ── As rotas ─────────────────────────────────────────────────────────────────
const DE_RESTAURANTE = ['/', '/feedbacks', '/insights', '/acoes', '/acoes/arquivadas', '/relatorios', '/google', '/qrcode', '/garcons', '/missoes']
ok('restaurante abre tudo como sempre (cada página tem a própria trava)', [...DE_RESTAURANTE, '/equipe', '/equipe/feedbacks', '/whatsapp', '/configuracoes'].every((c) => rotaPermitidaNaArea('restaurante', c)))
ok('conta sem versão também não é barrada aqui', DE_RESTAURANTE.every((c) => rotaPermitidaNaArea(null, c)))
ok('RH não abre as páginas de cliente e de restaurante', DE_RESTAURANTE.every((c) => !rotaPermitidaNaArea('rh', c)), DE_RESTAURANTE.filter((c) => rotaPermitidaNaArea('rh', c)))
ok('RH abre as páginas da equipe', ['/equipe', '/equipe/feedbacks', '/equipe/insights', '/equipe/acoes', '/equipe/acoes/arquivadas', '/equipe/relatorios', '/equipe/funcionarios'].every((c) => rotaPermitidaNaArea('rh', c)))
ok('RH abre o que é comum às versões', ['/whatsapp', '/descontos', '/descontos/historico', '/descontos/indicacoes', '/configuracoes', '/minha-conta', '/sugestoes', '/assinatura', '/checkout', '/checkout/sucesso', '/onboarding', '/escolher-versao'].every((c) => rotaPermitidaNaArea('rh', c)))
ok('endereço parecido não passa (/equipex, /whatsappx)', !rotaPermitidaNaArea('rh', '/equipex') && !rotaPermitidaNaArea('rh', '/whatsappx') && !rotaPermitidaNaArea('rh', '/configuracoes-x'))

// ── O convite ────────────────────────────────────────────────────────────────
const CODIGO = '0123456789abcdef0123456789abcdef'
ok('lê o convite do endereço', JSON.stringify(conviteDoEndereco(`?area=rh&convite=${CODIGO}`)) === JSON.stringify({ area: 'rh', convite: CODIGO }))
ok('área em maiúscula e com espaço ainda vale', conviteDoEndereco(`?area=%20RH%20&convite=${CODIGO}&ref=ABC`)?.area === 'rh')
ok('sem código, sem área ou com área que não existe: não é convite', conviteDoEndereco('?area=rh') === null && conviteDoEndereco(`?convite=${CODIGO}`) === null
  && conviteDoEndereco(`?area=clinica&convite=${CODIGO}`) === null && conviteDoEndereco('') === null)
ok('código malformado não passa', conviteDoEndereco('?area=rh&convite=abc') === null && conviteDoEndereco('?area=rh&convite=tem%20espaco%20aqui') === null
  && conviteDoEndereco(`?area=rh&convite=${'a'.repeat(65)}`) === null && conviteDoEndereco('?area=rh&convite=<script>alert(1)</script>') === null)
const link = linkDoConvite('https://easyfeed.com.br/', CODIGO)
ok('o link do convite abre o cadastro', link === `https://easyfeed.com.br/cadastro?area=rh&convite=${CODIGO}`)
ok('e a tela lê de volta o mesmo convite', conviteDoEndereco(new URL(link).search)?.convite === CODIGO)

// ── As recusas ───────────────────────────────────────────────────────────────
ok('toda recusa do banco tem frase', ['convite_invalido', 'ja_escolhida', 'area_invalida', 'sem_conta'].every((m) => (RECUSA_DA_ESCOLHA[m] ?? '').length > 10))

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nversões por área: tudo certo')
process.exit(falhas ? 1 : 0)
