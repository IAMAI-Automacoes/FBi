import {
  paraDigitosNacionais,
  dividirTelefone,
  paraCanonico,
  editarDdd,
  editarNumero,
  apagarAntesDoNumero,
  colarTelefone,
  coladoValeDistribuir,
  formatarExibicaoTelefone,
  telefoneNacionalValido,
  type PartesTelefone,
} from '../telefone.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}
const partes = (p: PartesTelefone) => `${p.ddd}|${p.numero}`

// ---------------------------------------------------------------------------
// Leitura de um valor guardado
// ---------------------------------------------------------------------------
{
  ok('canônico de celular vira DDD + número', partes(dividirTelefone('5511987654321')) === '11|987654321')
  ok('canônico de fixo (8 dígitos) também', partes(dividirTelefone('551133334444')) === '11|33334444')
  ok('vazio não vira nada', partes(dividirTelefone('')) === '|')
  ok('null não quebra', partes(dividirTelefone(null)) === '|')
  ok('valor com máscara antiga ainda é lido', partes(dividirTelefone('(11) 98765-4321')) === '11|987654321')
  // DDD 55 existe de verdade (Santa Maria/RS) — não pode ser confundido com
  // código de país e sumir.
  ok('DDD 55 nacional é preservado', paraDigitosNacionais('55991234567') === '55991234567')
  ok('55 do país é removido quando há mais dígitos', paraDigitosNacionais('5555991234567') === '55991234567')
}

// ---------------------------------------------------------------------------
// O BUG 1 reportado: apagar no DDD puxava dígito do número pra dentro dele.
// ---------------------------------------------------------------------------
{
  const cheio: PartesTelefone = { ddd: '11', numero: '987654321' }

  const apagouUmDoDdd = editarDdd(cheio, '1')
  ok('apagar 1 dígito do DDD não mexe no número', partes(apagouUmDoDdd) === '1|987654321', partes(apagouUmDoDdd))

  const limpouODdd = editarDdd(cheio, '')
  ok('limpar o DDD inteiro deixa o número intacto', partes(limpouODdd) === '|987654321', partes(limpouODdd))
  ok('limpar o DDD NÃO faz o "55" virar DDD', limpouODdd.ddd !== '55', limpouODdd.ddd)

  // Com DDD incompleto nada é emitido pra fora: um valor guardado sem os 2
  // dígitos de DDD seria ambíguo na hora de reler (ver `paraCanonico`).
  ok('DDD incompleto não emite valor', paraCanonico('1', '987654321') === '')
  ok('sem DDD não emite valor', paraCanonico('', '987654321') === '')
  ok('com DDD completo emite normal', paraCanonico('11', '987654321') === '5511987654321')
}

// ---------------------------------------------------------------------------
// O BUG 2 reportado: apagar não apagava "de verdade" tudo.
// Segurar backspace tem que limpar número + DDD, um dígito por tecla, e parar
// sozinho sem nunca comer o "55".
// ---------------------------------------------------------------------------
{
  let p: PartesTelefone = { ddd: '11', numero: '987654321' }

  // Apaga o número dígito a dígito (é o navegador que faz isso; aqui é o
  // texto que o input entregaria a cada backspace).
  for (let i = p.numero.length; i > 0; i--) {
    p = editarNumero(p, p.numero.slice(0, i - 1))
  }
  ok('backspaces limpam o número inteiro', partes(p) === '11|', partes(p))

  // Agora o número está vazio: cada backspace come um dígito do DDD.
  p = apagarAntesDoNumero(p)
  ok('backspace no número vazio apaga 1 dígito do DDD', partes(p) === '1|', partes(p))
  p = apagarAntesDoNumero(p)
  ok('mais um backspace zera o DDD', partes(p) === '|', partes(p))

  // E aqui é onde tem que PARAR: não existe mais nada pra apagar.
  p = apagarAntesDoNumero(p)
  ok('backspace com tudo vazio não quebra nem inventa dígito', partes(p) === '|', partes(p))
  ok('campo totalmente vazio emite "" (não "55")', paraCanonico(p.ddd, p.numero) === '')
}

