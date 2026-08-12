-- Remove o vínculo feedback → garçom. Não temos como saber de qual garçom veio
-- cada feedback; o que dá pra medir é quantas vezes o QR de cada garçom foi
-- aberto (qr_codes.garcom_id + total_scans) — e ISSO continua.
--
-- Some SÓ a ligação feedback→garçom. A tabela `garcons` e o `qr_codes.garcom_id`
-- (contagem de scans por garçom) permanecem intactos.

alter table public.feedbacks_restaurante drop column if exists garcom_id;
alter table public.feedbacks_originais   drop column if exists garcom_id;