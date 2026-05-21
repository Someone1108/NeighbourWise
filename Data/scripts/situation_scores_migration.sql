-- Situation-aware suburb scores.
-- Run this in Supabase before uploading backend/exports/suburb_scores_situations.csv.

create index if not exists idx_score_runs_status_persona_started
    on public.score_runs (status, persona, started_at desc);

create or replace view public.latest_suburb_scores as
select distinct on (ss.suburb_name, ss.postcode, sr.persona, sr.time_minutes)
    ss.*,
    sr.persona,
    sr.scoring_version,
    sr.time_minutes,
    sr.started_at as score_run_started_at
from public.suburb_scores ss
join public.score_runs sr
    on sr.id = ss.score_run_id
where sr.status in ('completed', 'completed_with_errors')
  and ss.status = 'completed'
order by
    ss.suburb_name,
    ss.postcode,
    sr.persona,
    sr.time_minutes,
    sr.started_at desc,
    ss.calculated_at desc;
