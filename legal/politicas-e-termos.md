# EasyFeed — Termos de Uso e Política de Privacidade

> **RASCUNHO.** Este documento foi redigido a partir do código-fonte do produto e ainda não foi revisado por advogado. Não publicar antes da revisão jurídica e do preenchimento de todos os campos `{{ }}`. Ver "Anexo II — Pendências jurídicas".

---

## 0. Cabeçalho

- **Versão:** 0.1.0
- **Data de vigência:** {{DATA_VIGENCIA}}
- **Produto:** EasyFeed (também referido internamente como "Easy Feed" e "Feedback Inteligente")
- **Responsável:** {{RAZAO_SOCIAL}}, CNPJ {{CNPJ}}, com sede em {{ENDERECO}}
- **Canal de privacidade:** {{EMAIL_PRIVACIDADE}}
- **Canal de suporte:** {{EMAIL_SUPORTE}} / {{WHATSAPP_SUPORTE}}
- **Endereço do site:** {{URL_SITE}}

### 0.1 Como este documento é organizado

- **Parte A — Termos de Uso:** regras entre o EasyFeed e o Restaurante assinante.
- **Parte B — Política de Privacidade:** como tratamos dados de restaurantes e usuários do painel.
- **Parte C — Aviso de Privacidade ao Consumidor Final:** texto curto para exibir junto ao QR code.
- **Parte D — Módulos de funcionalidade:** cada funcionalidade que trata dados, com status e cláusulas próprias.
- **Parte E — Lista de suboperadores.**
- **Anexo I — Template de novo módulo.**
- **Anexo II — Pendências jurídicas.**

### 0.2 Regras de numeração

- Toda cláusula tem um ID estável (`TU-`, `PP-`, `AC-`, `MOD-`, `SUB-`, `PEND-`).
- Cláusulas nunca são renumeradas. Uma cláusula removida fica marcada como `[REVOGADA]` com o motivo.
- Cláusulas novas recebem o próximo número livre da seção (ex.: `TU-4.7` depois de `TU-4.6`).
- Módulos acrescentam cláusulas às Partes A, B e C usando o prefixo do módulo (ex.: `MOD-QR-TU-1`).

### 0.3 Changelog

- **0.1.0 — {{DATA_VIGENCIA}}:** rascunho inicial, derivado do inventário do repositório em 2026-09-28. Módulos ativos: MOD-CONTA, MOD-PAGAMENTO, MOD-QR, MOD-WHATSAPP, MOD-IA, MOD-RETORNO, MOD-ALERTA, MOD-EQUIPE, MOD-ASSISTENTE, MOD-SUPORTE, MOD-DEMO, MOD-AFILIADOS. Módulo planejado: MOD-GOOGLE-REVIEW.

---

## 1. Definições

- **DEF-1 — Plataforma ou EasyFeed:** o serviço de software oferecido por {{RAZAO_SOCIAL}}, composto pelo painel web, pela página aberta pelo QR code, pelas funções de servidor e pelas automações descritas neste documento.
- **DEF-2 — Restaurante ou Assinante:** a pessoa jurídica (ou empresário individual) que contrata a Plataforma para receber feedbacks de seus clientes. É quem assina o plano e responde pelo uso do painel.
- **DEF-3 — Usuário do Painel:** a pessoa física que acessa o painel com login e senha em nome do Restaurante (dono, gerente ou membro da equipe com permissão).
- **DEF-4 — Consumidor Final ou Cliente do Restaurante:** a pessoa que escaneia o QR code e envia uma mensagem de feedback ao Restaurante pelo WhatsApp.
- **DEF-5 — Feedback:** a mensagem (texto ou áudio) enviada pelo Consumidor Final ao número de WhatsApp do Restaurante, e os dados derivados dela (pontos separados, categoria, sentimento, resumo, destaque).
- **DEF-6 — Insight:** o conteúdo gerado por inteligência artificial a partir de um conjunto de Feedbacks, agrupando pontos recorrentes e sugerindo prioridades.
- **DEF-7 — Ação:** a tarefa operacional criada no painel (manualmente ou por sugestão da IA) para tratar um Insight, com status, plano e responsável.
- **DEF-8 — Retorno ao Cliente:** a mensagem de WhatsApp enviada ao Consumidor Final, em nome do Restaurante, informando que o ponto relatado está em andamento ou foi resolvido (ver MOD-RETORNO).
- **DEF-9 — Alerta Urgente:** o aviso enviado ao dono do Restaurante quando um Feedback indica risco sanitário, de segurança ou de discriminação (ver MOD-ALERTA).
- **DEF-10 — Assistente de IA:** o chat do painel que responde perguntas sobre os dados do próprio Restaurante e pode, quando autorizado, alterar dados (ver MOD-ASSISTENTE).
- **DEF-11 — Módulo:** uma funcionalidade autocontida da Plataforma que trata dados pessoais, descrita na Parte D com status `[ATIVO]`, `[PLANEJADO]` ou `[DESATIVADO]`.
- **DEF-12 — Suboperador:** empresa terceira que trata dados pessoais por conta do EasyFeed para prestar o serviço (Parte E).
- **DEF-13 — Administrador da Plataforma:** pessoa da equipe do EasyFeed com acesso ao painel administrativo interno (contas, suporte, agentes de IA, cupons).
- **DEF-14 — Vendedor:** pessoa autorizada pelo EasyFeed a apresentar a Plataforma a potenciais clientes usando uma conta de demonstração (ver MOD-DEMO).
- **DEF-15 — LGPD:** Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais).
- **DEF-16 — Marco Civil:** Lei nº 12.965/2014.

---

## Parte A — Termos de Uso

### TU-1. Objeto e aceitação

- **TU-1.1** Estes Termos regulam o uso da Plataforma pelo Restaurante e pelos seus Usuários do Painel.
- **TU-1.2** A aceitação ocorre no momento em que o Restaurante cria a conta, contrata um plano ou usa a Plataforma, o que ocorrer primeiro. Ao aceitar, o Restaurante declara que a pessoa que criou a conta tem poderes para representá-lo.
- **TU-1.3** O EasyFeed é uma ferramenta de coleta e análise de feedbacks. Ele não presta consultoria, não garante resultado comercial e não substitui a decisão humana do Restaurante (ver TU-7).
- **TU-1.4** A Plataforma está em fase beta. Funcionalidades podem mudar, ser incluídas ou retiradas sem aviso prévio, respeitado o disposto em TU-11 quanto a mudanças relevantes.
- **TU-1.5** A Plataforma destina-se a pessoas jurídicas e empresários. Não se destina a consumidores pessoas físicas nem a menores de 18 anos.

### TU-2. Cadastro e conta

- **TU-2.1** Para criar a conta, o Restaurante informa nome da pessoa responsável, e-mail e senha. Depois, no onboarding, informa nome do restaurante, tipo de culinária, número de mesas, como coleta feedbacks hoje, nome e tom do assistente de IA, logo (opcional), número de WhatsApp para alertas urgentes e conecta o número de WhatsApp do estabelecimento.
- **TU-2.2** O Restaurante é responsável pela veracidade dos dados informados e por mantê-los atualizados.
- **TU-2.3** A senha é pessoal e intransferível. O Restaurante responde por todas as atividades realizadas com as credenciais dos seus Usuários do Painel, inclusive quando compartilhadas indevidamente.
- **TU-2.4** A opção "Lembrar-me" mantém a sessão salva no navegador. Em computadores compartilhados, o Usuário do Painel deve desmarcá-la e encerrar a sessão ao sair.
- **TU-2.5** O Restaurante deve comunicar imediatamente ao EasyFeed qualquer uso não autorizado da conta pelo canal {{EMAIL_SUPORTE}}.
- **TU-2.6** Cada conta corresponde a um único estabelecimento. Redes com várias unidades devem contratar uma conta por unidade, salvo acordo diferente por escrito.
- **TU-2.7** Contas criadas e nunca contratadas (sem plano, sem onboarding concluído, sem WhatsApp conectado e sem feedback recebido) são apagadas automaticamente após 7 dias.

### TU-3. Assinatura, cobrança e renovação

- **TU-3.1** A Plataforma é oferecida em plano único, com ciclos de cobrança mensal, semestral e anual. Os valores vigentes são os exibidos na página de planos e no checkout no momento da contratação.
- **TU-3.2** O pagamento é processado pelo Stripe, por meio de página de checkout hospedada pelo próprio Stripe. O EasyFeed não recebe nem armazena o número completo do cartão; guarda apenas os identificadores de cliente e de assinatura fornecidos pelo Stripe.
- **TU-3.3** A assinatura renova-se automaticamente ao fim de cada ciclo, pelo mesmo valor e ciclo, salvo cancelamento antes da data de renovação ou alteração de preço comunicada conforme TU-3.6.
- **TU-3.4** Em caso de falha de pagamento na renovação, o acesso ao painel pode ser bloqueado até a regularização. A conta e os dados permanecem guardados (ver TU-10.4). Enquanto o acesso estiver bloqueado, o número de WhatsApp conectado é desconectado da Plataforma e precisa ser reconectado após a regularização.
- **TU-3.5** O EasyFeed pode emitir cupons de acesso que liberam o uso por prazo determinado sem cobrança. Cupons são pessoais, não cumulativos e podem ter regras próprias (por exemplo, restritos a Vendedores).
- **TU-3.6** Alterações de preço serão comunicadas com antecedência mínima de {{PRAZO_AVISO_PRECO}} dias e só valem a partir da renovação seguinte.
- **TU-3.7** Impostos incidentes são os indicados no checkout. A nota fiscal é emitida por {{RAZAO_SOCIAL}} conforme a legislação aplicável.

### TU-4. Cancelamento e reembolso

