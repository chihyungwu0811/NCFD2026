-- NCFD2026 投稿系統資料庫 / Supabase 初始化腳本
-- 在 Supabase Dashboard > SQL Editor 中以專案管理者身分完整執行一次。

begin;

create extension if not exists pgcrypto;

do $$ begin
  create type public.submission_status as enum ('draft','submitted','under_review','revision','accepted','rejected','withdrawn','final_submitted');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.staff_role as enum ('reviewer','admin','chair');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.review_recommendation as enum ('accept','minor_revision','reject');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name_zh text default '',
  full_name_en text default '',
  affiliation text default '',
  job_title text default '',
  phone text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.staff_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.topics (
  id smallserial primary key,
  code text unique not null,
  name_zh text not null,
  description_zh text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists public.conference_settings (
  id integer primary key default 1 check (id = 1),
  submissions_enabled boolean not null default true,
  submission_open_at timestamptz not null default '2026-08-17 00:00:00+08',
  submission_deadline timestamptz null,
  early_bird_deadline timestamptz not null default '2026-10-30 23:59:59+08',
  registration_deadline timestamptz not null default '2026-11-27 23:59:59+08',
  event_start timestamptz not null default '2026-12-11 08:00:00+08',
  event_end timestamptz not null default '2026-12-12 18:00:00+08',
  max_pdf_bytes bigint not null default 10485760,
  updated_at timestamptz not null default now()
);

create sequence if not exists public.submission_number_seq start 1;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  submission_number text unique,
  owner_id uuid not null,
  topic_id smallint references public.topics(id),
  title_zh text default '',
  title_en text default '',
  abstract_zh text default '',
  abstract_en text default '',
  keywords text[] not null default '{}',
  status public.submission_status not null default 'draft',
  current_file_id bigint null,
  submitted_at timestamptz null,
  decision_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submissions_owner_id_fkey foreign key(owner_id) references public.profiles(id) on delete cascade
);

create table if not exists public.submission_authors (
  id bigserial primary key,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  sort_order integer not null,
  name_zh text default '',
  name_en text default '',
  email text not null,
  affiliation text not null,
  is_corresponding boolean not null default false,
  is_presenter boolean not null default false,
  created_at timestamptz not null default now(),
  unique(submission_id, sort_order)
);

create table if not exists public.submission_files (
  id bigserial primary key,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  version_number integer not null,
  path text unique not null,
  original_name text not null,
  size_bytes bigint not null,
  mime_type text not null default 'application/pdf',
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(submission_id, version_number)
);

do $$ begin
  alter table public.submissions add constraint submissions_current_file_id_fkey foreign key(current_file_id) references public.submission_files(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.review_assignments (
  id bigserial primary key,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  unique(submission_id, reviewer_id)
);

create table if not exists public.reviews (
  id bigserial primary key,
  assignment_id bigint unique not null references public.review_assignments(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  originality smallint check (originality between 1 and 5),
  technical_quality smallint check (technical_quality between 1 and 5),
  relevance smallint check (relevance between 1 and 5),
  presentation_quality smallint check (presentation_quality between 1 and 5),
  recommendation public.review_recommendation,
  comments_to_author text default '',
  comments_confidential text default '',
  submitted_at timestamptz null,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_id uuid null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 基礎資料
insert into public.topics(code,name_zh,description_zh,sort_order,active) values
('theory','基礎與理論流體力學計算','流體力學基本理論、黏性流與非黏性流計算、數值計算法則。',1,true),
('numerics','數值方法與技術','網格點生成法、平行運算、雲端計算與高效能計算（HPC）軟體發展。',2,true),
('applied','實驗與應用流體力學','航太、機械、先進戰機與艦艇之關鍵流體技術。',3,true),
('industry','跨域及產業應用研究','其他計算流體力學之應用，例如：能源、電子業、製程等分析。',4,true)
on conflict(code) do update set name_zh=excluded.name_zh,description_zh=excluded.description_zh,sort_order=excluded.sort_order,active=excluded.active;
insert into public.conference_settings(id) values(1) on conflict(id) do nothing;

-- 共用 helper
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;

create or replace function public.has_staff_role(p_roles public.staff_role[])
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.staff_roles r where r.user_id=auth.uid() and r.role=any(p_roles));
$$;

create or replace function public.submission_is_open()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select submissions_enabled and now() >= submission_open_at and (submission_deadline is null or now() <= submission_deadline) from public.conference_settings where id=1),false);
$$;

