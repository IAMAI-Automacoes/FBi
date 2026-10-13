/**
 * Testes das versões do EasyFeed por área (src/lib/areas.ts).
 *   node --experimental-strip-types src/lib/__testes__/areas.teste.ts
 */
import {
  areaDe, AREAS, conviteDoEndereco, DEFINICOES, definicaoDa, inicioDa, itemAtivoDoMenu, lerSobreAEmpresa, LIMITES_DA_EMPRESA, linkDoConvite, MENU_DO_RH,
  numeroDeFuncionarios, RAMOS_DE_EMPRESA, RECUSA_DA_ESCOLHA, rotaPermitidaNaArea, SOBRE_A_EMPRESA_VAZIO, sobreAEmpresaNoPerfil, vocabularioDa,
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

// ── Sobre a empresa (versão RH) ──────────────────────────────────────────────
ok('ramos: lista com "Outro" no fim, sem repetição', RAMOS_DE_EMPRESA.length >= 8 && RAMOS_DE_EMPRESA.at(-1) === 'Outro' && new Set(RAMOS_DE_EMPRESA).size === RAMOS_DE_EMPRESA.length)
let emp = lerSobreAEmpresa({ ramo: '  Comércio   e varejo ', numero_funcionarios: 35, perfil_restaurante: { o_que_faz: ' Loja de materiais.\nEntrega própria. ', turnos: 'Seg a sáb,\n8h às 18h', unidades: 'Matriz e filial', estilo: 'não é meu' } })
ok('lê o perfil da empresa das colunas e do JSON', emp.ramo === 'Comércio e varejo' && emp.numero_funcionarios === '35' && emp.o_que_faz === 'Loja de materiais.\nEntrega própria.'
  && emp.turnos === 'Seg a sáb, 8h às 18h' && emp.unidades === 'Matriz e filial' && Object.keys(emp).length === 5, emp)
ok('conta sem nada preenchido (ou linha vazia): tudo vazio, sem quebrar', JSON.stringify(lerSobreAEmpresa(null)) === JSON.stringify(SOBRE_A_EMPRESA_VAZIO)
  && JSON.stringify(lerSobreAEmpresa({ ramo: null, numero_funcionarios: null, perfil_restaurante: null })) === JSON.stringify(SOBRE_A_EMPRESA_VAZIO)
  && lerSobreAEmpresa({ numero_funcionarios: 0, perfil_restaurante: 'texto' }).numero_funcionarios === '')
ok('número de funcionários: de 1 a 100.000, só dígitos', numeroDeFuncionarios('35') === 35 && numeroDeFuncionarios(' 1.200 ') === 1200 && numeroDeFuncionarios('100000') === 100000
  && numeroDeFuncionarios('') === null && numeroDeFuncionarios('0') === null && numeroDeFuncionarios('100001') === null && numeroDeFuncionarios('muitos') === null)
ok('o que vai para o JSON: só o que foi escrito, limpo e no limite', JSON.stringify(sobreAEmpresaNoPerfil({ ...SOBRE_A_EMPRESA_VAZIO, o_que_faz: '  Clínica de fisioterapia  ', turnos: '   ' })) === '{"o_que_faz":"Clínica de fisioterapia"}'
  && Object.keys(sobreAEmpresaNoPerfil(SOBRE_A_EMPRESA_VAZIO)).length === 0
  && sobreAEmpresaNoPerfil({ ...SOBRE_A_EMPRESA_VAZIO, o_que_faz: 'a'.repeat(900), unidades: 'u'.repeat(900) }).o_que_faz.length === LIMITES_DA_EMPRESA.o_que_faz
  && sobreAEmpresaNoPerfil({ ...SOBRE_A_EMPRESA_VAZIO, unidades: 'u'.repeat(900) }).unidades.length === LIMITES_DA_EMPRESA.unidades)
emp = lerSobreAEmpresa({ ramo: 'Saúde', numero_funcionarios: 12, perfil_restaurante: sobreAEmpresaNoPerfil({ ...SOBRE_A_EMPRESA_VAZIO, o_que_faz: 'Clínica', turnos: 'Manhã e tarde', unidades: 'Uma' }) })
ok('o que foi salvo volta igual na próxima leitura', emp.o_que_faz === 'Clínica' && emp.turnos === 'Manhã e tarde' && emp.unidades === 'Uma')
ok('as chaves da empresa não batem com as do perfil do restaurante (a conta do admin usa as duas)', Object.keys(sobreAEmpresaNoPerfil({ ...SOBRE_A_EMPRESA_VAZIO, o_que_faz: 'x', turnos: 'y', unidades: 'z' })).join() === 'o_que_faz,turnos,unidades')

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nversões por área: tudo certo')
process.exit(falhas ? 1 : 0)
