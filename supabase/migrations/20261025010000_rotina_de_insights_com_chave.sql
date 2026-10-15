-- A rotina "gerar-insights-horario" voltava 401 toda hora.
--
-- O comando dela manda só Content-Type e x-cron-secret, sem Authorization. Como
-- o projeto não tem supabase/config.toml, toda publicação pela linha de comando
-- liga o verify_jwt da função, e o portão da Supabase recusava antes de a
-- função ver o segredo ("Missing authorization header"). Os insights continuavam
-- nascendo pela cadeia do vincular-feedback; o que parou foi a rede de
-- segurança de toda hora.
--
-- Acrescenta a chave PÚBLICA (a de src/lib/supabase/client.ts) só para passar
-- no portão. Quem prova que é a rotina continua sendo o x-cron-secret, que fica
-- como está: a troca é feita no próprio comando, sem o segredo passar por aqui.
-- Pode rodar mais de uma vez.
select cron.alter_job(
  job_id := j.jobid,
  command := replace(j.command, '{"Content-Type":"application/json","x-cron-secret"',
                     '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM","x-cron-secret"')
)
from cron.job j
where j.jobname = 'gerar-insights-horario'
  and j.command like '%{"Content-Type":"application/json","x-cron-secret"%'
  and j.command not like '%Authorization%';
