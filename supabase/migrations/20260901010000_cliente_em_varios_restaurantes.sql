-- O mesmo cliente falando com dois restaurantes.
--
-- ## O que já funcionava
--
-- `contatos` é único por `(restaurante_id, telefone)`, e não por telefone. O
-- mesmo número em dois restaurantes vira dois contatos, com histórico, opt-out
-- e janela de envio próprios — que é o certo: são dois relacionamentos
-- diferentes, e o dono do restaurante A não tem nada a ver com o que a pessoa
-- falou no B. O roteamento da mensagem que chega também é confiável:
-- `uq_restaurantes_numero_whatsapp` garante que cada número de WhatsApp
-- pertence a um restaurante só.
--
-- Verificado em 01/09/2026: o mesmo telefone inserido em dois restaurantes
-- gerou dois contatos distintos, cada um no seu.
--
-- ## O que NÃO estava protegido
--
-- `resolver_contato_feedback()` devolve cedo quando `contato_id` já vem
-- preenchido ("respeita o backfill"). Sem conferir de QUEM é esse contato.
-- Um insert com o `contato_id` do restaurante B num feedback do A passava
-- direto — e daí em diante o vínculo está errado em silêncio: o motor de
-- retorno acha o destinatário por `contato_id`, então o cliente do B receberia
-- uma mensagem sobre uma ação do A.
--
-- Isso não é hipótese distante: quem escreve esse insert é o n8n, e é
-- exatamente ao atender dois restaurantes que ele passa a ter dois contatos em
-- mãos ao mesmo tempo.
--
-- Nenhuma linha cruzada existe hoje (conferido nas quatro tabelas). As travas
-- abaixo são para que continue assim.

-- ── 1. O trigger passa a validar em vez de confiar ───────────────────────────
create or replace function public.resolver_contato_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_id  uuid;
begin
  v_tel := public.normalizar_telefone(new.telefone_cliente);

  -- Veio resolvido: só aceita se o contato for DESTE restaurante. Sendo de
  -- outro, é descartado e resolvido de novo pelo telefone — corrigir em
  -- silêncio é melhor que recusar o feedback, que é dado de cliente e não se
  -- repõe.
  if new.contato_id is not null then
    if exists (
      select 1 from public.contatos c
       where c.id = new.contato_id
         and c.restaurante_id = new.restaurante_id
    ) then
      return new;
    end if;
    new.contato_id := null;
  end if;

  -- Sem telefone utilizável ou sem tenant não há contato a criar. O feedback
  -- entra mesmo assim — perder o feedback seria pior que ficar sem contato.
  if v_tel is null or new.restaurante_id is null then
    return new;
  end if;

  -- O DO UPDATE (em vez de DO NOTHING) é o que garante o RETURNING: com
  -- DO NOTHING o conflito não devolve linha e o contato_id ficaria nulo.
  insert into public.contatos (restaurante_id, telefone)
  values (new.restaurante_id, v_tel)
  on conflict (restaurante_id, telefone)
    do update set telefone = excluded.telefone
  returning id into v_id;

  new.contato_id := v_id;
  -- Normaliza também na origem: a coluna passa a ter sempre o mesmo formato
  -- que a tabela de contatos, o que torna qualquer join futuro confiável.
  new.telefone_cliente := v_tel;

  return new;
end;
$$;

-- ── 2. A mesma regra para o ponto separado ───────────────────────────────────
-- `feedbacks_restaurante.contato_id` é copiado do original. Se a cópia vier de
-- outro lugar, o mesmo vazamento acontece um nível abaixo.
create or replace function public.validar_contato_do_ponto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contato_id is not null and new.restaurante_id is not null then
    if not exists (
      select 1 from public.contatos c
       where c.id = new.contato_id
         and c.restaurante_id = new.restaurante_id
    ) then
      raise exception
        'contato % não pertence ao restaurante % (feedbacks_restaurante)',
        new.contato_id, new.restaurante_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fr_validar_contato on public.feedbacks_restaurante;
create trigger trg_fr_validar_contato
  before insert or update of contato_id, restaurante_id
  on public.feedbacks_restaurante
  for each row execute function public.validar_contato_do_ponto();

-- ── 3. O aviso: contato e ação têm que ser do mesmo restaurante ──────────────
-- Aqui é onde um vínculo trocado vira mensagem entregue à pessoa errada, então
-- este é o único ponto que RECUSA em vez de corrigir: se chegou incoerente, a
-- decisão de para quem mandar já está perdida e adivinhar seria pior.
create or replace function public.validar_coerencia_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.contatos c
     where c.id = new.contato_id and c.restaurante_id = new.restaurante_id
  ) then
    raise exception 'aviso: contato % não é do restaurante %',
      new.contato_id, new.restaurante_id using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.acoes_operacionais a
     where a.id = new.acao_id and a.restaurante_id = new.restaurante_id
  ) then
    raise exception 'aviso: ação % não é do restaurante %',
      new.acao_id, new.restaurante_id using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_aviso_validar_coerencia on public.aviso_pendente;
create trigger trg_aviso_validar_coerencia
  before insert or update of contato_id, acao_id, restaurante_id
  on public.aviso_pendente
  for each row execute function public.validar_coerencia_aviso();

-- ── 4. Um lugar para conferir ────────────────────────────────────────────────
-- Devolve as linhas em que o contato e o dono do registro discordam. Deve
-- voltar vazia sempre; se voltar algo, algum caminho de escrita novo furou as
-- travas acima.
create or replace function public.conferir_contatos_cruzados()
returns table (tabela text, registro text, contato_id uuid, dono_do_registro bigint, dono_do_contato bigint)
language sql
stable
security definer
set search_path = public
as $$
  select 'feedbacks_originais', fo.id::text, fo.contato_id, fo.restaurante_id, c.restaurante_id
    from public.feedbacks_originais fo
    join public.contatos c on c.id = fo.contato_id
   where c.restaurante_id <> fo.restaurante_id
  union all
  select 'feedbacks_restaurante', fr.id::text, fr.contato_id, fr.restaurante_id, c.restaurante_id
    from public.feedbacks_restaurante fr
    join public.contatos c on c.id = fr.contato_id
   where c.restaurante_id <> fr.restaurante_id
  union all
  select 'aviso_pendente', a.id::text, a.contato_id, a.restaurante_id, c.restaurante_id
    from public.aviso_pendente a
    join public.contatos c on c.id = a.contato_id
   where c.restaurante_id <> a.restaurante_id;
$$;

comment on function public.conferir_contatos_cruzados() is
  'Auditoria do isolamento entre restaurantes: lista registros cujo contato '
  'pertence a outro restaurante. O esperado é sempre zero linhas.';