- **TU-4.1** O Restaurante pode cancelar a qualquer momento, sem multa, pelo painel (Minha Conta) ou pelo canal de suporte.
- **TU-4.2** Ao cancelar, o acesso é mantido até o fim do período já pago. Depois disso, a conta passa ao estado "cancelada": o login continua existindo, mas o painel fica bloqueado até nova contratação.
- **TU-4.3** Não há reembolso proporcional do período já iniciado, salvo o disposto em TU-4.4 e TU-4.5.
- **TU-4.4** Quando aplicável o direito de arrependimento previsto no art. 49 do Código de Defesa do Consumidor, o Restaurante pode desistir da contratação em até 7 dias corridos contados do primeiro pagamento, com devolução integral do valor pago. {{POLITICA_ARREPENDIMENTO_B2B}}
- **TU-4.5** Política de reembolso adicional: {{POLITICA_REEMBOLSO}}.
- **TU-4.6** Reembolsos, quando devidos, são feitos pelo mesmo meio de pagamento, pelo Stripe, no prazo praticado pela operadora do cartão.

### TU-5. Obrigações do Restaurante

- **TU-5.1** Usar a Plataforma apenas para coletar e analisar feedbacks do próprio estabelecimento.
- **TU-5.2** Exibir, junto a cada QR code impresso ou digital, o aviso de privacidade ao Consumidor Final (Parte C) ou um link para ele, de modo legível antes de o Consumidor Final enviar a mensagem. O EasyFeed disponibiliza o texto; a exibição é responsabilidade do Restaurante.
- **TU-5.3** Conectar à Plataforma apenas número de WhatsApp de titularidade do Restaurante ou cuja utilização esteja autorizada, preferencialmente um número dedicado ao estabelecimento e não o pessoal do dono.
- **TU-5.4** Cumprir os termos de uso do WhatsApp e da Meta para o número conectado. A Plataforma usa um gateway de WhatsApp (ver SUB-4) e não é um produto oficial da Meta; a Meta pode restringir ou banir números que violem suas políticas, e o EasyFeed não responde por isso.
- **TU-5.5** Cadastrar dados de garçons e demais membros da equipe (nome e telefone) somente com o conhecimento dessas pessoas, informando-as de que receberão mensagens da Plataforma (ver MOD-EQUIPE).
- **TU-5.6** Informar aos seus clientes, quando ativar o Retorno ao Cliente (MOD-RETORNO), que poderão receber mensagens de acompanhamento, e registrar na Plataforma qualquer pedido de descadastro recebido.
- **TU-5.7** Atender, no seu papel de controlador (ver PP-2), os pedidos de titulares feitos por Consumidores Finais, podendo acionar o EasyFeed para executar a exclusão ou correção no sistema.
- **TU-5.8** Não inserir na Plataforma (inclusive no Assistente de IA e nos documentos de conhecimento) dados pessoais sensíveis, dados de crianças, dados bancários de terceiros ou segredos de terceiros que não tenha direito de tratar.
- **TU-5.9** Manter segurança adequada nos aparelhos e redes que usa para acessar o painel.

### TU-6. Uso aceitável

- **TU-6.1** É proibido: (a) usar a Plataforma para enviar mensagens em massa, propaganda ou conteúdo não solicitado a consumidores; (b) tentar acessar dados de outro restaurante; (c) contornar limites técnicos, cotas de IA ou controles de assinatura; (d) fazer engenharia reversa, copiar ou revender a Plataforma; (e) usar a Plataforma para fins ilícitos, discriminatórios ou que violem direitos de terceiros; (f) inserir conteúdo que tente manipular os modelos de IA ("injeção de prompt") para obter dados de outros clientes ou da Plataforma; (g) cadastrar telefones de pessoas que não fazem parte da equipe para receber mensagens.
- **TU-6.2** O EasyFeed pode limitar, suspender ou encerrar contas que violem TU-6.1 (ver TU-10).
- **TU-6.3** O uso do Assistente de IA e das gerações automáticas está sujeito a cota mensal de crédito por restaurante. Ao atingir a cota, as funções de IA ficam indisponíveis até o próximo ciclo ou até ampliação contratada.

### TU-7. Natureza dos Insights e demais conteúdos gerados por IA

- **TU-7.1** Insights, ações sugeridas, planos de ação, resumos executivos, classificações, destaques, banners, respostas do Assistente de IA e textos de retorno ao cliente são gerados por modelos de linguagem de terceiros (ver MOD-IA).
- **TU-7.2** Esses conteúdos podem conter erros, omissões, interpretações incorretas do feedback ou informações desatualizadas. O EasyFeed não garante precisão, completude ou adequação a qualquer finalidade.
- **TU-7.3** Os conteúdos gerados são apoio à decisão. Toda decisão sobre equipe, fornecedores, cardápio, clientes ou qualquer outra matéria é do Restaurante, que deve revisá-los antes de agir. Em especial, decisões sobre pessoas (advertência, demissão, bonificação) não devem se basear exclusivamente na saída da IA.
- **TU-7.4** O Alerta Urgente (MOD-ALERTA) e a classificação de sentimento são filtros automáticos: podem deixar de detectar situações graves ou apontar situações que não são graves. O Restaurante continua responsável por ler os feedbacks.
- **TU-7.5** O Restaurante pode ajustar, no painel, o nome, o tom e os focos do assistente, e escolher se o Assistente de IA pode alterar dados sozinho ou deve perguntar antes. A configuração padrão é "perguntar antes".

### TU-8. Propriedade intelectual

- **TU-8.1** A Plataforma, seu código, marca, layout, prompts, modelos de cartaz e documentação pertencem a {{RAZAO_SOCIAL}} ou a seus licenciantes. O contrato concede apenas licença de uso, não exclusiva e intransferível, durante a vigência da assinatura.
- **TU-8.2** Os Feedbacks, os dados do Restaurante, a logo e as imagens enviadas pertencem ao Restaurante (ou aos respectivos titulares). O Restaurante concede ao EasyFeed licença para armazená-los, processá-los e exibi-los na medida necessária para prestar o serviço.
- **TU-8.3** Os conteúdos gerados por IA para o Restaurante podem ser usados livremente por ele, sem exclusividade, e o EasyFeed não reivindica autoria sobre eles.
- **TU-8.4** O EasyFeed pode usar dados agregados e não identificáveis (por exemplo, volume de feedbacks por categoria, uso de funcionalidades, consumo de IA) para operar, medir e melhorar a Plataforma. Uso de conteúdo de feedbacks para outra finalidade depende de PP-4.6 e da pendência PEND-1.
- **TU-8.5** Sugestões enviadas pelo Restaurante pelo canal "Sugestões" podem ser implementadas livremente pelo EasyFeed, sem obrigação de remuneração ou crédito.

### TU-9. Disponibilidade, suporte e limitação de responsabilidade

- **TU-9.1** O EasyFeed se esforça para manter a Plataforma disponível, mas não garante disponibilidade ininterrupta. Manutenções, falhas de suboperadores (Supabase, Stripe, OpenRouter, gateway de WhatsApp, n8n, Vercel) ou da própria Meta podem interromper o serviço.
- **TU-9.2** Não há acordo de nível de serviço (SLA) na fase beta. {{SLA}}
- **TU-9.3** O suporte é prestado por WhatsApp e e-mail ({{WHATSAPP_SUPORTE}} / {{EMAIL_SUPORTE}}) e pelo canal "Sugestões" do painel, em dias úteis, no horário {{HORARIO_SUPORTE}}.
- **TU-9.4** Na extensão permitida pela lei, a responsabilidade total do EasyFeed perante o Restaurante, por qualquer causa, fica limitada ao valor pago pelo Restaurante nos 12 meses anteriores ao fato gerador.
- **TU-9.5** O EasyFeed não responde por lucros cessantes, perda de clientes, danos à reputação decorrentes do conteúdo de feedbacks, decisões tomadas com base em Insights, bloqueio de número de WhatsApp pela Meta ou indisponibilidade de suboperadores.
- **TU-9.6** As limitações acima não se aplicam a dolo, a danos causados por violação de dados pessoais atribuível ao EasyFeed nos termos da LGPD, nem a hipóteses em que a lei impeça a limitação.

### TU-10. Suspensão, rescisão e efeitos

- **TU-10.1** O EasyFeed pode suspender o acesso, com aviso, em caso de inadimplência, violação de TU-5 ou TU-6, ordem de autoridade ou risco à segurança da Plataforma. Em casos graves ou urgentes o aviso pode ser posterior.
- **TU-10.2** O Restaurante pode encerrar a conta pelo painel (Minha Conta → excluir conta). A exclusão é marcada imediatamente: o painel fica inacessível, o número de WhatsApp é desconectado e os QR codes impressos deixam de funcionar (a página do QR passa a mostrar "QR code não encontrado").
- **TU-10.3** A exclusão pelo painel é reversível pelo EasyFeed por {{PRAZO_RESTAURACAO_CONTA}} dias, a pedido do Restaurante. Após esse prazo, os dados são apagados ou anonimizados conforme PP-8.
- **TU-10.4** Em cancelamento por falta de pagamento ou por vencimento do plano, os dados são mantidos por {{PRAZO_RETENCAO_CONTA_INATIVA}} para permitir reativação, e depois apagados ou anonimizados conforme PP-8.
- **TU-10.5** Antes do encerramento definitivo, o Restaurante pode exportar seus relatórios em PDF ou planilha pelo painel.
- **TU-10.6** Sobrevivem ao término: TU-7, TU-8, TU-9, TU-12 e as obrigações de proteção de dados.

### TU-11. Alterações destes Termos

- **TU-11.1** O EasyFeed pode alterar estes Termos. Alterações relevantes (preço, limitação de responsabilidade, direitos sobre dados, novos módulos que tratem dados de forma diferente) serão comunicadas por e-mail ou aviso no painel com antecedência mínima de {{PRAZO_AVISO_TERMOS}} dias.
- **TU-11.2** A versão vigente, com data e changelog, fica sempre publicada em {{URL_TERMOS}}. Continuar usando a Plataforma após a vigência da nova versão significa aceitá-la. Quem não concordar pode cancelar conforme TU-4.
- **TU-11.3** Ativar um módulo marcado como `[PLANEJADO]` na Parte D exige nova versão deste documento (ver Anexo I).

### TU-12. Lei aplicável, foro e disposições gerais

