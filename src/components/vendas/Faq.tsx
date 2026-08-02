import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ancora, cores, rotuloSecao, tituloSecao } from './tokens'

const PERGUNTAS = [
  {
    pergunta: 'Meu cliente precisa instalar algum aplicativo?',
    resposta:
      'Não. Ele escaneia o QR code com a câmera do celular e cai direto na conversa do WhatsApp, que ele já tem instalado. Sem download, sem cadastro, sem senha.',
  },
  {
    pergunta: 'Funciona se o cliente mandar áudio?',
    resposta:
      'Sim. O áudio é transcrito e analisado igual a uma mensagem de texto — inclusive porque muita gente prefere falar a digitar.',
  },
  {
    pergunta: 'Quantos QR codes eu posso gerar?',
    resposta:
      'Quantos quiser, sem custo adicional. Você pode ter um por mesa, um por ambiente ou um único no cardápio, e baixar o cartaz pronto em PDF com o visual do seu restaurante.',
  },
  {
    pergunta: 'Preciso de um WhatsApp Business separado?',
    resposta:
      'Você conecta o número do restaurante direto pelo painel. Recomendamos usar um número dedicado ao estabelecimento, e não o pessoal do dono.',
  },
  {
    pergunta: 'Meus dados ficam separados dos de outros restaurantes?',
    resposta:
      'Sim. O isolamento é feito no próprio banco de dados: cada restaurante só enxerga os próprios feedbacks, insights e relatórios. Nenhum outro cliente tem acesso aos seus dados.',
  },
  {
    pergunta: 'Posso cancelar quando quiser?',
    resposta:
      'Pode, a qualquer momento e sem multa. Você mantém o acesso até o fim do período já pago, e seus dados continuam guardados caso queira voltar depois.',
  },
]

export function Faq() {
  return (
    <section
      id="faq"
      style={{
        ...ancora,
        position: 'relative',
        background: '#FFFFFF',
        borderTop: `1px solid ${cores.borda}`,
      }}
    >
      <div
        className="mx-auto"
        style={{ maxWidth: '760px', padding: 'clamp(64px, 8vw, 104px) 24px' }}
      >
        <div className="text-center" style={{ marginBottom: 'clamp(32px, 4vw, 46px)' }}>
          <span style={rotuloSecao}>Dúvidas</span>
          <h2 style={{ ...tituloSecao, marginTop: '12px' }}>Perguntas frequentes</h2>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {PERGUNTAS.map((p, i) => (
            <AccordionItem
              key={p.pergunta}
              value={`item-${i}`}
              style={{ borderBottom: `1px solid ${cores.borda}` }}
            >
              <AccordionTrigger
                style={{
                  fontSize: '15.5px',
                  fontWeight: 600,
                  color: cores.tinta,
                  textAlign: 'left',
                  padding: '20px 0',
                }}
              >
                {p.pergunta}
              </AccordionTrigger>
              <AccordionContent
                style={{
                  fontSize: '14.5px',
                  lineHeight: 1.7,
                  color: cores.corpoSuave,
                  paddingBottom: '20px',
                }}
              >
                {p.resposta}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