// ---------------------------------------------------------------------------
// Digitação normal
// ---------------------------------------------------------------------------
{
  let p: PartesTelefone = { ddd: '', numero: '' }
  p = editarDdd(p, '1')
  ok('primeiro dígito do DDD', partes(p) === '1|')
  p = editarDdd(p, '11')
  ok('DDD completo', partes(p) === '11|')
  p = editarDdd(p, '119')
  ok('DDD não passa de 2 dígitos', partes(p) === '11|', partes(p))
  p = editarNumero(p, '98765')
  ok('número vai sendo digitado', partes(p) === '11|98765')
  p = editarNumero(p, '9876543210')
  ok('número não passa de 9 dígitos', partes(p) === '11|987654321', partes(p))
  ok('valor final canônico', paraCanonico(p.ddd, p.numero) === '5511987654321')

  ok('letra digitada é ignorada', partes(editarNumero({ ddd: '11', numero: '' }, 'abc9')) === '11|9')
  ok('máscara digitada à mão é ignorada', partes(editarNumero({ ddd: '11', numero: '' }, '9-8 7')) === '11|987')
}

// ---------------------------------------------------------------------------
// Colar
// ---------------------------------------------------------------------------
{
  ok('cola número completo com 55', partes(colarTelefone('5511987654321')) === '11|987654321')
  ok('cola número sem 55', partes(colarTelefone('11987654321')) === '11|987654321')
  ok('cola número com máscara', partes(colarTelefone('(11) 98765-4321')) === '11|987654321')
  ok('cola com +55 e espaços', partes(colarTelefone('+55 11 98765 4321')) === '11|987654321')
  ok('colagem de 1-2 dígitos não é distribuída', coladoValeDistribuir('9') === false && coladoValeDistribuir('98') === false)
  ok('colagem de 3+ dígitos é distribuída', coladoValeDistribuir('987') === true)
}

// ---------------------------------------------------------------------------
// Validação e exibição
// ---------------------------------------------------------------------------
{
  ok('celular (11 dígitos) é válido', telefoneNacionalValido('5511987654321') === true)
  ok('fixo (10 dígitos) é válido', telefoneNacionalValido('551133334444') === true)
  ok('DDD sozinho não é válido', telefoneNacionalValido('5511') === false)
  ok('vazio não é válido', telefoneNacionalValido('') === false)
  ok('número incompleto não é válido', telefoneNacionalValido('55119876') === false)

  ok('exibição completa', formatarExibicaoTelefone('5511987654321') === '55 (11) 987654321')
  ok('exibição de vazio é vazia', formatarExibicaoTelefone('') === '')
  ok('exibição de só DDD', formatarExibicaoTelefone('5511') === '55 (11)')
}

// ---------------------------------------------------------------------------
// Ida e volta: o que a tela mostra tem que sobreviver a guardar e reabrir.
// ---------------------------------------------------------------------------
{
  const casos = ['5511987654321', '551133334444', '5555991234567']
  for (const canonico of casos) {
    const p = dividirTelefone(canonico)
    ok(`ida e volta preserva ${canonico}`, paraCanonico(p.ddd, p.numero) === canonico, paraCanonico(p.ddd, p.numero))
  }

  // A garantia que sustenta tudo: QUALQUER par (DDD, número) que o campo
  // consiga emitir volta separado exatamente igual — inclusive DDD 55 e
  // números de tamanhos diferentes, que eram justamente os casos capazes de
  // confundir o código de país com o DDD.
  const dddsDeTeste = ['11', '55', '99', '21']
  const numerosDeTeste = ['', '9', '1234567', '33334444', '987654321']
  for (const d of dddsDeTeste) {
    for (const n of numerosDeTeste) {
      const canonico = paraCanonico(d, n)
      const volta = dividirTelefone(canonico)
      ok(
        `ida e volta de (${d}, ${n || 'vazio'})`,
        volta.ddd === d && volta.numero === n,
        `${canonico} -> ${partes(volta)}`,
      )
    }
  }
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