- **TU-12.1** Aplica-se a lei brasileira.
- **TU-12.2** Fica eleito o foro da comarca de {{FORO}}, com renúncia a qualquer outro, sem prejuízo do foro do domicílio do Restaurante quando a lei assim exigir.
- **TU-12.3** Antes de acionar o Judiciário, as partes tentarão solução amigável pelo canal de suporte por pelo menos 15 dias.
- **TU-12.4** Se alguma cláusula for considerada inválida, as demais permanecem válidas.
- **TU-12.5** A tolerância com descumprimento não significa renúncia ao direito.
- **TU-12.6** O Restaurante não pode ceder este contrato sem autorização escrita. O EasyFeed pode cedê-lo a sucessor ou em reorganização societária, mantidas as obrigações aqui assumidas.
- **TU-12.7** Comunicações ao Restaurante serão feitas ao e-mail da conta. Comunicações ao EasyFeed, aos canais do item 0.

---

## Parte B — Política de Privacidade (restaurantes e usuários do painel)

### PP-1. Quem somos e como falar conosco

- **PP-1.1** Controlador dos dados de cadastro, assinatura e uso do painel: {{RAZAO_SOCIAL}}, CNPJ {{CNPJ}}, {{ENDERECO}}.
- **PP-1.2** Canal do encarregado / privacidade: {{EMAIL_PRIVACIDADE}}. Enquanto não houver encarregado formalmente nomeado (ver PEND-2), este canal é atendido por {{RESPONSAVEL_PRIVACIDADE}}.
- **PP-1.3** Esta Política vale para: visitantes do site de vendas, pessoas que criam conta, Usuários do Painel, garçons e membros da equipe cadastrados pelo Restaurante, Vendedores e afiliados. Os dados do Consumidor Final estão na Parte C e nos módulos correspondentes.

### PP-2. Papéis na LGPD

- **PP-2.1** Para os dados dos Usuários do Painel, do Restaurante, da equipe cadastrada, de Vendedores e de afiliados, o EasyFeed é **controlador**.
- **PP-2.2** Para os dados do Consumidor Final (telefone, conteúdo do feedback e dados derivados), o Restaurante é **controlador** e o EasyFeed é **operador**: o Restaurante decide coletar feedback dos seus clientes e escolhe ativar ou não os módulos; o EasyFeed trata esses dados em nome do Restaurante, conforme estes Termos, que funcionam como instruções documentadas do controlador. Esta escolha e suas ressalvas estão em PEND-1.
- **PP-2.3** O EasyFeed só trata dados do Consumidor Final para as finalidades da Parte C e dos módulos ativos. Se vier a usar esses dados para finalidade própria (por exemplo, melhorar modelos ou o produto com base no conteúdo dos feedbacks), passará a ser controlador para essa finalidade, e esta Política e o aviso da Parte C serão atualizados antes.

### PP-3. Dados que coletamos

#### PP-3.1 Dados que você nos fornece

- **Cadastro:** nome, e-mail e senha (a senha é guardada de forma criptografada pelo serviço de autenticação; não temos acesso a ela).
- **Perfil da pessoa:** nome de usuário, foto/avatar, notas de perfil, preferências do painel.
- **Perfil do restaurante:** nome, tipo de culinária, número de mesas, como coleta feedbacks, detalhes livres, público-alvo, diferenciais, logo, número de WhatsApp conectado, número do dono para alertas urgentes, telefone de contato divulgado aos clientes, personalização do cartaz e da página do QR (textos, cores, imagens de fundo).
- **Equipe:** nome e telefone dos garçons cadastrados, regras de bonificação e registro de bônus pagos (ver MOD-EQUIPE).
- **Assistente de IA:** mensagens do chat, imagens enviadas no chat, "memórias" que o assistente guarda sobre o restaurante, documentos e links enviados como base de conhecimento.
- **Suporte:** mensagens, arquivos e reações trocados no canal "Sugestões" com a equipe do EasyFeed.
- **Pagamento:** ciclo escolhido e cupons usados. Os dados do cartão são informados diretamente ao Stripe.
- **Afiliados (quando aplicável):** nome, e-mail, telefone, CPF/CNPJ, dados bancários ou chave Pix, identificador de conta no Stripe (ver MOD-AFILIADOS).

#### PP-3.2 Dados gerados pelo uso

- Status e histórico da assinatura (ativa, cancelada, inadimplente, sem assinatura), datas de expiração e cancelamento, identificadores de cliente e assinatura no Stripe.
- Relatórios gerados, insights, ações, planos, histórico de mudança de status das ações, banners.
- Consumo de IA por restaurante: modelo, tokens de entrada e saída, custo estimado, agente que consumiu.
- Registro das alterações feitas pelo Assistente de IA nos dados (antes/depois, para reversão).
- Registros de acesso e de autenticação mantidos pelo serviço de autenticação (data, hora, IP, identificador da sessão).
- Contagem de aberturas dos QR codes.

#### PP-3.3 Dados do navegador

- **Sessão de login:** guardada no armazenamento local do navegador (ou apenas na aba, se "Lembrar-me" estiver desmarcado).
- **Preferências:** flag "Lembrar-me", estado do menu lateral (cookie `sidebar:state`, validade de 7 dias), emojis recentes, identificador da conversa aberta no chat, marcador de recarga em caso de erro, contador de mensagens não lidas (apenas administradores).
- **Notificações push:** apenas para Administradores da Plataforma que aceitarem, guardamos o endereço de inscrição do navegador, as chaves de criptografia da inscrição e o identificador do navegador (user agent).
- **O que não usamos:** não usamos Google Analytics, pixel do Facebook, Hotjar, Sentry ou qualquer ferramenta de rastreamento de terceiros. Ver PP-10.

### PP-4. Para que usamos os dados e com que base legal (LGPD, art. 7º)

- **PP-4.1 Prestar o serviço contratado** (criar e manter a conta, receber e analisar feedbacks, gerar insights, exibir o painel, enviar alertas e retornos configurados): execução de contrato (art. 7º, V).
- **PP-4.2 Cobrar e gerir a assinatura** (checkout, renovação, cupons, bloqueio por inadimplência): execução de contrato (art. 7º, V) e cumprimento de obrigação legal fiscal (art. 7º, II).
- **PP-4.3 Segurança e prevenção a fraude** (registros de acesso, proteção contra abuso das funções de IA, limite de tentativas na demonstração, hash de IP nas aberturas de QR): legítimo interesse (art. 7º, IX) e cumprimento do Marco Civil (art. 7º, II).
- **PP-4.4 Suporte e comunicação sobre o serviço** (respostas no canal de sugestões, avisos de mudança de termos, e-mails transacionais como recuperação de senha): execução de contrato (art. 7º, V).
- **PP-4.5 Notificações push para administradores:** consentimento do próprio administrador, dado no navegador (art. 7º, I).
- **PP-4.6 Melhoria da Plataforma com dados agregados e não identificáveis:** legítimo interesse (art. 7º, IX). Não usamos o conteúdo dos feedbacks para treinar modelos próprios nem autorizamos os provedores de IA a fazê-lo pelo nosso lado; ver MOD-IA e PEND-3.
- **PP-4.7 Marketing para o Restaurante** (novidades, ofertas): {{BASE_LEGAL_MARKETING}}. Hoje a Plataforma não envia comunicações de marketing automatizadas; se passar a enviar, haverá opção de descadastro em cada mensagem.
- **PP-4.8 Defesa em processos e cumprimento de ordens de autoridade:** exercício regular de direitos (art. 7º, VI) e obrigação legal (art. 7º, II).

### PP-5. Com quem compartilhamos

- **PP-5.1 Suboperadores** listados na Parte E, cada um apenas com os dados necessários à sua função.
- **PP-5.2 Equipe do EasyFeed:** Administradores da Plataforma têm acesso ao painel administrativo, que lista contas, status de assinatura, uso de IA, mensagens de suporte e permite restaurar ou excluir contas. O acesso é limitado a pessoas autorizadas e registrado.
- **PP-5.3 Vendedores:** têm acesso apenas à própria conta de demonstração, nunca aos dados de outros restaurantes (ver MOD-DEMO).
- **PP-5.4 Autoridades:** quando exigido por lei ou ordem judicial.
- **PP-5.5 Não vendemos dados pessoais** e não compartilhamos dados de um restaurante com outro. O isolamento é feito no banco de dados (regras de acesso por linha), de modo que cada restaurante só enxerga os próprios feedbacks, insights, relatórios, contatos e configurações.

### PP-6. Transferência internacional

- **PP-6.1** Parte dos suboperadores está fora do Brasil ou pode processar dados fora do Brasil (ver Parte E): OpenRouter e os provedores de modelos de IA (Estados Unidos), Stripe (Estados Unidos, com operação no Brasil), Google Fonts (Google LLC), Vercel (Estados Unidos, com distribuição global) e, conforme a região configurada, Supabase e n8n.
- **PP-6.2** Essas transferências são feitas com base no art. 33 da LGPD e na Resolução CD/ANPD nº 19/2024, principalmente por meio de cláusulas contratuais padrão incorporadas aos contratos com os suboperadores, ou por ser a transferência necessária à execução do contrato com o Restaurante (art. 33, IX). A conferência dos instrumentos de cada suboperador está em PEND-4.
- **PP-6.3** A região de hospedagem do banco de dados principal é {{REGIAO_SUPABASE}}. A do n8n é {{REGIAO_N8N}}. A do gateway de WhatsApp é {{REGIAO_UAZAPI}}.

### PP-7. Segurança

