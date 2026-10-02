import { fotoValida, linhaSuporte, linhaWhatsapp, resumo, rotuloAnexos } from '../notificacoes.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}
const igual = (nome: string, real: unknown, esperado: unknown) =>
  ok(nome, JSON.stringify(real) === JSON.stringify(esperado), `${JSON.stringify(real)} ≠ ${JSON.stringify(esperado)}`)

// ---------------------------------------------------------------------------
// Anexos do suporte (caminhos do storage)
// ---------------------------------------------------------------------------
igual('sem anexo', rotuloAnexos([]), null)
igual('anexo nulo', rotuloAnexos(null), null)
igual('uma foto', rotuloAnexos(['c04a/1786-IMG-WA0073.jpg']), '📷 Foto')
igual('um PDF', rotuloAnexos(['x/cardapio.PDF']), '📄 PDF')
igual('um vídeo', rotuloAnexos(['x/v.mp4']), '🎥 Vídeo')
igual('um áudio', rotuloAnexos(['x/a.ogg']), '🎤 Áudio')
igual('arquivo qualquer', rotuloAnexos(['x/planilha.xlsx']), '📎 Arquivo')
igual('3 fotos', rotuloAnexos(['a.png', 'b.webp', 'c.jpeg']), '📷 3 fotos')
igual('misturado', rotuloAnexos(['a.png', 'b.pdf']), '📎 2 arquivos')

// ---------------------------------------------------------------------------
// Linha do suporte
// ---------------------------------------------------------------------------
igual('só texto', linhaSuporte('Oi, tudo bem?', [], 'x'), 'Oi, tudo bem?')
igual('só foto', linhaSuporte('', ['a.jpg'], 'x'), '📷 Foto')
igual('texto com foto', linhaSuporte('Segue o print', ['a.jpg'], 'x'), '📷 Segue o print')
igual('nada', linhaSuporte(null, null, 'Enviou uma mensagem.'), 'Enviou uma mensagem.')
igual('quebra de linha vira espaço', linhaSuporte('linha 1\n\nlinha 2', [], 'x'), 'linha 1 linha 2')
ok('texto longo é cortado', resumo('a'.repeat(300), '').length === 138)

// ---------------------------------------------------------------------------
// Linha do WhatsApp
// ---------------------------------------------------------------------------
const base = { texto: null, midia_nome: null, reacao: null, grupo: false, remetente: null }
igual('texto individual', linhaWhatsapp({ ...base, tipo: 'text', texto: 'Oi' }), 'Oi')
igual('grupo com remetente', linhaWhatsapp({ ...base, tipo: 'text', texto: 'Promo hoje', grupo: true, remetente: 'Adm 7057' }), 'Adm 7057: Promo hoje')
igual('grupo sem remetente', linhaWhatsapp({ ...base, tipo: 'image', grupo: true }), 'Alguém: 📷 Foto')
igual('reação', linhaWhatsapp({ ...base, tipo: 'reaction', reacao: '👍' }), 'Reagiu 👍 à sua mensagem')
igual('documento', linhaWhatsapp({ ...base, tipo: 'document', midia_nome: 'nota.pdf' }), '📄 nota.pdf')

// ---------------------------------------------------------------------------
// Foto de perfil
// ---------------------------------------------------------------------------
igual('https vale', fotoValida('https://pps.whatsapp.net/v/t61/abc'), 'https://pps.whatsapp.net/v/t61/abc')
igual('vazia não vale', fotoValida(''), null)
igual('nula não vale', fotoValida(null), null)
igual('http não vale', fotoValida('http://x/y.jpg'), null)

if (falhas) {
  console.log(`\n${falhas} falha(s)`)
  process.exit(1)
}
console.log('\nnotificações: tudo certo')
