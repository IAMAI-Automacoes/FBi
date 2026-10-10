-- Missões de vídeo sem roteiro: o restaurante grava do jeito que quiser e só
-- precisa cumprir os requisitos (que agora ele vê). A IA confere só eles.
alter table public.video_missoes drop constraint if exists video_missoes_roteiro_ok;
alter table public.video_missoes drop column if exists roteiro;