- **PP-7.1** Medidas em uso, conforme o código da Plataforma: comunicação criptografada (HTTPS); senhas protegidas pelo serviço de autenticação; isolamento por restaurante em todas as tabelas com regras de acesso por linha; chaves de serviço e de IA guardadas apenas no servidor, nunca no navegador; campos de assinatura protegidos contra alteração pelo próprio usuário; funções de IA exigem sessão válida, assinatura ativa e respeitam cota; validação de escopo para bloquear pedidos fora do tema no chat; endereços IP das aberturas de QR guardados apenas como hash; limite de tentativas no acesso de demonstração; sessões de demonstração encerradas automaticamente em 2 horas.
- **PP-7.2** Limitação conhecida: as credenciais do gateway de WhatsApp de cada restaurante ficam na mesma linha de dados que o restaurante lê no painel. Isso está registrado em PEND-9 para reforço.
- **PP-7.3** Em caso de incidente de segurança que possa causar risco ou dano relevante, comunicaremos a ANPD e os titulares afetados (ou o Restaurante controlador, quando se tratar de dados de Consumidores Finais) nos prazos da regulamentação vigente.

### PP-8. Por quanto tempo guardamos

- **PP-8.1 Conta ativa:** enquanto durar a assinatura.
- **PP-8.2 Conta cancelada ou vencida:** dados mantidos por {{PRAZO_RETENCAO_CONTA_INATIVA}} para permitir reativação; depois, exclusão ou anonimização.
- **PP-8.3 Conta excluída pelo painel:** marcada como excluída na hora; restaurável por {{PRAZO_RESTAURACAO_CONTA}} dias; depois, exclusão ou anonimização.
- **PP-8.4 Conta abandonada** (sem plano, sem onboarding, sem WhatsApp, sem feedback): apagada automaticamente após 7 dias, incluindo o login.
- **PP-8.5 Registros de acesso a aplicações de internet** (Marco Civil, art. 15): guardados por, no mínimo, 6 meses a partir de cada acesso, e apagados ou anonimizados depois, salvo ordem judicial que estenda o prazo.
- **PP-8.6 Dados fiscais e de cobrança:** pelo prazo legal de guarda de documentos fiscais (5 anos, no mínimo).
- **PP-8.7 Consumo de IA:** por restaurante e ciclo mensal, mantido por {{PRAZO_RETENCAO_USO_IA}}.
- **PP-8.8 Mensagens de suporte:** por {{PRAZO_RETENCAO_SUPORTE}}.
- **PP-8.9 Notificações push (administradores):** até a inscrição ser cancelada no navegador ou deixar de funcionar.
- **PP-8.10 Demonstração:** sessões encerradas em até 2 horas; registro de tentativas de acesso (IP) apagado após 1 dia.
- **PP-8.11 Dados de Consumidores Finais:** ver AC-6 e MOD-QR, MOD-WHATSAPP e MOD-RETORNO.
- **PP-8.12** Hoje a Plataforma não apaga automaticamente feedbacks, contatos, registros de abertura de QR nem mensagens enviadas. Os prazos acima marcados com `{{ }}` precisam ser definidos e implementados (PEND-5).

### PP-9. Seus direitos (LGPD, art. 18) e como exercê-los

- **PP-9.1** Você pode pedir: confirmação de tratamento; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade; portabilidade; informação sobre compartilhamentos; informação sobre a possibilidade de não consentir e suas consequências; revogação de consentimento; e revisão de decisões automatizadas.
- **PP-9.2** Pelo painel: editar nome, foto e dados do restaurante (Minha Conta e Configurações); exportar relatórios; cancelar a assinatura; excluir a conta; desconectar o WhatsApp; apagar conversas do assistente; remover documentos de conhecimento.
- **PP-9.3** Por e-mail: {{EMAIL_PRIVACIDADE}}. Responderemos em até 15 dias, podendo pedir confirmação de identidade.
- **PP-9.4** Decisões automatizadas: classificações, insights e alertas são gerados automaticamente, mas não produzem efeitos jurídicos sobre os Usuários do Painel; são apoio à decisão do Restaurante. Ainda assim, qualquer pessoa pode pedir revisão humana de um conteúdo gerado que a afete.
- **PP-9.5** Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).

### PP-10. Cookies e armazenamento local

- **PP-10.1** Usamos apenas armazenamento estritamente necessário ao funcionamento: sessão de login, preferências de interface e estado do chat, descritos em PP-3.3.
- **PP-10.2** Usamos um único cookie próprio (`sidebar:state`), para lembrar se o menu lateral está aberto. Não usamos cookies de terceiros, de publicidade ou de medição.
- **PP-10.3** A página de login e o painel carregam fontes do Google Fonts; ao carregar, o navegador envia o endereço IP ao Google (ver SUB-8).
- **PP-10.4** Você pode apagar o armazenamento local pelo navegador; isso encerra a sessão e reinicia as preferências.

### PP-11. Alterações desta Política

- **PP-11.1** Alterações seguem TU-11. A versão vigente, com data e changelog, fica em {{URL_POLITICA}}.
- **PP-11.2** Mudanças que ampliem finalidades, novos suboperadores ou novos módulos que tratem dados do Consumidor Final serão comunicadas ao Restaurante com antecedência, para que ele atualize seus próprios avisos aos clientes.

---

## Parte C — Aviso de Privacidade ao Consumidor Final

> Texto para o Restaurante exibir junto ao QR code (cartaz, mesa, cardápio ou página do QR). Pode ser resumido no cartaz com link para a versão completa em {{URL_AVISO_CONSUMIDOR}}. O Restaurante deve preencher {{NOME_DO_RESTAURANTE}} e {{CONTATO_DO_RESTAURANTE}}.

### Versão curta (para o cartaz ou a página do QR)

Ao enviar sua mensagem, seu número de WhatsApp e o que você escrever ou gravar serão usados por {{NOME_DO_RESTAURANTE}}, com apoio da plataforma EasyFeed e de inteligência artificial, para entender e melhorar o atendimento. Seu feedback não é anônimo para o restaurante. Você pode pedir para apagar seus dados ou parar de receber mensagens: {{CONTATO_DO_RESTAURANTE}}. Aviso completo: {{URL_AVISO_CONSUMIDOR}}.

### Versão completa

- **AC-1 — Quem trata seus dados.** O restaurante {{NOME_DO_RESTAURANTE}} é o responsável (controlador) pelos seus dados. A plataforma EasyFeed, operada por {{RAZAO_SOCIAL}} (CNPJ {{CNPJ}}), trata os dados em nome do restaurante (operadora). Contato do restaurante: {{CONTATO_DO_RESTAURANTE}}. Contato de privacidade da EasyFeed: {{EMAIL_PRIVACIDADE}}.
- **AC-2 — O que é coletado.** (a) Ao abrir a página do QR code: data e hora, o tipo de navegador e uma versão embaralhada (hash) do seu endereço IP, usada só para contar aberturas e evitar abusos; nenhum formulário é preenchido nessa página. (b) Ao enviar a mensagem pelo WhatsApp: seu número de telefone, o texto da mensagem e, se você enviar áudio, a transcrição dele. Não pedimos seu nome e não o guardamos, a menos que você o escreva na mensagem. Não temos acesso à sua foto de perfil nem aos seus contatos.
- **AC-3 — Para que usamos.** Para o restaurante ler seu feedback, separar os pontos que você levantou (por exemplo, atendimento, comida, ambiente), identificar o sentimento, agrupar com outros feedbacks e criar tarefas de melhoria. Se o restaurante ativar o retorno ao cliente, usamos seu número para enviar uma mensagem avisando que o ponto que você relatou está sendo tratado ou foi resolvido, no máximo uma mensagem a cada 3 dias, somente por até 14 dias após a mudança da tarefa. Base legal: legítimo interesse do restaurante em atender você e melhorar o serviço (LGPD, art. 7º, IX), e, para o retorno ao cliente, {{BASE_LEGAL_RETORNO}}.
- **AC-4 — Uso de inteligência artificial.** O texto da sua mensagem é analisado por modelos de inteligência artificial de provedores externos (intermediados pela OpenRouter, nos Estados Unidos; modelo padrão da Google). O seu número de telefone não é enviado a esses modelos. A IA classifica, resume e destaca trechos; ela não decide nada sozinha sobre você. Se a mensagem indicar risco à saúde ou à segurança (por exemplo, intoxicação, corpo estranho na comida, agressão), o dono do restaurante recebe um alerta imediato com o texto completo e o seu número, para poder agir e, se necessário, falar com você.
- **AC-5 — Seu feedback não é anônimo.** O restaurante vê o seu número de telefone junto com o feedback. Se preferir não ser identificado, não envie a mensagem por este canal ou peça ao restaurante que anonimize o seu feedback.
- **AC-6 — Por quanto tempo.** Seu número e seu feedback ficam guardados enquanto o restaurante for cliente da EasyFeed e por {{PRAZO_RETENCAO_FEEDBACK}} depois, salvo pedido de exclusão. Os registros de abertura do QR (hash de IP e navegador) ficam por {{PRAZO_RETENCAO_QR_SCANS}}, sendo no mínimo 6 meses conforme o Marco Civil da Internet.
- **AC-7 — Com quem é compartilhado.** Com a EasyFeed e seus fornecedores de infraestrutura (banco de dados, gateway de WhatsApp, automação e provedores de IA — lista em {{URL_POLITICA}}). Alguns ficam fora do Brasil; a transferência segue a LGPD. Não vendemos seus dados e não os compartilhamos com outros restaurantes.
- **AC-8 — Seus direitos.** Você pode pedir acesso, correção, anonimização, exclusão, informação sobre compartilhamentos e parar de receber mensagens. Peça ao restaurante ({{CONTATO_DO_RESTAURANTE}}) ou à EasyFeed ({{EMAIL_PRIVACIDADE}}). Para parar de receber mensagens de retorno, responda "SAIR" ou peça diretamente ao restaurante; o descadastro é registrado na plataforma e vale para aquele restaurante. Você também pode reclamar à ANPD.
- **AC-9 — Menores de idade.** Este canal destina-se a maiores de 18 anos. Adolescentes (12 a 17 anos) podem enviar feedback; nesse caso o tratamento é feito no seu melhor interesse e limita-se ao necessário para responder ao feedback. Não coletamos intencionalmente dados de crianças (menores de 12 anos); se um responsável identificar que uma criança enviou mensagem, pode pedir a exclusão pelos contatos acima e ela será atendida com prioridade (LGPD, art. 14).
- **AC-10 — Se você citar outras pessoas.** Se a sua mensagem mencionar nome de garçom, de outro funcionário ou de outro cliente, esse dado passa a fazer parte do feedback e é tratado nas mesmas condições. Cite apenas o necessário para relatar a experiência. Pessoas citadas também podem exercer os direitos do item AC-8.
- **AC-11 — Mensagens que não são feedback.** Se você enviar uma pergunta (reserva, horário, pedido), receberá uma resposta automática informando que este canal é só para feedback e, se o restaurante tiver configurado, o número de contato correto.

