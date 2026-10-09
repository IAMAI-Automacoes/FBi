# Workflows do n8n

- **Feedback Restaurante**: `feedback-restaurante.json`, teste `testar-feedback-restaurante.cjs`. Recebe as mensagens dos clientes (este arquivo explica ele).
- **Status Ações**: `status-acoes.json`, teste `testar-status-acoes.cjs`. Manda as atualizações das ações e o aviso do PARAR (ver [PARAR](#parar-as-atualizações-das-ações)).
- **Recuperação de senha**: `recuperar-senha.json`, ver `recuperar-senha.md`.

Os testes rodam no `npm test`.

# Workflow do n8n "Feedback Restaurante"

Recebe o que os clientes mandam para o WhatsApp de feedback do restaurante (webhook `POST /webhook/easyfeed`, configurado em cada instância da uazapi pela função `whatsapp-instancia`), grava o feedback e responde.

## O que acontece com cada mensagem

Só entram mensagens de **texto** e **áudio** (o áudio é transcrito). Foto, vídeo, figurinha, reação, documento, grupo e mensagens do próprio número são ignorados.

- **Feedback** (elogio, crítica, comentário morno, sugestão): grava em `feedbacks_originais` + um `feedbacks_restaurante` por ponto, e a Helena agradece (ver abaixo).
- **Pergunta ou pedido completo sobre o restaurante** (horário, reserva, pedido…): não grava; indica o número de contato das Configurações (`restaurantes.telefone_contato`) — só o número, com 55 e sem parênteses nem hífen (ex.: 5511987654321), sem link do WhatsApp. Sem número configurado, só avisa que o canal é de feedback.
- **Pergunta incompleta** ("tenho uma dúvida", "queria saber uma coisa"), em que não dá para saber o assunto: não responde. Se a pessoa completar em seguida, o buffer junta as duas mensagens.
- **Feedback + pergunta**: grava, agradece e encaminha, numa mensagem só.
- **Saudação sozinha, "obrigado", "ok", emoji, assunto fora do restaurante**: não grava e não responde.
- **Pedido para parar de receber as atualizações** ("PARAR", "não quero mais receber"): a resposta normal fica calada e o caminho do PARAR cuida (ver abaixo).

Saudação que chega junto com o feedback (o buffer junta as mensagens em sequência) é tratada como parte do feedback.

## A Helena

Quem responde é a **Helena**, do atendimento do restaurante. Ela se apresenta ("Oi! Aqui é a Helena, do Camelo.") só na **primeira resposta do dia** para cada pessoa; nas outras, vai direto ao assunto.

- As respostas são **mensagens prontas**, escritas como gente escreve no WhatsApp, sorteadas no nó "Monta a resposta" conforme o sentimento (positivo, negativo, positivo e negativo, neutro, sugestão). A IA não escreve texto.
- A IA só devolve pedaços curtos que completam algumas mensagens: `elogio` ("o petit gâteau"), `problema` ("a pizza fria") e `ideia` ("a música ao vivo"). O cliente não é chamado pelo nome: o nome do perfil do WhatsApp muitas vezes não é o real nem está escrito certo. O código confere cada pedaço (minúsculo, começando com artigo, curto); pedaço estranho é ignorado e o sorteio usa só as mensagens que não precisam dele. "por a pizza fria" vira "pela pizza fria".
- A mensagem é separada em blocos com linha em branco (apresentação, agradecimento, encaminhamento) e quebrada em linhas onde uma pessoa quebraria.
- **Uma vez por dia:** o nó "Já respondeu hoje?" procura resposta do número para essa pessoa desde o início do dia (horário de Brasília), em `mensagens_whatsapp` com `por_api = true`.
- **Para testar a apresentação de novo no mesmo dia:** no n8n, abra o nó "Já respondeu hoje?", no filtro `enviada_em` troque a data dentro de `DateTime.fromISO('...')` pela hora de agora (ex.: `2026-10-05T15:30:00-03:00`) e salve. A contagem passa a valer só a partir dela. No gerador do JSON é a constante `CONTAR_A_PARTIR_DE`.
- Pergunta sobre o restaurante: texto pronto indicando o número de contato (só o número, com 55).
- No envio, a mensagem do cliente fica lida (`readmessages`) e aparece "digitando..." (`delay`) por 2,5 a 8 s, conforme o tamanho da resposta.
- Para mudar ou acrescentar mensagens: listas `MENSAGENS`, `SAUDACAO_*`, `TAMBEM_SUGESTAO` e `ENCAMINHA_*` no nó "Monta a resposta". O teste confere a apresentação só na primeira do dia, que não sobra `{variável}`, que nunca aparece "de novo" e que não tem palavra com cara de IA.

## Sentimentos

- Ponto (`feedbacks_restaurante.sentimento`): `Positivo`, `Negativo`, `Neutro`, `Sugestão`.
- Mensagem inteira (`feedbacks_originais.sentimento`): `Positivo e Negativo` > `Negativo` > `Positivo` > `Sugestão` > `Neutro` (calculado a partir dos pontos).
- **Neutro** aparece no painel, mas não gera insight. **Sugestão** gera insight como ponto a melhorar (mesmo balde da queixa, gravidade 1). Regra no código: `supabase/functions/_shared/sentimento.ts`; no banco: `feedbacks_livres` e `feedbacks_para_geracao` (migration `20261004010000`).

## PARAR (as atualizações das ações)

O cliente pode pedir para não receber mais as **atualizações das ações** (as mensagens do workflow "Status Ações" contando o que o restaurante mudou). Só elas param: o cliente continua podendo mandar feedback e recebendo as respostas da Helena normalmente.

**Status Ações (o aviso).** Depois de uma atualização enviada, se é a primeira para esse cliente ou o último aviso tem mais de 2 semanas (`contatos.aviso_parar_em`), espera 3 a 6 s e manda uma de três frases do tipo "Se você não quiser mais receber essas novidades, é só responder PARAR." Falhou o envio do aviso: não grava e tenta na próxima atualização.

**Feedback Restaurante (o pedido).** Um caminho separado, acima da resposta normal no canvas:

1. **Pediu para parar?**: filtro barato por palavras: PARAR, pare, stop, "para de mandar", "não quero mais receber", "me tira da lista", "como faço pra não receber mais"… "para" no meio de uma frase ("fui lá para comemorar") não passa; "Para!" sozinho numa linha passa. Não bateu: para aqui, sem gastar IA.
2. **Conversa recente**: função `contato_contexto_parar`. Traz as últimas 12 mensagens com o cliente, a última atualização mandada, se o aviso do PARAR já foi mandado e se ele já parou. Telefone com ou sem o 9 acha o mesmo contato.
3. **Decide se é para parar**: uma IA lê tudo com cuidado e responde `{"parar", "certeza", "motivo"}`. Só marca com `parar: true` e certeza **alta**; na dúvida, não marca.
4. **Marca para não receber**: função `contato_parar_atualizacoes`. Preenche `contatos.opt_out_em` e `opt_out_motivo` (o que o cliente escreveu). Devolve `marcou = true` só na primeira vez.
5. **Confirma que parou**: uma mensagem curta ("Pronto, não vou mais te mandar essas novidades. Se quiser contar como foi alguma visita, é só escrever aqui."), só quando marcou agora.

O n8n roda os ramos de cima para baixo (`executionOrder: v1`), então o PARAR roda antes da resposta normal. Nenhum nó dele trava o fluxo: se o Supabase, a IA ou a uazapi falharem, ele para em silêncio e a resposta normal sai do mesmo jeito.

Com `opt_out_em` preenchido, o cliente sai da busca do "Status Ações" ("Pegar Clientes") e das filas do motor (`promover_transicoes_pendentes`, `avisar_vinculo_tardio`). **Para voltar a mandar** para alguém, apague `opt_out_em` dessa linha de `contatos` no Supabase.

## Como substituir no n8n

1. Abra o workflow "Feedback Restaurante" e **desative**.
2. Selecione tudo (Ctrl+A), apague, e importe `feedback-restaurante.json` (menu ⋯ → Import from File). O webhook continua em `/webhook/easyfeed`.
3. Confira as credenciais: **Feedback Restaurante** (Supabase, chave de serviço) nos nós do banco e em "Conversa recente" e "Marca para não receber"; **OpenAi** em "Transcreve o áudio", "Modelo de análise" e "Modelo do parar".
4. Salve e **ative**.

## Teste depois de ativar (mande do seu celular para o número de um restaurante)

1. "A comida estava ótima mas o garçom demorou" → "digitando..." e a Helena responde (dizendo o nome), por exemplo "Fico feliz com a comida e sinto muito pela demora"; no painel, mensagem "Positivo e negativo" com 2 pontos.
2. "Vocês abrem domingo?" → resposta indicando o número de contato, sem link (ou só o aviso, se não houver número). Nada gravado. "Tenho uma dúvida" sozinho → nenhuma resposta.
3. "Oi" e, em até 20 s, "a pizza veio fria" → uma resposta só; feedback com o texto das duas.
4. "Bom dia" sozinho → nenhuma resposta.
5. "Podiam ter opção vegana" → agradecimento de sugestão; ponto "Sugestão" (azul) no painel.
6. Um áudio com uma opinião → transcrito e tratado como texto.
7. De um número que já recebeu atualização de ação: "PARAR" → só a confirmação ("Pronto, não vou mais te mandar essas novidades…"); em `contatos`, `opt_out_em` preenchido. "Fui lá para comemorar" → resposta normal, nada marcado. Depois do teste, apague `opt_out_em` do seu número para voltar a receber.

Execução com erro aparece em Executions no n8n (ex.: a IA devolveu algo fora do formato).
