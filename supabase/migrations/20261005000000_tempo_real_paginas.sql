-- Tempo real nas páginas que ainda precisavam de F5:
--   insights / insight_feedback → Insights (a geração roda sozinha de hora em hora)
--   acoes_operacionais          → Ações e Arquivadas (transições agendadas a cada
--                                 10 min, arquivamento automático, ações da IA)
--   qr_codes / qr_scans         → QR Codes (aberturas) e Garçons (metas, ranking)
--
-- Todas têm RLS: o Realtime só entrega a linha que o usuário pode ler, então
-- cada restaurante continua vendo só o que é dele. `qr_scans` não tem
-- restaurante_id — quem limita é a política dela (QR do próprio restaurante).
do $$
declare
  t text;
begin
  foreach t in array array['insights', 'insight_feedback', 'acoes_operacionais', 'qr_codes', 'qr_scans'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