---

## Parte D — Módulos de funcionalidade

Cada módulo descreve uma funcionalidade que trata dados pessoais. Os IDs dos módulos são estáveis. As cláusulas que um módulo acrescenta às Partes A, B e C usam o prefixo do módulo e valem apenas enquanto o status for `[ATIVO]`.

### MOD-CONTA — Conta, autenticação e painel `[ATIVO]`

- **Dados tratados:** nome, e-mail, senha (criptografada), avatar, nome de usuário, notas de perfil, preferências; dados do restaurante (PP-3.1); sessão e registros de autenticação; status de assinatura; contagem de feedbacks vistos.
- **Finalidade:** criar e manter a conta, autenticar, exibir o painel, aplicar permissões.
- **Base legal:** execução de contrato (art. 7º, V); obrigação legal para registros de acesso (art. 7º, II).
- **Suboperadores:** SUB-1 (Supabase), SUB-6 (Vercel), SUB-8 (Google Fonts).
- **Cláusulas:**
  - **MOD-CONTA-TU-1** Aplicam-se TU-2 e TU-10.
  - **MOD-CONTA-PP-1** Os e-mails de recuperação de senha e confirmação são enviados pelo serviço de autenticação do Supabase.
  - **MOD-CONTA-PP-2** A exclusão da conta pelo painel é reversível pelo EasyFeed (PP-8.3); a exclusão definitiva pode ser pedida por {{EMAIL_PRIVACIDADE}}.

### MOD-PAGAMENTO — Assinatura e cobrança `[ATIVO]`

- **Dados tratados:** ciclo do plano, status e datas da assinatura, identificadores de cliente e de assinatura no Stripe, cupons resgatados. Dados de cartão são coletados apenas pelo Stripe.
- **Finalidade:** cobrar, renovar, bloquear por inadimplência, liberar por cupom, emitir nota fiscal.
- **Base legal:** execução de contrato (art. 7º, V); obrigação legal fiscal (art. 7º, II).
- **Suboperadores:** SUB-1 (Supabase), SUB-7 (Stripe).
- **Observação de inventário:** a integração com o Stripe está prevista no código, mas ainda não publicada (checkout e webhook pendentes). Hoje a liberação ocorre por cupom de acesso ou manualmente pelo Administrador da Plataforma. Ver PEND-6.
- **Cláusulas:**
  - **MOD-PAGAMENTO-TU-1** Aplicam-se TU-3 e TU-4.
  - **MOD-PAGAMENTO-TU-2** O Restaurante autoriza o EasyFeed a consultar o Stripe sobre o status da assinatura e a atualizar o acesso ao painel com base nessa informação.
  - **MOD-PAGAMENTO-PP-1** A página de checkout é do Stripe e segue a política de privacidade do Stripe.

### MOD-QR — QR code, cartaz e página do cliente `[ATIVO]`

- **Dados tratados:** do Consumidor Final: hash SHA-256 do endereço IP, user agent, data e hora da abertura, QR aberto (que pode estar vinculado a um garçom). Do Restaurante: personalização do cartaz e da página (textos, imagens de fundo, logo).
- **Finalidade:** direcionar o Consumidor Final ao WhatsApp do Restaurante; contar aberturas por QR e por garçom (para bonificação, MOD-EQUIPE); bloquear QR de contas encerradas.
- **Base legal:** legítimo interesse (art. 7º, IX) para contagem e antiabuso; obrigação legal (art. 7º, II, Marco Civil art. 15) para registros de acesso.
- **Suboperadores:** SUB-1 (Supabase), SUB-6 (Vercel).
- **Cláusulas:**
  - **MOD-QR-TU-1** O Restaurante deve exibir o aviso da Parte C junto ao QR (TU-5.2). O EasyFeed disponibiliza a versão curta e o link da versão completa para inclusão no cartaz.
  - **MOD-QR-TU-2** Os QR codes deixam de funcionar quando a conta é excluída ou quando o QR é desativado no painel. QR codes já impressos são de responsabilidade do Restaurante.
  - **MOD-QR-PP-1** A página do QR não usa formulário, cookies nem rastreadores; ela apenas registra a abertura e abre o WhatsApp.
  - **MOD-QR-PP-2** O hash do IP é calculado sem sal; é uma pseudonimização, não uma anonimização (PEND-7).
  - **MOD-QR-AC-1** Aplica-se AC-2(a).

### MOD-WHATSAPP — Conexão do WhatsApp e ingestão de feedbacks `[ATIVO]`

- **Dados tratados:** do Restaurante: número conectado, token da instância no gateway, URL e token administrativo do gateway (copiados para cada restaurante), nome da instância. Do Consumidor Final: número de telefone, mensagem original (texto ou transcrição de áudio), trechos destacados, pontos separados, categoria, sentimento, resumo, tema, data e hora; identidade de contato por restaurante (telefone, data de descadastro, data do último envio).
- **Finalidade:** receber as mensagens enviadas ao número do Restaurante, transformá-las em feedbacks estruturados e exibi-las no painel; responder automaticamente a mensagens que não são feedback indicando o canal correto.
- **Base legal:** legítimo interesse do Restaurante (art. 7º, IX) para o feedback; execução de contrato com o Restaurante (art. 7º, V).
- **Suboperadores:** SUB-1 (Supabase), SUB-2 (OpenRouter e provedores de modelo), SUB-4 (gateway UZAPI), SUB-5 (n8n), SUB-9 (WhatsApp/Meta), SUB-10 (transcrição de áudio, provedor a confirmar).
- **Observação de inventário:** o fluxo de entrada (recebimento da mensagem, transcrição de áudio, triagem "é feedback?", separação em pontos e gravação no banco) roda no n8n, fora deste repositório. O provedor de transcrição e o modelo usado na separação de pontos não puderam ser confirmados pelo código (PEND-8).
- **Cláusulas:**
  - **MOD-WHATSAPP-TU-1** Aplicam-se TU-5.3 e TU-5.4. O Restaurante reconhece que a conexão é feita por gateway não oficial da Meta e que a Meta pode restringir o número.
  - **MOD-WHATSAPP-TU-2** O EasyFeed desconecta a instância quando a assinatura não está ativa ou a conta é excluída, e apaga o token guardado.
  - **MOD-WHATSAPP-TU-3** O Restaurante não deve usar o número conectado para conversar manualmente com clientes por outros meios que interfiram na ingestão, nem enviar mensagens em massa por ele.
  - **MOD-WHATSAPP-PP-1** O mesmo telefone que envia feedback a dois restaurantes gera dois contatos independentes; nenhum restaurante vê o histórico do outro.
  - **MOD-WHATSAPP-PP-2** O número do Consumidor Final é guardado em formato numérico normalizado (código do país, DDD e número).
  - **MOD-WHATSAPP-AC-1** Aplicam-se AC-2(b), AC-5 e AC-11.

### MOD-IA — Análise por inteligência artificial `[ATIVO]`

- **Dados tratados:** conteúdo dos feedbacks (texto original, pontos separados), temas existentes do restaurante, insights e ações existentes, perfil do restaurante (nome, culinária, público, diferenciais, detalhes), memórias do assistente, trechos de documentos de conhecimento, mensagens e imagens do chat, resultados de busca web quando habilitada. Registro de consumo (modelo, tokens, custo). O telefone do Consumidor Final não é incluído nos prompts.
- **Finalidade:** classificar feedbacks em temas; vincular feedback a ação ou insight existente; destacar trechos; gerar insights, sugerir ações, gerar planos de ação, atualizar banner, categorizar ações, triar urgência; responder no assistente; gerar resumo executivo de relatórios.
- **Agentes existentes (configuráveis pelo Administrador da Plataforma):** classificador de feedback, vinculador de feedback, gerador de insights, sugeridor de ações, plano de ação, categorizador de ação, banner, triagem de urgência, assistente.
- **Base legal:** execução de contrato com o Restaurante (art. 7º, V); legítimo interesse do Restaurante quanto ao conteúdo do Consumidor Final (art. 7º, IX).
- **Suboperadores:** SUB-2 (OpenRouter), SUB-3 (Google, modelo padrão `google/gemini-2.5-flash-lite`; outros modelos conforme configuração do administrador), SUB-11 (Exa, apenas quando busca web ativada). Embeddings para busca semântica são gerados dentro da infraestrutura do Supabase (modelo `gte-small`), sem envio a terceiros.
- **Cláusulas:**
  - **MOD-IA-TU-1** Aplica-se TU-7 integralmente.
  - **MOD-IA-TU-2** O Administrador da Plataforma pode trocar o modelo de IA de cada agente, editar prompts e ativar busca web. Trocas que alterem o provedor de modelo implicam atualização da Parte E.
  - **MOD-IA-TU-3** O uso de IA é limitado por cota mensal de crédito por restaurante (TU-6.3).
  - **MOD-IA-PP-1** As chamadas aos modelos passam pela OpenRouter, que roteia para o provedor do modelo escolhido. O código não envia instrução de "não coletar dados" à OpenRouter; a retenção e o eventual uso para treinamento por parte da OpenRouter e dos provedores dependem das configurações da conta e dos termos desses fornecedores, que estão sendo verificados (PEND-3). O EasyFeed não usa feedbacks para treinar modelos próprios.
  - **MOD-IA-PP-2** Imagens enviadas no chat do assistente são armazenadas em bucket público de leitura do Supabase e enviadas ao modelo de IA. Não envie imagens com dados pessoais de terceiros.
  - **MOD-IA-PP-3** O resumo executivo de relatórios é gerado no navegador, que aciona a função de IA do servidor; o PDF e a planilha são montados no próprio navegador e não são enviados ao EasyFeed.
  - **MOD-IA-AC-1** Aplica-se AC-4.