create or replace function public.owns_submission(p_submission_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.submissions s where s.id=p_submission_id and s.owner_id=auth.uid());
$$;

create or replace function public.can_edit_submission(p_submission_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.submissions s where s.id=p_submission_id and s.owner_id=auth.uid() and s.status in ('draft','submitted','revision'))
         and public.submission_is_open();
$$;

create or replace function public.can_access_submission(p_submission_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.owns_submission(p_submission_id)
    or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])
    or exists(select 1 from public.review_assignments ra where ra.submission_id=p_submission_id and ra.reviewer_id=auth.uid());
$$;

create or replace function public.can_access_file(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.submission_files f
    join public.submissions s on s.id=f.submission_id
    where f.path=p_path and (
      s.owner_id=auth.uid()
      or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])
      or exists(select 1 from public.review_assignments ra where ra.submission_id=s.id and ra.reviewer_id=auth.uid())
    )
  );
$$;

-- 新帳號自動建立 profile
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.profiles(id,email,full_name_zh,affiliation)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name_zh',''),coalesce(new.raw_user_meta_data->>'affiliation',''))
  on conflict(id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 投稿編號與更新時間
create or replace function public.assign_submission_number() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.submission_number is null then new.submission_number='NCFD2026-'||lpad(nextval('public.submission_number_seq')::text,4,'0'); end if;
  return new;
end $$;
drop trigger if exists trg_submission_number on public.submissions;
create trigger trg_submission_number before insert on public.submissions for each row execute function public.assign_submission_number();

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists trg_submissions_touch on public.submissions;
create trigger trg_submissions_touch before update on public.submissions for each row execute function public.touch_updated_at();
drop trigger if exists trg_reviews_touch on public.reviews;
create trigger trg_reviews_touch before update on public.reviews for each row execute function public.touch_updated_at();
drop trigger if exists trg_settings_touch on public.conference_settings;
create trigger trg_settings_touch before update on public.conference_settings for each row execute function public.touch_updated_at();

create or replace function public.assign_file_version() returns trigger language plpgsql as $$
begin
  if new.version_number is null then
    select coalesce(max(version_number),0)+1 into new.version_number from public.submission_files where submission_id=new.submission_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_file_version on public.submission_files;
create trigger trg_file_version before insert on public.submission_files for each row execute function public.assign_file_version();

-- 投稿者不得偽造身份、編號或決議狀態；一般修改受開放時間限制。
create or replace function public.guard_submission_update() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare is_manager boolean := public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]);
begin
  if is_manager then return new; end if;
  if old.owner_id <> auth.uid() or new.owner_id <> old.owner_id then raise exception 'not owner'; end if;
  if new.submission_number is distinct from old.submission_number then raise exception 'submission number is immutable'; end if;
  if old.status not in ('draft','submitted','revision') then raise exception 'submission is locked'; end if;
  if new.status is distinct from old.status then
    if not ((old.status='draft' and new.status in ('submitted','withdrawn')) or (old.status='submitted' and new.status in ('submitted','withdrawn')) or (old.status='revision' and new.status in ('submitted','withdrawn'))) then
      raise exception 'invalid status transition';
    end if;
  end if;
  if not public.submission_is_open() and not (new.status='withdrawn' and new.status is distinct from old.status) then raise exception 'submission window is closed'; end if;
  if new.decision_at is distinct from old.decision_at then raise exception 'decision fields are staff only'; end if;
  return new;
end $$;
drop trigger if exists trg_guard_submission_update on public.submissions;
create trigger trg_guard_submission_update before update on public.submissions for each row execute function public.guard_submission_update();

create or replace function public.guard_profile_update() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]) then
    if new.id is distinct from old.id or new.email is distinct from old.email then raise exception 'email/id cannot be changed here'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile_update on public.profiles;
create trigger trg_guard_profile_update before update on public.profiles for each row execute function public.guard_profile_update();

