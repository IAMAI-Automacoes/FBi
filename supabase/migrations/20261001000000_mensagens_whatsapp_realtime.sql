-- Tempo real na simulação do WhatsApp.
--
-- A tela de conversas precisa ver a mensagem nova chegar sem recarregar, e
-- também a linha MUDAR depois de criada: status (entregue, lido), edição e
-- exclusão chegam como UPDATE. O Realtime entrega INSERT e UPDATE respeitando
-- a RLS de mensagens_whatsapp, então cada dono só recebe o que é dele.
--
-- REPLICA IDENTITY FULL: sem ela, um UPDATE chega ao cliente só com a chave
-- primária no registro antigo, e o filtro por restaurante_id do canal não
-- funciona em eventos de UPDATE/DELETE.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensagens_whatsapp'
  ) then
    alter publication supabase_realtime add table public.mensagens_whatsapp;
  end if;
end $$;

alter table public.mensagens_whatsapp replica identity full;
