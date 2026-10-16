/**
 * UUID v4 que funciona também fora de HTTPS.
 *
 * `crypto.randomUUID` só existe em contexto seguro (HTTPS ou localhost). Aberto
 * pelo IP da rede — `npm start` mostra o endereço "Network", que é o que se usa
 * para testar no celular — ele é `undefined` e a tela quebrava com
 * "crypto.randomUUID is not a function". `crypto.getRandomValues` existe nos
 * dois casos e dá o mesmo formato (o banco recebe estes ids em colunas uuid).
 */
export function novoUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // versão 4
  b[8] = (b[8] & 0x3f) | 0x80 // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
