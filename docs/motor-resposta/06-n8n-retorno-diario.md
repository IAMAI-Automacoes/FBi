# Retorno diário ao cliente — fluxo do n8n

Atualizado em 2026-09-13. Substitui a parte de envio de `03-n8n.md`, que fala de
`fila_envio_n8n`, `motor-retorno-worker` e `motor-retorno-callback` — nenhum dos três
existe mais.

## Em uma frase

Todo dia, num horário fixo, o n8n pergunta ao Supabase "quem tem retorno pra receber
hoje?", manda **uma** mensagem por cliente pela uazapi do restaurante e confirma cada
envio.

## O que o Supabase já decide (o n8n não repete)

| Regra | Onde mora |
|---|---|
| Espera de 2 h depois que o dono move o card (se ele desfizer antes, não avisa) | `acao_status_historico` + cron de 10 em 10 min |
| 3 dias de calendário desde a última mensagem (recebeu segunda → pode de novo quinta) | `contatos.ultimo_envio_em` + `cooldown_dias` |
| Aviso vence em 14 dias | `aviso_pendente.expira_em` → vira `expirado` |
| Cliente pediu pra não receber | `contatos.opt_out_em` |
| Assinatura ativa e motor ligado no restaurante | `restaurantes` |
| Juntar tudo de um cliente numa mensagem; "concluída" substitui "em andamento" da mesma ação | `fila_retorno_por_cliente` |
| Feedback ligado a uma ação que já estava em andamento também é avisado | trigger em `feedback_acao` |

## De onde o n8n lê

Não lê tabela direto. Chama a função **`fila_retorno_por_cliente`**, que cruza as duas
coisas:

- `contatos.ultimo_envio_em` — quem recebeu há 3 dias ou mais, ou nunca recebeu;
- `aviso_pendente` com `status = 'na_fila'` — o que ainda tem pra contar a esse cliente.

A view `fila_retorno_n8n` é a mesma fila, uma linha por aviso e sem agrupar. Serve para
conferir no SQL; o fluxo usa a função.

## Chave

**Service role key** (Supabase → Project Settings → API Keys → `service_role`). A chave
pública do site não enxerga essa fila nem consegue confirmar envio. Guarde num credential
do n8n; nunca no front.

---

## O fluxo, nó por nó

```
Schedule 10:00 → Buscar fila → Tem cliente? → Loop (1 por vez)
                                                 ├→ [IA] Escrever mensagem
                                                 ├→ Enviar WhatsApp ─┬─ ok ──→ Confirmar envio ─┐
                                                 │                   └─ erro → (avisar você)    │
                                                 └──────────────── Wait 20–40 s ←────────────────┘
```

### 1. Schedule Trigger

- Todo dia às **10:00**.
- Settings do workflow → Timezone: `America/Sao_Paulo`.

### 2. HTTP Request — "Buscar fila"

```
POST https://lixrcruilisncfhfhndo.supabase.co/rest/v1/rpc/fila_retorno_por_cliente
apikey:        <SERVICE_ROLE_KEY>
Authorization: Bearer <SERVICE_ROLE_KEY>
Content-Type:  application/json

{}                          ← todos os restaurantes
{"p_restaurante_id": 11}    ← só um (bom para testar)
```

Volta uma lista; o n8n transforma cada elemento num item. Lista vazia = ninguém hoje.

Cada item:

```jsonc
{
  "contato_id": "7d77f767-…",
  "telefone": "55119…3005",            // só dígitos, pronto para a uazapi
  "nome_cliente": null,                 // quase sempre null
  "restaurante_id": 11,
  "nome_restaurante": "Camelo",
  "whatsapp_base_url": "https://iamai-ia.uazapi.com",
  "whatsapp_token": "…",                // da instância DESTE restaurante
  "ultimo_envio_em": null,
  "aviso_ids": ["1d95cb70-…", "…"],     // TODOS vão na confirmação
  "acoes": [                            // concluídas primeiro
    {
      "acao_id": 35,
      "titulo_acao": "Padronizar receitas e porcionamento para garantir consistência e controle de custos",
      "categoria": "Ambiente",
      "etapa": "concluida",             // ou "em_andamento"
      "feedbacks": [                    // só do PRÓPRIO cliente, sem repetir frase
        { "texto": "O garçom foi super mal educado…", "feedback_em": "2026-08-25T13:20:13Z" }
      ]
    }
  ],
  "mensagem_sugerida": "Olá! Aqui é do Camelo.\n\nVocê deixou um feedback pra gente…"
}
```

`mensagem_sugerida` pronta, do jeito que sai hoje:

```
Olá! Aqui é do Camelo.

Você deixou um feedback pra gente, e queremos te contar o que fizemos com ele:

✅ *Padronizar receitas e porcionamento para garantir consistência e controle de custos* — resolvido.
🔧 *Oferecer canal alternativo para reservas online* — já estamos cuidando disso.

Obrigado por nos ajudar a melhorar!
```

### 3. IF — "Tem cliente?"

`{{ $json.contato_id }}` → is not empty. Garante que nada roda com item vazio.

### 4. Loop Over Items

Batch size **1**.

### 5. Nó de IA — "Escrever mensagem" (recomendado)

**Por quê:** `titulo_acao` foi escrito para o dono. No exemplo acima, o cliente reclamou
do garçom e receberia "Padronizar receitas e porcionamento… — resolvido". A IA escreve a
partir das palavras do próprio cliente.

Prompt (Basic LLM Chain ou nó da OpenAI/OpenRouter):