### MOD-RETORNO — Retorno ao cliente (motor de resposta) `[ATIVO]`

- **Dados tratados:** telefone do Consumidor Final; vínculo entre feedback e ação; título, categoria, prioridade e plano da ação; texto da mensagem enviada; status de envio; identificador da mensagem no gateway; data do último envio; data de descadastro.
- **Finalidade:** avisar o Consumidor Final, em nome do Restaurante, que o ponto relatado está em andamento ou foi resolvido, no máximo uma mensagem a cada 3 dias por contato, com avisos válidos por 14 dias.
- **Base legal:** {{BASE_LEGAL_RETORNO}} (legítimo interesse do Restaurante em dar retorno a quem reclamou, ou consentimento coletado no aviso — ver PEND-10).
- **Suboperadores:** SUB-1 (Supabase), SUB-4 (gateway UZAPI), SUB-5 (n8n), SUB-9 (WhatsApp/Meta), SUB-2/SUB-3 se o fluxo do n8n usar IA para redigir a mensagem.
- **Observação de inventário:** o motor vem desligado por padrão e é ativado por restaurante. Existe modo "simulado" (registra sem enviar). O descadastro por palavra-chave ("SAIR") não é automático hoje: depende de configuração no n8n ou de marcação manual (PEND-11).
- **Cláusulas:**
  - **MOD-RETORNO-TU-1** O Restaurante decide ativar o módulo e responde pelo conteúdo enviado em seu nome. O EasyFeed fornece um texto sugerido; o Restaurante pode revisar o padrão.
  - **MOD-RETORNO-TU-2** O Restaurante deve registrar imediatamente na Plataforma qualquer pedido de descadastro recebido pelo WhatsApp, até que o descadastro automático esteja disponível.
  - **MOD-RETORNO-TU-3** Mensagens de retorno não podem conter propaganda, promoção ou pedido de avaliação condicionado à nota.
  - **MOD-RETORNO-PP-1** Todas as mensagens enviadas ficam registradas (texto, destinatário, status) para comprovação, pelo prazo de {{PRAZO_RETENCAO_MENSAGENS}}.
  - **MOD-RETORNO-AC-1** Aplicam-se AC-3 (parte final) e AC-8 (descadastro).

### MOD-ALERTA — Alerta urgente ao dono `[ATIVO]`

- **Dados tratados:** texto completo da mensagem do Consumidor Final, trecho suspeito, termos detectados, telefone do Consumidor Final, número de WhatsApp do dono, credenciais da instância do restaurante (para o n8n enviar), motivo gerado por IA.
- **Finalidade:** avisar o dono do Restaurante imediatamente quando um feedback indica risco sanitário, de segurança, discriminação ou fraude grave.
- **Base legal:** legítimo interesse (art. 7º, IX) e proteção da vida e da incolumidade física (art. 7º, VII), quando aplicável.
- **Suboperadores:** SUB-2/SUB-3 (confirmação por IA), SUB-4, SUB-5, SUB-9.
- **Cláusulas:**
  - **MOD-ALERTA-TU-1** Aplica-se TU-7.4: o alerta é um filtro automático de duas etapas (léxico e confirmação por IA) e pode falhar em ambos os sentidos.
  - **MOD-ALERTA-TU-2** O número do dono é informado no onboarding e pode ser alterado nas configurações. O Restaurante deve mantê-lo atualizado.
  - **MOD-ALERTA-PP-1** O alerta contém o telefone do Consumidor Final para permitir contato de emergência; o Restaurante deve usá-lo apenas para tratar a ocorrência.
  - **MOD-ALERTA-AC-1** Aplica-se AC-4 (parte final).

### MOD-EQUIPE — Garçons, QR individual e bonificação `[ATIVO]`

- **Dados tratados:** nome e telefone do garçom; QR code vinculado ao garçom; contagem de aberturas por garçom; regras de bonificação (meta, período, prêmio, participantes); marcos atingidos; registro de bônus pago; mensagens enviadas ao garçom via WhatsApp quando atinge marcos.
- **Finalidade:** avaliar atendimento por garçom, gerenciar metas e enviar avisos de conquista ao próprio garçom.
- **Base legal:** legítimo interesse do Restaurante na gestão da equipe (art. 7º, IX); execução de contrato de trabalho ou de prestação de serviço entre Restaurante e garçom, conforme o caso (art. 7º, V).
- **Suboperadores:** SUB-1, SUB-4, SUB-5, SUB-9.
- **Cláusulas:**
  - **MOD-EQUIPE-TU-1** Aplica-se TU-5.5: o Restaurante informa o garçom sobre o cadastro, sobre a contagem de aberturas do seu QR e sobre as mensagens automáticas de bonificação, e obtém a concordância dele quando exigido pela relação de trabalho.
  - **MOD-EQUIPE-TU-2** A contagem de aberturas de QR mede aberturas de página, não feedbacks nem avaliações; não deve ser usada isoladamente para decisões trabalhistas (TU-7.3).
  - **MOD-EQUIPE-PP-1** O garçom pode pedir ao Restaurante ou ao EasyFeed o acesso ou a exclusão dos seus dados; a exclusão do cadastro pelo painel desativa o QR vinculado.
  - **MOD-EQUIPE-AC-1** Aplica-se AC-10 quando o Consumidor Final cita um garçom.

### MOD-ASSISTENTE — Assistente de IA do painel, memórias e base de conhecimento `[ATIVO]`

- **Dados tratados:** mensagens do chat (com contexto da página e dados exibidos), imagens enviadas, nomes e pastas de conversas, "memórias" (fatos que o assistente guarda sobre o restaurante), documentos e links enviados como conhecimento (texto extraído, trechos e embeddings), registro das alterações que o assistente fez nos dados (antes/depois), modo de ação escolhido (perguntar antes / automático).
- **Finalidade:** responder perguntas sobre os dados do restaurante, executar ações no painel a pedido do usuário, lembrar preferências.
- **Base legal:** execução de contrato (art. 7º, V).
- **Suboperadores:** SUB-1, SUB-2, SUB-3, SUB-11 (busca web, quando ativada).
- **Cláusulas:**
  - **MOD-ASSISTENTE-TU-1** No modo "automático", o assistente pode alterar dados sem confirmar. Toda alteração fica registrada e pode ser revertida pelo painel. O Restaurante responde pela escolha do modo.
  - **MOD-ASSISTENTE-TU-2** Pedidos fora do escopo (temas não relacionados ao restaurante) são recusados antes de chegar ao modelo.
  - **MOD-ASSISTENTE-TU-3** Documentos enviados como conhecimento devem ser de titularidade do Restaurante ou de uso autorizado. O EasyFeed também mantém uma base de conhecimento global (materiais do próprio EasyFeed), usada por todos os restaurantes.
  - **MOD-ASSISTENTE-PP-1** As conversas ficam guardadas até serem apagadas pelo usuário ou até {{PRAZO_RETENCAO_CHAT}}.
  - **MOD-ASSISTENTE-PP-2** Aplica-se MOD-IA-PP-1 e MOD-IA-PP-2.

### MOD-SUPORTE — Canal de sugestões e notificações da equipe EasyFeed `[ATIVO]`

- **Dados tratados:** mensagens, arquivos e reações trocados entre o Restaurante e a equipe do EasyFeed; datas de leitura; para Administradores da Plataforma: inscrição de notificação push (endpoint, chaves, user agent).
- **Finalidade:** suporte e coleta de sugestões; avisar a equipe do EasyFeed de novas mensagens.
- **Base legal:** execução de contrato (art. 7º, V); consentimento do administrador para push (art. 7º, I).
- **Suboperadores:** SUB-1; serviço de push do navegador do administrador (Google, Apple ou Mozilla, conforme o navegador).
- **Cláusulas:**
  - **MOD-SUPORTE-TU-1** Aplica-se TU-8.5.
  - **MOD-SUPORTE-PP-1** Arquivos enviados ficam em bucket do Supabase; podem ser apagados pelo Restaurante ou pelo administrador.

### MOD-DEMO — Vendedores e demonstração `[ATIVO]`

- **Dados tratados:** e-mail do Vendedor; código temporário de 6 dígitos; sessão de demonstração (início, fim, identificador da sessão); endereço IP de quem tenta entrar na demonstração (guardado em texto claro por 1 dia, para limitar tentativas).
- **Finalidade:** permitir que um Vendedor apresente a Plataforma no computador de um potencial cliente por 2 horas, sem expor senha.
- **Base legal:** legítimo interesse (art. 7º, IX).
- **Suboperadores:** SUB-1.
- **Cláusulas:**
  - **MOD-DEMO-TU-1** A conta de demonstração é a própria conta do Vendedor; durante a demonstração, funções que afetam WhatsApp, assinatura e exclusão ficam bloqueadas.
  - **MOD-DEMO-TU-2** O potencial cliente que assiste à demonstração não deve inserir dados reais de clientes seus.
  - **MOD-DEMO-PP-1** A sessão é encerrada automaticamente em 2 horas e o registro de tentativas de acesso (IP) é apagado após 1 dia.

### MOD-AFILIADOS — Programa de afiliados e divisão de receita `[ATIVO — apenas administrativo]`

- **Dados tratados:** nome, e-mail, telefone, CPF/CNPJ, banco, agência, conta, tipo de conta, chave Pix, identificador de conta no Stripe, código de afiliado, tipo e valor de comissão, observações; beneficiários de divisão de receita (nome, tipo, valor, chave Pix).
- **Finalidade:** remunerar afiliados e parceiros pela indicação de clientes.
- **Base legal:** execução de contrato com o afiliado (art. 7º, V); obrigação legal fiscal (art. 7º, II).
- **Suboperadores:** SUB-1, SUB-7 (Stripe, quando houver repasse).
- **Observação de inventário:** existe cadastro no painel administrativo, mas não há termos de afiliado nem página pública do programa (PEND-12).
- **Cláusulas:**
  - **MOD-AFILIADOS-TU-1** Condições do programa de afiliados: {{TERMOS_AFILIADOS}}.
  - **MOD-AFILIADOS-PP-1** Dados bancários são usados apenas para repasse de comissão e guardados pelo prazo fiscal.

