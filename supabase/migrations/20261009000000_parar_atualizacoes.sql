-- "PARAR": o cliente para de receber as atualizações das ações (motor de
-- resposta), e só elas.
--
--   · workflow "Status Ações": depois de uma atualização, quando é a primeira
--     ou o último aviso tem mais de 2 semanas, manda "se não quiser mais
--     receber, responda PARAR" e grava em `aviso_parar_em`;
--   · workflow "Feedback Restaurante": mensagem com cara de "parar" passa por
--     uma IA que olha a conversa recente (`contato_contexto_parar`). Se for
--     mesmo um pedido para não receber, marca `opt_out_em`
--     (`contato_parar_atualizacoes`).
--
-- `opt_out_em` já é o que o motor usa: contato com ela preenchida sai da fila e
-- não ganha aviso novo. As respostas automáticas de feedback não olham essa
-- coluna, então continuam iguais.

alter table public.contatos
  add column if not exists aviso_parar_em timestamptz,
  add column if not exists opt_out_motivo text;

comment on column public.contatos.aviso_parar_em is
  'Última vez que o cliente recebeu "se não quiser mais receber, responda PARAR" (workflow Status Ações).';
comment on column public.contatos.opt_out_motivo is
  'O que o cliente escreveu ao pedir para parar (curto), para conferência.';

-- O que a IA precisa para decidir se o "parar" é pedido para não receber as
-- atualizações: a conversa recente com o restaurante, a última atualização
-- mandada e se o aviso do PARAR já foi mandado.
create or replace function public.contato_contexto_parar(p_restaurante_id bigint, p_telefone text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select * from public.contatos
     where restaurante_id = p_restaurante_id
       and public.telefone_chave(telefone) = public.telefone_chave(p_telefone)
     order by created_at
     limit 1
  )
  select jsonb_build_object(
    'contato_id', (select id from c),
    'ja_parou', coalesce((select opt_out_em is not null from c), false),
    'aviso_parar_em', (select aviso_parar_em from c),
    'ultima_atualizacao', (
      select jsonb_build_object('texto', m.texto, 'enviada_em', coalesce(m.enviado_em, m.criado_em))
        from public.mensagem_enviada m
        join c on c.id = m.contato_id
       order by coalesce(m.enviado_em, m.criado_em) desc
       limit 1),
    'conversa', coalesce((
      select jsonb_agg(jsonb_build_object('quem', x.quem, 'texto', x.texto, 'enviada_em', x.enviada_em) order by x.enviada_em)
        from (select case when w.de_mim then 'restaurante' else 'cliente' end as quem,
                     left(coalesce(nullif(btrim(w.texto), ''), nullif(btrim(w.transcricao), ''), '[' || coalesce(w.tipo, 'mensagem') || ']'), 500) as texto,
                     w.enviada_em
                from public.mensagens_whatsapp w
               where w.restaurante_id = p_restaurante_id
                 and coalesce(w.grupo, false) = false
                 and coalesce(w.tipo, '') <> 'reaction'
                 and public.telefone_chave(w.telefone) = public.telefone_chave(p_telefone)
               order by w.enviada_em desc
               limit 12) x), '[]'::jsonb)
  )
$$;

revoke execute on function public.contato_contexto_parar(bigint, text) from public, anon, authenticated;
grant execute on function public.contato_contexto_parar(bigint, text) to service_role;

-- Marca o contato para não receber mais as atualizações. `marcou` = true só
-- quando marcou agora (para a confirmação ir uma vez só). Volta como linha
-- ({ marcou }) porque é o que o n8n lê direto como item.
drop function if exists public.contato_parar_atualizacoes(bigint, text, text);
create function public.contato_parar_atualizacoes(p_restaurante_id bigint, p_telefone text, p_motivo text default null)
returns table (marcou boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.contatos
     set opt_out_em = now(),
         opt_out_motivo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 300)
   where restaurante_id = p_restaurante_id
     and public.telefone_chave(telefone) = public.telefone_chave(p_telefone)
     and opt_out_em is null;
  get diagnostics n = row_count;
  return query select n > 0;
end;
$$;

revoke execute on function public.contato_parar_atualizacoes(bigint, text, text) from public, anon, authenticated;
grant execute on function public.contato_parar_atualizacoes(bigint, text, text) to service_role;
