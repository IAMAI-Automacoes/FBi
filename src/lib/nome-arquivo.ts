/**
 * Transforma um nome digitado pelo dono ("Rogério", "Ana Paula") em algo
 * seguro pra usar como nome de arquivo baixado: sem acento, sem espaço, sem
 * caractere que o Windows recusa (`\ / : * ? " < > |`).
 *
 * Fica em arquivo próprio, sem nenhum import, pra poder ser testado no Node
 * — o resto do caminho de download (canvas, jsPDF) só roda em navegador.
 */
export function nomeDeArquivoSeguro(texto: string, reserva = 'arquivo'): string {
  const limpo = (texto ?? '')
    .normalize('NFD')
    // Faixa dos acentos combinantes que o NFD separa das letras.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return limpo || reserva
}
