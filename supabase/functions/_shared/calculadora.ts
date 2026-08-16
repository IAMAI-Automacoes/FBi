/**
 * Calculadora determinística exposta à IA via function-calling (ver `chamarIA`
 * em `./openrouter.ts`). O objetivo é que a IA NUNCA faça conta de cabeça
 * (porcentagem, soma, diferença de dias etc.) — ela chama esta ferramenta e o
 * resultado vem de código, não de texto gerado, então não tem como alucinar.
 *
 * `calcular()` é um parser aritmético escrito à mão (recursive descent) — de
 * propósito, em vez de `eval`/`Function`: só aceita dígitos e os operadores
 * `+ - * / % ( )`, então não há como a IA injetar código através da expressão.
 */

function calcularExpressao(expressao: string): number {
  const s = String(expressao).trim()
  if (!s) throw new Error('expressão vazia')
  if (s.length > 200) throw new Error('expressão longa demais')
  if (!/^[0-9+\-*/%().\s]+$/.test(s)) {
    throw new Error('expressão contém caracteres não permitidos (use apenas números e + - * / % ( ))')
  }

  let i = 0
  const espiar = () => s[i]
  const consumirEspacos = () => {
    while (i < s.length && /\s/.test(s[i])) i++
  }

  function numero(): number {
    consumirEspacos()
    const inicio = i
    while (i < s.length && /[0-9.]/.test(s[i])) i++
    if (i === inicio) throw new Error(`número esperado na posição ${i}`)
    const v = Number(s.slice(inicio, i))
    if (!Number.isFinite(v)) throw new Error(`número inválido: "${s.slice(inicio, i)}"`)
    return v
  }

  function fator(): number {
    consumirEspacos()
    if (espiar() === '(') {
      i++
      const v = expressaoInterna()
      consumirEspacos()
      if (espiar() !== ')') throw new Error('parêntese não fechado')
      i++
      return v
    }
    if (espiar() === '-') {
      i++
      return -fator()
    }
    if (espiar() === '+') {
      i++
      return fator()
    }
    return numero()
  }

  function termo(): number {
    let v = fator()
    for (;;) {
      consumirEspacos()
      const op = espiar()
      if (op === '*' || op === '/' || op === '%') {
        i++
        const d = fator()
        if (op === '*') v *= d
        else if (op === '/') {
          if (d === 0) throw new Error('divisão por zero')
          v /= d
        } else {
          if (d === 0) throw new Error('módulo por zero')
          v %= d
        }
      } else break
    }
    return v
  }

  function expressaoInterna(): number {
    let v = termo()
    for (;;) {
      consumirEspacos()
      const op = espiar()
      if (op === '+' || op === '-') {
        i++
        const d = termo()
        v = op === '+' ? v + d : v - d
      } else break
    }
    return v
  }

  const resultado = expressaoInterna()
  consumirEspacos()
  if (i !== s.length) throw new Error(`expressão mal formada na posição ${i}`)
  if (!Number.isFinite(resultado)) throw new Error('resultado inválido')
  return resultado
}

/** Dias corridos entre duas datas AAAA-MM-DD (positivo = `ate` é depois de `de`). */
function diferencaDias(de: string, ate: string): number {
  const d1 = new Date(`${de}T00:00:00Z`)
  const d2 = new Date(`${ate}T00:00:00Z`)
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) {
    throw new Error('datas inválidas — use o formato AAAA-MM-DD')
  }
  return Math.round((d2.getTime() - d1.getTime()) / 86400000)
}

/** Definição da ferramenta no formato de function-calling do OpenRouter/OpenAI. */
export const FERRAMENTA_CALCULADORA = {
  type: 'function',
  function: {
    name: 'calcular',
    description:
      'Calculadora e utilitário de datas. Use SEMPRE que precisar fazer qualquer conta — ' +
      'porcentagem, soma, subtração, média, diferença de dias entre datas etc. — em vez de ' +
      'calcular de cabeça. Pode chamar mais de uma vez na mesma resposta.',
    parameters: {
      type: 'object',
      properties: {
        expressao: {
          type: 'string',
          description:
            'Expressão aritmética a avaliar, ex: "(45/120)*100" para porcentagem, ou "340*0.15". ' +
            'Suporta + - * / % e parênteses.',
        },
        diferenca_dias: {
          type: 'object',
          description: 'Quantidade de dias entre duas datas.',
          properties: {
            de: { type: 'string', description: 'Data inicial, formato AAAA-MM-DD' },
            ate: { type: 'string', description: 'Data final, formato AAAA-MM-DD' },
          },
        },
      },
    },
  },
} as const

/** Executa a chamada da ferramenta (argumentos vêm como string JSON da IA). */
export function executarFerramentaCalculadora(argsBrutos: string): string {
  // deno-lint-ignore no-explicit-any
  let args: any
  try {
    args = JSON.parse(argsBrutos || '{}')
  } catch {
    return JSON.stringify({ erro: 'argumentos inválidos (JSON malformado)' })
  }
  try {
    if (typeof args.expressao === 'string' && args.expressao.trim()) {
      return JSON.stringify({ resultado: calcularExpressao(args.expressao) })
    }
    if (args.diferenca_dias && typeof args.diferenca_dias === 'object') {
      const { de, ate } = args.diferenca_dias
      return JSON.stringify({ dias: diferencaDias(String(de), String(ate)) })
    }
    return JSON.stringify({ erro: 'informe "expressao" ou "diferenca_dias"' })
  } catch (err) {
    return JSON.stringify({ erro: err instanceof Error ? err.message : String(err) })
  }
}