### MOD-GOOGLE-REVIEW — Convite para avaliação no Google `[PLANEJADO]`

- **Descrição:** após o feedback, o Consumidor Final recebe um convite para avaliar o restaurante no Google (Perfil da Empresa / Google Maps), por link.
- **Dados tratados (previstos):** telefone do Consumidor Final (para enviar o convite pelo WhatsApp), data do envio, se o link foi aberto (se for medido). O EasyFeed não recebe o conteúdo da avaliação publicada no Google.
- **Finalidade:** facilitar que clientes avaliem o restaurante publicamente.
- **Base legal (prevista):** legítimo interesse do Restaurante (art. 7º, IX), com opção de descadastro.
- **Suboperadores (previstos):** SUB-4, SUB-5, SUB-9; Google LLC (plataforma de destino, não é suboperador: o EasyFeed apenas redireciona).
- **Regra obrigatória de conformidade:** o convite deve ser oferecido a **todos** os Consumidores Finais que enviarem feedback, **independentemente da nota, do sentimento ou do conteúdo** do feedback. É proibido filtrar, condicionar ou direcionar o convite apenas a clientes satisfeitos ("review gating"), oferecer recompensa pela avaliação ou pedir alteração de avaliação, em conformidade com a política de conteúdo do Google Maps sobre contribuições de usuários.
- **Cláusulas (entram em vigor na ativação):**
  - **MOD-GOOGLE-REVIEW-TU-1** O Restaurante não pode configurar o convite para ser enviado apenas a parte dos clientes com base na avaliação recebida, nem oferecer vantagem em troca da avaliação. Violação autoriza o EasyFeed a desativar o módulo para a conta.
  - **MOD-GOOGLE-REVIEW-TU-2** O EasyFeed apenas redireciona o Consumidor Final ao Google. Não controla, não edita, não remove e não responde por avaliações publicadas, pela política do Google, por suspensão do perfil do Restaurante nem por disponibilidade da plataforma do Google.
  - **MOD-GOOGLE-REVIEW-TU-3** O Restaurante deve possuir Perfil da Empresa no Google e informar o link correto de avaliação.
  - **MOD-GOOGLE-REVIEW-PP-1** O convite é enviado no mesmo canal de WhatsApp e respeita o descadastro e o intervalo mínimo entre mensagens de MOD-RETORNO.
  - **MOD-GOOGLE-REVIEW-AC-1** Texto a inserir na Parte C: "Você poderá receber, uma única vez, um convite para avaliar o restaurante no Google. O convite é enviado a todos os clientes que deixam feedback, seja ele positivo ou negativo. Avaliar é opcional; ao clicar no link você será levado ao Google, que tem sua própria política de privacidade."

---

## Parte E — Lista de suboperadores

Lista derivada do código em 2026-09-28. Itens marcados "a confirmar" não puderam ser verificados no repositório e constam em PEND-4.

- **SUB-1 — Supabase, Inc.**
  - Função: banco de dados, autenticação, armazenamento de arquivos (logos, avatares, fundos de QR, imagens do chat, documentos de conhecimento, anexos de suporte), funções de servidor, agendamento de tarefas, geração de embeddings.
  - Dados enviados: todos os dados descritos nas Partes B e C.
  - País: Estados Unidos (empresa); região do projeto: {{REGIAO_SUPABASE}} (a confirmar).

- **SUB-2 — OpenRouter, Inc.**
  - Função: intermediário de acesso a modelos de IA; busca web opcional.
  - Dados enviados: texto dos feedbacks, temas, insights, ações, perfil do restaurante, memórias, trechos de documentos, mensagens e imagens do chat. Não recebe telefone de consumidores.
  - País: Estados Unidos.

- **SUB-3 — Google LLC (modelos Gemini, via OpenRouter)**
  - Função: provedor do modelo de IA padrão (`google/gemini-2.5-flash-lite`); outros modelos podem ser configurados pelo administrador, caso em que o provedor correspondente entra nesta lista.
  - Dados enviados: os mesmos de SUB-2, conforme roteamento.
  - País: Estados Unidos.

- **SUB-4 — UZAPI / uazapiGO ({{RAZAO_SOCIAL_UAZAPI}})**
  - Função: gateway de conexão do número de WhatsApp do restaurante (recebe e envia mensagens).
  - Dados enviados: número do restaurante, nome do restaurante, conteúdo das mensagens recebidas e enviadas, telefone dos consumidores e dos garçons.
  - País: {{PAIS_UAZAPI}} (a confirmar; a URL do servidor é configurada pelo administrador).

- **SUB-5 — n8n ({{HOSPEDAGEM_N8N}})**
  - Função: automação: fluxo de entrada das mensagens (transcrição, triagem, separação em pontos), envio de retornos ao cliente, alertas urgentes ao dono e avisos de bonificação aos garçons.
  - Dados enviados: mensagens recebidas, telefone dos consumidores, feedbacks, dados das ações, nome do restaurante, número do dono, telefone e nome dos garçons, credenciais da instância do WhatsApp.
  - País: {{PAIS_N8N}} (a confirmar se auto-hospedado ou n8n Cloud).

- **SUB-6 — Vercel, Inc.**
  - Função: hospedagem e distribuição do painel web e da página do QR.
  - Dados enviados: endereço IP e cabeçalhos de requisição de quem acessa o site (logs de borda).
  - País: Estados Unidos, com distribuição global. Existe também configuração de contêiner (Dockerfile/nginx) no repositório; a hospedagem efetiva deve ser confirmada (PEND-4).

- **SUB-7 — Stripe, Inc. / Stripe Brasil Soluções de Pagamento Ltda.**
  - Função: processamento de pagamentos e gestão de assinaturas.
  - Dados enviados: e-mail, nome, dados de cartão (informados diretamente ao Stripe), identificadores de cliente e assinatura, valor e ciclo.
  - País: Estados Unidos, com entidade no Brasil. Integração ainda não publicada (PEND-6).

- **SUB-8 — Google LLC (Google Fonts)**
  - Função: fornecimento de fontes tipográficas ao navegador.
  - Dados enviados: endereço IP e user agent do visitante no carregamento da fonte.
  - País: Estados Unidos.

- **SUB-9 — WhatsApp LLC / Meta Platforms, Inc.**
  - Função: canal de mensagens usado pelo consumidor e pelo restaurante. Não é contratado pelo EasyFeed; atua sob seus próprios termos.
  - Dados: número e conteúdo das mensagens, conforme a política do WhatsApp.
  - País: Estados Unidos / Irlanda.

- **SUB-10 — Serviço de transcrição de áudio ({{PROVEDOR_TRANSCRICAO}})**
  - Função: transcrever áudios enviados pelo consumidor.
  - Dados enviados: o arquivo de áudio.
  - País: {{PAIS_TRANSCRICAO}}. Ocorre no fluxo do n8n; provedor não confirmado pelo código (PEND-8).

- **SUB-11 — Exa AI, Inc. (via OpenRouter)**
  - Função: busca web para o assistente, apenas quando o administrador ativa a busca em um agente e o modelo não tem busca própria.
  - Dados enviados: a consulta gerada a partir da pergunta do usuário.
  - País: Estados Unidos.

- **SUB-12 — Serviços de push do navegador (Google FCM, Apple APNs, Mozilla)**
  - Função: entregar notificações push aos Administradores da Plataforma.
  - Dados enviados: identificador da inscrição e conteúdo criptografado da notificação.
  - País: Estados Unidos.

---

## Anexo I — Template de novo módulo

Copie o bloco abaixo para a Parte D ao criar uma funcionalidade que trate dados pessoais. Enquanto o status for `[PLANEJADO]`, as cláusulas do módulo não têm efeito.

```
### MOD-{{ID}} — {{Nome da funcionalidade}} `[PLANEJADO]`

- **Descrição:** {{o que a funcionalidade faz, em uma frase}}
- **Dados tratados:** {{de quem e quais dados; dizer se inclui dados do Consumidor Final}}
- **Finalidade:** {{para quê}}
- **Base legal:** {{art. 7º, inciso; ou art. 11 se dado sensível}}
- **Suboperadores:** {{SUB-n existentes ou novos; novos entram na Parte E}}
- **Retenção:** {{prazo ou referência a PP-8}}
- **Observação de inventário:** {{o que foi confirmado no código e o que não foi}}
- **Cláusulas:**
  - **MOD-{{ID}}-TU-1** {{o que muda para o Restaurante nos Termos}}
  - **MOD-{{ID}}-PP-1** {{o que muda na Política}}
  - **MOD-{{ID}}-AC-1** {{texto a inserir no aviso ao consumidor, se houver}}
```

### Como ativar um módulo

1. Confirmar no código o que o módulo realmente trata (tabelas, funções, integrações). Não ativar com base em plano.
2. Preencher todos os `{{ }}` do módulo. Se surgir suboperador novo, incluí-lo na Parte E com o próximo `SUB-n` e verificar transferência internacional (PP-6).
3. Trocar o status para `[ATIVO]`.
4. Revisar as Partes A, B e C: se o módulo altera finalidades, dados coletados, compartilhamento ou retenção, acrescentar cláusulas novas com IDs novos (nunca renumerar) e referenciar o módulo.
5. Se o módulo tratar dados do Consumidor Final, atualizar a Parte C e avisar os Restaurantes com antecedência (PP-11.2), para que atualizem os cartazes.
6. Subir a versão no cabeçalho: mudança de módulo ou de cláusula relevante = versão menor (0.x.0); correção de texto = versão de correção (0.0.x); reestruturação ou mudança que exija novo aceite = versão maior.
7. Registrar no changelog: versão, data, módulos ativados/desativados, cláusulas adicionadas ou revogadas.
8. Publicar em {{URL_TERMOS}} e comunicar conforme TU-11.

