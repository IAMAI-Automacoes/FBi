import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '@/components/auth/AuthLayout'
import { cores } from '@/components/vendas/tokens'

/**
 * Política de privacidade do EasyFeed — página pública (/privacidade).
 *
 * Exigida pelo Google na tela de permissão do login com Google (avaliações do
 * Perfil da Empresa) e linkada no rodapé da página inicial. A seção "Dados do
 * Google" tem o texto de Uso Limitado que a verificação do app pede.
 * Mudou o que o sistema guarda ou com quem compartilha? Atualize aqui e a data.
 */

const ATUALIZADA_EM = '6 de outubro de 2026'
const EMAIL = 'oficial@iamai.ia.br'

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 style={{ fontSize: '19px', fontWeight: 700, color: cores.tinta, letterSpacing: '-0.01em' }}>{titulo}</h2>
      {children}
    </section>
  )
}

function Lista({ itens }: { itens: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {itens.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )
}

const linkEstilo = { color: cores.azul, textDecoration: 'underline' }

export default function Privacidade() {
  useEffect(() => {
    document.title = 'Política de Privacidade — EasyFeed'
    window.scrollTo(0, 0)
  }, [])

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh' }}>
      <header style={{ borderBottom: `1px solid ${cores.borda}` }}>
        <div className="mx-auto flex items-center justify-between" style={{ maxWidth: '820px', padding: '14px 16px' }}>
          <Link to="/" style={{ textDecoration: 'none' }} aria-label="EasyFeed, página inicial">
            <BrandMark size={56} />
          </Link>
          <Link to="/" style={{ fontSize: '14px', fontWeight: 500, color: cores.corpoSuave, textDecoration: 'none' }}>
            Voltar ao site
          </Link>
        </div>
      </header>

      <main
        className="mx-auto space-y-9"
        style={{ maxWidth: '820px', padding: '40px 16px 72px', fontSize: '15.5px', lineHeight: 1.7, color: cores.corpo }}
      >
        <div className="space-y-2">
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 36px)', fontWeight: 700, color: cores.tinta, letterSpacing: '-0.025em', lineHeight: 1.15 }}>
            Política de Privacidade
          </h1>
          <p style={{ fontSize: '13.5px', color: cores.corpoSuave }}>Última atualização: {ATUALIZADA_EM}</p>
        </div>

        <p>
          Esta política explica quais dados o EasyFeed trata, para quê, com quem compartilha e quais são os seus
          direitos, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD).
        </p>

        <Secao titulo="1. Quem somos">
          <p>
            O EasyFeed (easyfeed.com.br) é uma plataforma de feedback para restaurantes, desenvolvida pela IAMAI.
            O responsável pelos dados é <b>Guilherme Luiz Longo Brandi</b>, CNPJ <b>53.582.840/0001-76</b>
            ("IAMAI", "nós"). Contato e encarregado de dados: <a href={`mailto:${EMAIL}`} style={linkEstilo}>{EMAIL}</a>.
          </p>
          <p>
            Sobre os dados dos clientes de cada restaurante (quem manda feedback), o restaurante é o controlador e o
            EasyFeed trata esses dados em nome dele, para prestar o serviço contratado.
          </p>
        </Secao>

        <Secao titulo="2. Quais dados tratamos">
          <p><b>Dos nossos clientes (donos de restaurante e sua equipe):</b></p>
          <Lista itens={[
            'nome, e-mail, telefone e dados de acesso à conta;',
            'dados do restaurante: nome, endereço, logo, configurações, informações que você cadastra sobre o negócio e sobre a equipe (como garçons);',
            'dados de assinatura e pagamento. O pagamento é processado pela Stripe: não guardamos o número do seu cartão.',
          ]} />
          <p><b>Dos clientes do restaurante:</b></p>
          <Lista itens={[
            'quem manda feedback pelo WhatsApp: número de telefone, nome do perfil do WhatsApp quando disponível, o conteúdo das mensagens (texto e áudio, que é transcrito) e a data e hora;',
            'as conversas do número de WhatsApp que o restaurante conecta ao EasyFeed, para o restaurante acompanhá-las no painel;',
            'quem abre o QR code do restaurante: data e hora, o navegador usado e um código embaralhado do endereço IP, só para contar as aberturas sem identificar a pessoa.',
          ]} />
          <p><b>Do Perfil da Empresa no Google</b>, apenas quando o dono do restaurante conecta a conta Google: veja a seção 4.</p>
          <p>
            <b>Dados técnicos:</b> registros de acesso e de erros, o dispositivo usado e, se você permitir, a
            inscrição para receber notificações no navegador.
          </p>
        </Secao>

        <Secao titulo="3. Para que usamos os dados">
          <Lista itens={[
            'prestar o serviço: receber e organizar os feedbacks, responder automaticamente em nome do restaurante, gerar insights, relatórios e planos de ação;',
            'analisar os feedbacks com inteligência artificial (classificar o assunto e o sentimento, resumir e sugerir melhorias);',
            'cobrar a assinatura, dar suporte e enviar avisos sobre a conta;',
            'manter a segurança da plataforma, evitar fraudes e cumprir obrigações legais.',
          ]} />
          <p>
            As bases legais são a execução do contrato com o restaurante, o legítimo interesse em operar e melhorar
            o serviço, o cumprimento de obrigações legais e, quando necessário, o consentimento.
            Não vendemos dados pessoais e não os usamos para publicidade.
          </p>
        </Secao>

        <Secao titulo="4. Dados do Google (avaliações do Perfil da Empresa)">
          <p>
            O dono do restaurante pode conectar o EasyFeed ao Perfil da Empresa no Google pelo login oficial do
            Google. Isso é opcional e só acontece com a autorização dele.
          </p>
          <Lista itens={[
            <><b>O que acessamos:</b> com a permissão de gerenciar o Perfil da Empresa (business.manage), lemos as contas e os perfis da empresa que o dono administra (nome, endereço e link do Google Maps) e as avaliações do perfil escolhido: nota, texto, data, nome de quem avaliou quando público e a resposta do restaurante, além da nota média e do total de avaliações.</>,
            <><b>Para que:</b> mostrar ao próprio dono, no painel do EasyFeed, a nota do restaurante, a evolução mês a mês e as últimas avaliações. O EasyFeed só lê: não publica, não edita e não exclui nada no perfil.</>,
            <><b>Por quanto tempo:</b> as avaliações ficam guardadas como cópia temporária, renovada a cada atualização e apagada se ficar 30 dias sem ser renovada. A chave de acesso fornecida pelo Google fica guardada de forma criptografada.</>,
            <><b>O que não fazemos:</b> não usamos esses dados para publicidade, não os vendemos, não os compartilhamos com terceiros além da infraestrutura necessária para o serviço funcionar, não os enviamos para inteligência artificial e não os usamos para treinar modelos de IA. Ninguém da nossa equipe lê esses dados, a não ser com autorização do dono (por exemplo, num atendimento de suporte), por segurança ou por obrigação legal.</>,
            <><b>Como desconectar:</b> pelo botão "Desconectar" na página Google do EasyFeed, que cancela o acesso e apaga as avaliações guardadas na hora, ou em <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={linkEstilo}>myaccount.google.com/permissions</a>.</>,
          ]} />
          <p>
            O uso e a transferência, para qualquer outro aplicativo, de informações recebidas das APIs do Google pelo
            EasyFeed seguirão a{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={linkEstilo}>
              Política de Dados do Usuário dos Serviços de API do Google
            </a>
            , incluindo os requisitos de Uso Limitado.
          </p>
        </Secao>

        <Secao titulo="5. Com quem compartilhamos">
          <p>Só com fornecedores necessários para o serviço funcionar, que tratam os dados conforme as nossas instruções:</p>
          <Lista itens={[
            'hospedagem, banco de dados e armazenamento de arquivos (Supabase) e servidores de automação;',
            'serviços de envio e recebimento de mensagens do WhatsApp;',
            'provedores de inteligência artificial que analisam os feedbacks (como a OpenAI), sem uso dos dados do Google;',
            'processamento de pagamentos (Stripe);',
            'serviços de notificação do navegador.',
          ]} />
          <p>
            Alguns desses fornecedores ficam fora do Brasil, e a transferência segue o que a LGPD permite. Também
            podemos compartilhar dados quando a lei ou uma autoridade exigir.
          </p>
        </Secao>

        <Secao titulo="6. Por quanto tempo guardamos">
          <p>
            Guardamos os dados enquanto a conta do restaurante estiver ativa. A conta pode ser excluída em "Minha
            conta"; depois disso, apagamos ou anonimizamos os dados, exceto o que precisarmos manter por obrigação
            legal (por exemplo, registros fiscais). Os dados do Google seguem o prazo da seção 4.
          </p>
        </Secao>

        <Secao titulo="7. Segurança">
          <p>
            Cada restaurante só acessa os próprios dados. As conexões usam criptografia (HTTPS), o acesso ao banco é
            controlado por regras de permissão e as chaves de acesso a serviços externos ficam criptografadas.
          </p>
        </Secao>

        <Secao titulo="8. Seus direitos">
          <p>
            Pela LGPD, você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização,
            bloqueio ou exclusão, portabilidade, informação sobre com quem compartilhamos e revogação do
            consentimento. Escreva para <a href={`mailto:${EMAIL}`} style={linkEstilo}>{EMAIL}</a>. Se você mandou
            feedback para um restaurante, também pode falar diretamente com ele.
          </p>
        </Secao>

        <Secao titulo="9. Armazenamento no navegador">
          <p>
            Usamos o armazenamento do navegador para manter você conectado e lembrar preferências (como filtros e
            notificações). Não usamos cookies de publicidade nem de rastreamento.
          </p>
        </Secao>

        <Secao titulo="10. Mudanças nesta política">
          <p>
            Podemos atualizar esta política. A data no topo mostra a versão em vigor; mudanças importantes são
            avisadas no próprio EasyFeed.
          </p>
        </Secao>

        <Secao titulo="11. Contato">
          <p>
            Dúvidas ou pedidos sobre privacidade: <a href={`mailto:${EMAIL}`} style={linkEstilo}>{EMAIL}</a>.
            <br />
            Guilherme Luiz Longo Brandi (IAMAI), CNPJ 53.582.840/0001-76.
          </p>
        </Secao>
      </main>
    </div>
  )
}