```
Você escreve UMA mensagem de WhatsApp em nome do restaurante {{ $json.nome_restaurante }} para um cliente que deixou feedback. O objetivo é mostrar que o feedback dele foi ouvido.

Nome do cliente: {{ $json.nome_cliente || 'não sabemos o nome' }}

O que o cliente disse e o que o restaurante fez:
{{ $json.acoes.map(a => '- ' + (a.etapa === 'concluida' ? 'JÁ RESOLVIDO' : 'EM ANDAMENTO') + ': ' + a.titulo_acao + '\n  O cliente disse: ' + (a.feedbacks.map(f => '"' + f.texto + '"').join(' / ') || '(sem texto)')).join('\n') }}

Regras:
- No máximo 6 linhas curtas. Tom simples e caloroso, sem exagero.
- Não copie o título da ação: diga em palavras do dia a dia o que mudou, ligado ao que o cliente contou.
- JÁ RESOLVIDO = já foi feito. EM ANDAMENTO = estamos cuidando. Nunca prometa prazo nem desconto.
- Não invente nada que não esteja acima e não mencione outros clientes.
- Se não souber o nome, comece só com "Olá!".
- Termine agradecendo.
Responda apenas com o texto da mensagem.
```

- Settings → On Error: **Continue**.
- Depois dele, um nó **Set** "Texto" com
  `texto = {{ $json.text || $('Loop Over Items').item.json.mensagem_sugerida }}`
  (`text` é o campo do Basic LLM Chain; em outro nó, use o campo de saída dele). Se a IA
  falhar, sai a mensagem pronta.

Sem IA: pule este nó e use `mensagem_sugerida` direto.

### 6. HTTP Request — "Enviar WhatsApp"

```
POST {{ $('Loop Over Items').item.json.whatsapp_base_url }}/send/text
token: {{ $('Loop Over Items').item.json.whatsapp_token }}
Content-Type: application/json

{
  "number": "{{ $('Loop Over Items').item.json.telefone }}",
  "text": {{ JSON.stringify($json.texto) }}
}
```

- `JSON.stringify` porque o texto tem quebra de linha e aspas.
- Settings → On Error: **Continue (using error output)**.
- Retry On Fail: **desligado** — reenviar pode duplicar a mensagem no celular do cliente.
- É o mesmo formato do ack do fluxo de entrada, mas o token **sempre** vem da variável:
  cada restaurante tem a sua instância.

### 7a. Saída de sucesso → HTTP Request — "Confirmar envio"

```
POST https://lixrcruilisncfhfhndo.supabase.co/rest/v1/rpc/registrar_envio_retorno
(mesmos headers do passo 2)

{
  "p_contato_id": "{{ $('Loop Over Items').item.json.contato_id }}",
  "p_texto": {{ JSON.stringify($('Texto').item.json.texto) }},
  "p_aviso_ids": {{ JSON.stringify($('Loop Over Items').item.json.aviso_ids) }},
  "p_provider_message_id": {{ JSON.stringify($json.id ?? $json.messageid ?? null) }}
}
```

O que faz, tudo de uma vez:

1. grava a mensagem em `mensagem_enviada` (histórico);
2. marca os avisos como `enviado`;
3. põe `contatos.ultimo_envio_em = agora` — é isso que tira o cliente da fila por 3 dias.

Resposta: o id da mensagem gravada. `null` = nada a confirmar (os avisos já estavam
fechados, ou não são desse contato). Não é erro.

- Retry On Fail: **ligado** (3 tentativas, 5 s). Pode repetir sem medo: a segunda
  chamada devolve `null` e não grava nada.
- `p_provider_message_id`: confira na saída do nó 6 o nome do campo de id que a uazapi
  devolve e ajuste. Se não houver, `null`.

### 7b. Saída de erro → **não** chama o Supabase

Os avisos continuam na fila e o cliente aparece de novo amanhã, até o aviso vencer
(14 dias). Opcional: mandar pra você `nome_restaurante`, final do `telefone` e o erro —
instância desconectada é o caso mais comum.

### 8. Wait

`{{ Math.floor(Math.random() * 21) + 20 }}` segundos (20 a 40), e volta para o Loop.
Muitas mensagens seguidas de um número comercial é o que o WhatsApp bloqueia.

---

## Como testar sem risco

1. Painel admin → Motor de resposta: ligar **só o Camelo (11)**. Hoje os 4 restaurantes
   estão desligados, e com o motor desligado a fila vem vazia.
2. Rodar só o nó 2 com `{"p_restaurante_id": 11}`. Ler não muda nada.
3. Hoje sai 1 cliente (final 3005) com 2 ações: 35 concluída e 73 em andamento. Se esse
   número não for seu, desligue o motor antes de rodar o fluxo inteiro.
4. Rodar o fluxo inteiro uma vez e conferir: a mensagem chegou; `mensagem_enviada` tem a
   linha; rodando o nó 2 de novo, o cliente não aparece mais.

## Cuidados

- **Não rode o fluxo à mão enquanto o agendado estiver rodando.** Os dois leem a mesma
  fila antes de confirmar e o cliente recebe duas vezes.
- **Horário de corte.** A mensagem só entra na fila 2 h depois que o dono move o card
  (mais até 10 min do cron). Card movido até umas 7h50 sai na rodada das 10h do mesmo
  dia; depois disso, no dia seguinte.
- **Opt-out ainda não é automático.** Se a mensagem disser "responda SAIR para não
  receber mais", o fluxo de entrada precisa tratar o SAIR antes de gravar como feedback:

  ```
  PATCH https://lixrcruilisncfhfhndo.supabase.co/rest/v1/contatos?restaurante_id=eq.{id}&telefone=eq.{só dígitos}
  (mesmos headers do passo 2)
  { "opt_out_em": "{{ $now.toISO() }}" }
  ```

  Com `opt_out_em` preenchido, o cliente sai da fila e para de ganhar aviso novo.