### Como desativar um módulo

1. Trocar o status para `[DESATIVADO]` e manter o bloco no documento (não apagar) com a data e o motivo.
2. Registrar o que acontece com os dados já coletados por ele (exclusão, anonimização ou retenção pelo prazo legal).
3. Subir a versão e registrar no changelog.

---

## Anexo II — Pendências jurídicas

Itens que exigem decisão do responsável pelo produto ou validação por advogado antes da publicação. Nenhum deles foi resolvido por suposição neste rascunho.

- **PEND-1 — Papel LGPD sobre os dados do Consumidor Final.** Opção adotada no rascunho: Restaurante controlador, EasyFeed operador (PP-2.2). Justificativa: o Restaurante decide coletar feedback dos próprios clientes, escolhe ativar retorno, alertas e bonificação, e é quem tem relação direta com o consumidor; o EasyFeed trata os dados conforme instruções documentadas (estes Termos). Ressalvas que puxam para controladoria conjunta ou controladoria própria do EasyFeed: (a) o EasyFeed define sozinho os meios essenciais — modelos de IA, prompts, prazos de retenção, regras do motor de resposta (cooldown, expiração), estrutura de contatos; (b) o Administrador da Plataforma tem acesso operacional a todas as contas; (c) se o EasyFeed usar conteúdo de feedbacks (mesmo agregado) para melhorar prompts, treinar classificadores ou alimentar a base de conhecimento global, passa a ser controlador para essa finalidade e a Parte C precisa informar isso. Hoje o código não faz (c). Validar com advogado e, se for o caso, redigir acordo de operador/controlador conjunto (art. 42, §1º) como anexo.
- **PEND-2 — Encarregado (DPO).** Verificar se {{RAZAO_SOCIAL}} se enquadra como agente de tratamento de pequeno porte (Resolução CD/ANPD nº 2/2022: microempresa, EPP, startup etc.) e se não realiza tratamento de alto risco (a resolução afasta o benefício em casos como tratamento em larga escala ou de dados sensíveis). Se dispensado, manter o canal {{EMAIL_PRIVACIDADE}} e dizer expressamente na Política que não há encarregado nomeado. Atenção: feedbacks sobre "passei mal", "reação alérgica" podem conter dados de saúde (sensíveis) escritos espontaneamente pelo consumidor; avaliar impacto nessa análise e na base legal (art. 11).
- **PEND-3 — Uso de dados para treinamento pelos provedores de IA.** O código não envia à OpenRouter parâmetros de roteamento por política de dados (por exemplo, preferência por provedores que não retêm ou não treinam com prompts). Verificar: (a) as configurações de privacidade da conta OpenRouter (retenção de logs, permissão de provedores que treinam com dados); (b) os termos da API do Google Gemini via OpenRouter quanto a retenção e treinamento; (c) o modelo do n8n (GPT ou outro) usado no fluxo de entrada e seus termos; (d) o provedor de transcrição. Decidir se será configurada preferência por provedores sem treinamento e ajustar MOD-IA-PP-1 e AC-4 conforme o resultado.
- **PEND-4 — Instrumentos de transferência internacional e localização.** Confirmar: região do projeto Supabase; hospedagem do n8n (auto-hospedado, em que país, ou n8n Cloud); servidor do gateway UZAPI (país e razão social); hospedagem efetiva do frontend (Vercel ou contêiner próprio). Para cada suboperador fora do Brasil, obter e arquivar o instrumento (cláusulas contratuais padrão da ANPD incorporadas ao contrato, DPA do fornecedor ou outra hipótese do art. 33) e conferir aderência à Resolução CD/ANPD nº 19/2024.
- **PEND-5 — Prazos de retenção não definidos.** Não há rotina de expurgo para: feedbacks e contatos de consumidores, registros de abertura de QR, mensagens enviadas, conversas do assistente, mensagens de suporte, consumo de IA, contas canceladas/excluídas. Definir os prazos dos placeholders `{{PRAZO_*}}` e implementar a exclusão ou anonimização correspondente. Garantir o mínimo de 6 meses para registros de acesso (Marco Civil, art. 15) e verificar se os logs de autenticação do Supabase cumprem esse mínimo (o plano do Supabase pode reter menos).
- **PEND-6 — Fluxo de pagamento e momento da criação da conta.** O briefing descreve pagamento antes da criação da conta; o código implementa o inverso (conta criada primeiro, checkout depois), e o checkout do Stripe ainda não está publicado (função de criação de sessão e webhook pendentes). Definir o fluxo final e ajustar TU-1.2, TU-2 e TU-3. Definir também: política de reembolso (TU-4.5), aplicabilidade do art. 49 do CDC a assinantes pessoa jurídica (TU-4.4), prazo de aviso de reajuste (TU-3.6) e emissão de nota fiscal.
- **PEND-7 — Hash de IP sem sal nas aberturas de QR.** O SHA-256 do IP sem sal permite reidentificação por força bruta do espaço de IPv4; tratar como dado pseudonimizado (não anônimo) e considerar sal secreto rotativo ou truncamento. Ajustar MOD-QR-PP-2 conforme a decisão técnica.
- **PEND-8 — Fluxo de entrada no n8n (fora do repositório).** Confirmar e documentar: provedor e país da transcrição de áudio; modelo de IA usado na triagem e separação de pontos; se o áudio original é guardado e por quanto tempo; se o n8n guarda histórico de conversa (tabelas `n8n_chat_histories` e `message_buffer` existem no banco e são geridas pelo n8n); se há dados do consumidor em logs do n8n. Atualizar SUB-5 e SUB-10.
- **PEND-9 — Credenciais do gateway visíveis ao próprio restaurante.** O token administrativo global e a URL do gateway são copiados para a linha de cada restaurante e legíveis pelo dono no painel (decisão consciente registrada no código). Avaliar risco e, se necessário, restringir as colunas. Não é cláusula, mas afeta PP-7.
- **PEND-10 — Base legal do retorno ao cliente e do convite ao Google.** Escolher entre legítimo interesse (com teste de balanceamento documentado e opção fácil de descadastro) ou consentimento coletado no aviso do QR. A escolha altera AC-3, MOD-RETORNO e MOD-GOOGLE-REVIEW. Avaliar também a aderência às políticas comerciais do WhatsApp para mensagens iniciadas pela empresa.
- **PEND-11 — Descadastro automático ("SAIR").** O descadastro depende hoje de marcação manual ou de configuração no n8n. Para sustentar o aviso AC-8, implementar o reconhecimento automático da palavra-chave ou ajustar o texto do aviso até lá.
- **PEND-12 — Programa de afiliados.** Existe cadastro de afiliados com CPF/CNPJ e dados bancários no painel administrativo, sem termos de afiliação. Redigir contrato/termos de afiliado, definir base legal e retenção, e confirmar se o repasse usa Stripe Connect (há campo para conta Stripe).
- **PEND-13 — Menores de idade.** Validar o texto AC-9 (adolescentes podem enviar; crianças não são alvo; exclusão a pedido do responsável) frente ao art. 14 da LGPD e ao ECA, considerando que o canal é o WhatsApp (que exige idade mínima própria) e que não há verificação de idade possível.
- **PEND-14 — Dados de terceiros citados no feedback.** Validar AC-10 e definir procedimento para pedidos de garçons ou outros citados (anonimização do nome no texto do feedback, por exemplo). Avaliar se o Restaurante deve informar a equipe (aviso interno) sobre a possibilidade de citação nominal em feedbacks e nos insights.
- **PEND-15 — Aceite dos Termos no cadastro.** O formulário de cadastro não tem caixa de aceite nem link para Termos e Política. Incluir aceite expresso (com registro de data/versão) antes da publicação. Não é cláusula, mas condiciona TU-1.2.
- **PEND-16 — Dados fiscais e identificação do Assinante.** O cadastro não coleta CNPJ nem razão social do restaurante; a nota fiscal e a qualificação de "pessoa jurídica" (TU-1.5) dependem disso. Definir se o CNPJ será coletado no onboarding ou no checkout.
- **PEND-17 — Placeholders a preencher.** {{RAZAO_SOCIAL}}, {{CNPJ}}, {{ENDERECO}}, {{FORO}}, {{EMAIL_PRIVACIDADE}}, {{EMAIL_SUPORTE}}, {{WHATSAPP_SUPORTE}}, {{HORARIO_SUPORTE}}, {{RESPONSAVEL_PRIVACIDADE}}, {{URL_SITE}}, {{URL_TERMOS}}, {{URL_POLITICA}}, {{URL_AVISO_CONSUMIDOR}}, {{DATA_VIGENCIA}}, {{SLA}}, {{PRAZO_AVISO_PRECO}}, {{PRAZO_AVISO_TERMOS}}, {{POLITICA_REEMBOLSO}}, {{POLITICA_ARREPENDIMENTO_B2B}}, {{PRAZO_RESTAURACAO_CONTA}}, {{PRAZO_RETENCAO_CONTA_INATIVA}}, {{PRAZO_RETENCAO_FEEDBACK}}, {{PRAZO_RETENCAO_QR_SCANS}}, {{PRAZO_RETENCAO_MENSAGENS}}, {{PRAZO_RETENCAO_CHAT}}, {{PRAZO_RETENCAO_SUPORTE}}, {{PRAZO_RETENCAO_USO_IA}}, {{BASE_LEGAL_MARKETING}}, {{BASE_LEGAL_RETORNO}}, {{REGIAO_SUPABASE}}, {{REGIAO_N8N}}, {{REGIAO_UAZAPI}}, {{RAZAO_SOCIAL_UAZAPI}}, {{PAIS_UAZAPI}}, {{HOSPEDAGEM_N8N}}, {{PAIS_N8N}}, {{PROVEDOR_TRANSCRICAO}}, {{PAIS_TRANSCRICAO}}, {{TERMOS_AFILIADOS}}, e, por restaurante, {{NOME_DO_RESTAURANTE}} e {{CONTATO_DO_RESTAURANTE}}.
