# Workflow do n8n "Feedback Restaurante"

Arquivo: `feedback-restaurante.json` (importar no n8n). Teste: `testar-feedback-restaurante.cjs` (roda no `npm test`).

Recebe o que os clientes mandam para o WhatsApp de feedback do restaurante (webhook `POST /webhook/easyfeed`, configurado em cada instância da uazapi pela função `whatsapp-instancia`), grava o feedback e responde.

## O que acontece com cada mensagem

- **Feedback** (elogio, crítica, comentário morno, sugestão): grava em `feedbacks_originais` + um `feedbacks_restaurante` por ponto, e agradece conforme o sentimento.
- **Pergunta ou pedido sobre o restaurante** (horário, reserva, pedido…): não grava; encaminha para o número de contato das Configurações (`restaurantes.telefone_contato`). Sem número configurado, só avisa que o canal é de feedback.
- **Feedback + pergunta**: grava, agradece e encaminha, numa mensagem só.
- **Saudação sozinha, "obrigado", "ok", emoji, assunto fora do restaurante**: não grava e não responde.

Saudação que chega junto com o feedback (o buffer junta as mensagens em sequência) é tratada como parte do feedback.

## Sentimentos

- Ponto (`feedbacks_restaurante.sentimento`): `Positivo`, `Negativo`, `Neutro`, `Sugestão`.
- Mensagem inteira (`feedbacks_originais.sentimento`): `Positivo e Negativo` > `Negativo` > `Positivo` > `Sugestão` > `Neutro` (calculado a partir dos pontos).
- **Neutro** aparece no painel, mas não gera insight. **Sugestão** gera insight como ponto a melhorar (mesmo balde da queixa, gravidade 1). Regra no código: `supabase/functions/_shared/sentimento.ts`; no banco: `feedbacks_livres` e `feedbacks_para_geracao` (migration `20261004010000`).

## Como substituir no n8n

1. Abra o workflow "Feedback Restaurante" e **desative**.
2. Selecione tudo (Ctrl+A), apague, e importe `feedback-restaurante.json` (menu ⋯ → Import from File). O webhook continua em `/webhook/easyfeed`.
3. Confira as credenciais: **Feedback Restaurante** (Supabase, chave de serviço) nos nós do banco e **OpenAi** em "Transcreve o áudio" e "Modelo de análise".
4. Salve e **ative**.

## Teste depois de ativar (mande do seu celular para o número de um restaurante)

1. "A comida estava ótima mas o garçom demorou" → agradecimento misto; no painel, mensagem "Positivo e negativo" com 2 pontos.
2. "Vocês abrem domingo?" → resposta indicando o número de contato (ou só o aviso, se não houver número). Nada gravado.
3. "Oi" e, em até 20 s, "a pizza veio fria" → uma resposta só; feedback com o texto das duas.
4. "Bom dia" sozinho → nenhuma resposta.
5. "Podiam ter opção vegana" → agradecimento de sugestão; ponto "Sugestão" (azul) no painel.
6. Um áudio com uma opinião → transcrito e tratado como texto.

Execução com erro aparece em Executions no n8n (ex.: a IA devolveu algo fora do formato).