-- 正式提交：伺服器端驗證必填欄位、作者與 PDF。
create or replace function public.submit_submission(p_submission_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.submissions; author_count integer; corr_count integer; presenter_count integer;
begin
  select * into s from public.submissions where id=p_submission_id for update;
  if s.id is null or s.owner_id<>auth.uid() then raise exception 'submission not found or not owned'; end if;
  if s.status not in ('draft','submitted','revision') then raise exception 'submission is locked'; end if;
  if not public.submission_is_open() then raise exception 'submission window is closed'; end if;
  if s.topic_id is null or btrim(coalesce(s.title_zh,''))='' or btrim(coalesce(s.title_en,''))='' or btrim(coalesce(s.abstract_zh,''))='' or cardinality(s.keywords)<1 then raise exception 'required fields are incomplete'; end if;
  if s.current_file_id is null then raise exception 'PDF is required'; end if;
  select count(*),count(*) filter(where is_corresponding),count(*) filter(where is_presenter) into author_count,corr_count,presenter_count from public.submission_authors where submission_id=s.id;
  if author_count<1 then raise exception 'at least one author is required'; end if;
  if corr_count<1 then raise exception 'a corresponding author is required'; end if;
  if presenter_count<1 then raise exception 'a presenter is required'; end if;
  update public.submissions set status='submitted',submitted_at=coalesce(submitted_at,now()) where id=s.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,details) values(auth.uid(),'submission',s.id::text,'submitted',jsonb_build_object('number',s.submission_number));
  return s.submission_number;
end $$;

create or replace function public.withdraw_submission(p_submission_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.submissions where id=p_submission_id and owner_id=auth.uid() and status in ('draft','submitted','revision')) then raise exception 'cannot withdraw'; end if;
  update public.submissions set status='withdrawn' where id=p_submission_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action) values(auth.uid(),'submission',p_submission_id::text,'withdrawn');
end $$;

create or replace function public.set_submission_status(p_submission_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_status public.submission_status;
begin
  if not public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]) then raise exception 'admin only'; end if;
  v_status:=p_status::public.submission_status;
  update public.submissions set status=v_status,decision_at=case when v_status in ('accepted','rejected') then now() else decision_at end where id=p_submission_id;
  if not found then raise exception 'submission not found'; end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,details) values(auth.uid(),'submission',p_submission_id::text,'status_changed',jsonb_build_object('status',p_status));
end $$;

create or replace function public.assign_reviewer_by_email(p_submission_id uuid,p_reviewer_email text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid; normalized text:=lower(btrim(p_reviewer_email));
begin
  if not public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]) then raise exception 'admin only'; end if;
  select id into rid from public.profiles where lower(email)=normalized limit 1;
  if rid is null then raise exception 'reviewer must register an account first'; end if;
  insert into public.staff_roles(user_id,role) values(rid,'reviewer') on conflict do nothing;
  insert into public.review_assignments(submission_id,reviewer_id,assigned_by) values(p_submission_id,rid,auth.uid()) on conflict(submission_id,reviewer_id) do nothing;
  update public.submissions set status='under_review' where id=p_submission_id and status in ('submitted','revision');
  return normalized;
end $$;

-- 首位管理者：使用者先在前台註冊/驗證，再由 SQL Editor 執行 select public.bootstrap_admin('you@example.com');
create or replace function public.bootstrap_admin(p_email text)
returns text language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email)=lower(btrim(p_email)) limit 1;
  if uid is null then raise exception 'user not found'; end if;
  insert into public.staff_roles(user_id,role) values(uid,'chair') on conflict do nothing;
  return uid::text;
end $$;

-- RLS
alter table public.profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.topics enable row level security;
alter table public.conference_settings enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_authors enable row level security;
alter table public.submission_files enable row level security;
alter table public.review_assignments enable row level security;
alter table public.reviews enable row level security;
alter table public.audit_logs enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using(id=auth.uid() or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid() or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])) with check(id=auth.uid() or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));

-- staff roles
drop policy if exists staff_roles_select on public.staff_roles;
create policy staff_roles_select on public.staff_roles for select to authenticated using(user_id=auth.uid() or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));
drop policy if exists staff_roles_admin_all on public.staff_roles;
create policy staff_roles_admin_all on public.staff_roles for all to authenticated using(public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])) with check(public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));

-- public metadata
drop policy if exists topics_public_read on public.topics;
create policy topics_public_read on public.topics for select to anon,authenticated using(active=true or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));
drop policy if exists settings_public_read on public.conference_settings;
create policy settings_public_read on public.conference_settings for select to anon,authenticated using(true);
drop policy if exists settings_admin_update on public.conference_settings;
create policy settings_admin_update on public.conference_settings for update to authenticated using(public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])) with check(public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));

