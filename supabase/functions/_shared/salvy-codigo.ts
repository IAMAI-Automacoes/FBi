// O código de verificação do WhatsApp dentro de um SMS recebido pela Salvy.
//
// A Salvy já detecta o código e manda em `detections.whatsapp.verificationCode`.
// Quando a detecção não vem (formato novo de SMS, por exemplo), procura no
// texto — mas só se o SMS fala de WhatsApp: o número virtual recebe spam e SMS
// de outros serviços, e nenhum deles pode virar "código do WhatsApp".

import type { Deteccoes } from './salvy.ts'

/** Só os dígitos; código de verificação tem de 4 a 8. */
function soDigitos(valor: unknown): string | null {
  const d = String(valor ?? '').replace(/\D/g, '')
  return d.length >= 4 && d.length <= 8 ? d : null
}

/** "123456" a partir de "Seu código do WhatsApp: 123-456", ou null. */
export function codigoDoWhatsapp(sms: { message?: string | null; detections?: Deteccoes | null }): string | null {
  const daSalvy = soDigitos(sms.detections?.whatsapp?.verificationCode)
  if (daSalvy) return daSalvy

  const texto = String(sms.message ?? '')
  if (!/whats\s*app/i.test(texto)) return null
  // O WhatsApp manda 6 dígitos, em bloco ("123456") ou em dois de três
  // ("123-456", "123 456"). Os limites evitam pegar pedaço de número maior.
  const achado = texto.match(/(?<!\d)(\d{3})[-\s]?(\d{3})(?!\d)/)
  return achado ? achado[1] + achado[2] : null
}