-- submissions
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions for select to authenticated using(owner_id=auth.uid() or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]) or exists(select 1 from public.review_assignments ra where ra.submission_id=id and ra.reviewer_id=auth.uid()));
drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions for insert to authenticated with check(owner_id=auth.uid() and status='draft' and public.submission_is_open());
drop policy if exists submissions_update on public.submissions;
create policy submissions_update on public.submissions for update to authenticated using(owner_id=auth.uid() or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])) with check(owner_id=auth.uid() or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));
drop policy if exists submissions_delete on public.submissions;
create policy submissions_delete on public.submissions for delete to authenticated using((owner_id=auth.uid() and status='draft' and public.submission_is_open()) or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));

-- authors
drop policy if exists authors_select on public.submission_authors;
create policy authors_select on public.submission_authors for select to authenticated using(public.can_access_submission(submission_id));
drop policy if exists authors_insert on public.submission_authors;
create policy authors_insert on public.submission_authors for insert to authenticated with check(public.can_edit_submission(submission_id) or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));
drop policy if exists authors_update on public.submission_authors;
create policy authors_update on public.submission_authors for update to authenticated using(public.can_edit_submission(submission_id) or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])) with check(public.can_edit_submission(submission_id) or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));
drop policy if exists authors_delete on public.submission_authors;
create policy authors_delete on public.submission_authors for delete to authenticated using(public.can_edit_submission(submission_id) or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));

-- file metadata
drop policy if exists files_select on public.submission_files;
create policy files_select on public.submission_files for select to authenticated using(public.can_access_submission(submission_id));
drop policy if exists files_insert on public.submission_files;
create policy files_insert on public.submission_files for insert to authenticated with check(uploaded_by=auth.uid() and public.can_edit_submission(submission_id));

-- assignments
drop policy if exists assignments_select on public.review_assignments;
create policy assignments_select on public.review_assignments for select to authenticated using(reviewer_id=auth.uid() or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));
drop policy if exists assignments_admin_all on public.review_assignments;
create policy assignments_admin_all on public.review_assignments for all to authenticated using(public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])) with check(public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));

-- reviews
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select to authenticated using(reviewer_id=auth.uid() or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert to authenticated with check(reviewer_id=auth.uid() and exists(select 1 from public.review_assignments ra where ra.id=assignment_id and ra.reviewer_id=auth.uid()));
drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews for update to authenticated using(reviewer_id=auth.uid() or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])) with check(reviewer_id=auth.uid() or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));

-- audit log: only admin/chair read; inserts are performed by server-side functions.
drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs for select to authenticated using(public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));

-- Storage bucket: private PDF only, 10 MB.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('submission-files','submission-files',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists ncfd_storage_insert on storage.objects;
create policy ncfd_storage_insert on storage.objects for insert to authenticated with check(bucket_id='submission-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists ncfd_storage_select on storage.objects;
create policy ncfd_storage_select on storage.objects for select to authenticated using(bucket_id='submission-files' and public.can_access_file(name));

-- Grants: Publishable key + JWT 後的 authenticated role 僅獲得必要權限；RLS 再細分資料列。
grant usage on schema public to anon,authenticated;
grant select on public.topics,public.conference_settings to anon,authenticated;
grant select,update on public.profiles to authenticated;
grant select on public.staff_roles to authenticated;
grant select,insert,update,delete on public.submissions,public.submission_authors to authenticated;
grant select,insert on public.submission_files to authenticated;
grant select,insert,update,delete on public.review_assignments to authenticated;
grant select,insert,update on public.reviews to authenticated;
grant select on public.audit_logs to authenticated;
grant usage,select on all sequences in schema public to authenticated;

grant execute on function public.has_staff_role(public.staff_role[]) to authenticated;
grant execute on function public.submission_is_open() to anon,authenticated;
grant execute on function public.owns_submission(uuid),public.can_edit_submission(uuid),public.can_access_submission(uuid),public.can_access_file(text) to authenticated;
grant execute on function public.submit_submission(uuid),public.withdraw_submission(uuid),public.set_submission_status(uuid,text),public.assign_reviewer_by_email(uuid,text) to authenticated;
revoke all on function public.bootstrap_admin(text) from public,anon,authenticated;

commit;
