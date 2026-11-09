-- NCFD2026 2026-11-01 Hotfix
-- 1) 管理員可手動變更會議註冊狀態
-- 2) 錄取投稿者可上傳海報檔案與授權書檔案
-- Supabase > SQL Editor > Database 執行一次

begin;

-- ===== A. 註冊狀態管理 =====
create or replace function public.admin_set_registration_status(
  p_registration_id uuid,
  p_status public.registration_status,
  p_note text default ''
)
returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  has_payment boolean;
begin
  if not public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]) then
    raise exception '無管理權限。';
  end if;
  if not exists(select 1 from public.registrations where id=p_registration_id) then
    raise exception '找不到註冊資料。';
  end if;

  select exists(select 1 from public.registration_payments where registration_id=p_registration_id) into has_payment;
  if p_status in ('payment_submitted','paid','reupload_required') and not has_payment then
    raise exception '此註冊尚未上傳付款證明，不能設定為此狀態。';
  end if;

  update public.registrations set status=p_status where id=p_registration_id;

  if has_payment then
    if p_status='payment_submitted' then
      update public.registration_payments set status='proof_uploaded',review_note=coalesce(p_note,''),reviewed_by=auth.uid(),reviewed_at=now() where registration_id=p_registration_id;
    elsif p_status='paid' then
      update public.registration_payments set status='paid',review_note=coalesce(p_note,''),reviewed_by=auth.uid(),reviewed_at=now() where registration_id=p_registration_id;
    elsif p_status='reupload_required' then
      update public.registration_payments set status='reupload_required',review_note=coalesce(p_note,''),reviewed_by=auth.uid(),reviewed_at=now() where registration_id=p_registration_id;
    end if;
  end if;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,details)
  values(auth.uid(),'registration',p_registration_id::text,'registration_status_changed',jsonb_build_object('status',p_status,'note',coalesce(p_note,'')));
end $$;

revoke all on function public.admin_set_registration_status(uuid,public.registration_status,text) from public,anon;
grant execute on function public.admin_set_registration_status(uuid,public.registration_status,text) to authenticated;

-- ===== B. 海報 / 授權書 =====
do $$ begin
  create type public.submission_deliverable_kind as enum ('poster','authorization');
exception when duplicate_object then null; end $$;

create table if not exists public.submission_deliverable_files (
  id bigserial primary key,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  file_kind public.submission_deliverable_kind not null,
  path text not null unique,
  original_name text not null,
  size_bytes bigint not null check(size_bytes>0),
  mime_type text not null default '',
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(submission_id,file_kind)
);

drop trigger if exists trg_submission_deliverables_touch on public.submission_deliverable_files;
create trigger trg_submission_deliverables_touch before update on public.submission_deliverable_files for each row execute function public.touch_updated_at();

create or replace function public.can_upload_submission_deliverable(p_submission_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.submissions s where s.id=p_submission_id and s.owner_id=auth.uid() and s.status in ('accepted','final_submitted'));
$$;

create or replace function public.can_access_submission_deliverable_path(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.submission_deliverable_files f
    join public.submissions s on s.id=f.submission_id
    where f.path=p_path and (
      s.owner_id=auth.uid()
      or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])
    )
  );
$$;

create or replace function public.register_submission_deliverable(
  p_submission_id uuid,
  p_file_kind public.submission_deliverable_kind,
  p_path text,
  p_original_name text,
  p_size_bytes bigint,
  p_mime_type text
)
returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  prefix text;
  allowed boolean := false;
begin
  if auth.uid() is null then raise exception '請先登入。'; end if;
  if not public.can_upload_submission_deliverable(p_submission_id) then
    raise exception '此稿件目前不可上傳海報或授權書。';
  end if;
  prefix := auth.uid()::text || '/' || p_submission_id::text || '/' || p_file_kind::text || '/';
  if position(prefix in p_path) <> 1 then raise exception '檔案路徑不正確。'; end if;

  if p_file_kind='poster' then
    allowed := p_size_bytes <= 52428800 and (
      lower(p_original_name) ~ '\\.(ppt|pptx|pdf)$'
      or p_mime_type in ('application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation')
    );
  elsif p_file_kind='authorization' then
    allowed := p_size_bytes <= 10485760 and (
      lower(p_original_name) ~ '\\.(pdf|jpg|jpeg|png)$'
      or p_mime_type in ('application/pdf','image/jpeg','image/png')
    );
  end if;
  if not allowed then raise exception '檔案格式或大小不符合規定。'; end if;

  insert into public.submission_deliverable_files(submission_id,file_kind,path,original_name,size_bytes,mime_type,uploaded_by,uploaded_at)
  values(p_submission_id,p_file_kind,p_path,p_original_name,p_size_bytes,coalesce(p_mime_type,''),auth.uid(),now())
  on conflict(submission_id,file_kind) do update set
    path=excluded.path, original_name=excluded.original_name, size_bytes=excluded.size_bytes,
    mime_type=excluded.mime_type, uploaded_by=excluded.uploaded_by, uploaded_at=now(), updated_at=now();

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,details)
  values(auth.uid(),'submission',p_submission_id::text,'deliverable_uploaded',jsonb_build_object('kind',p_file_kind,'file',p_original_name));
end $$;

alter table public.submission_deliverable_files enable row level security;
drop policy if exists deliverables_select on public.submission_deliverable_files;
create policy deliverables_select on public.submission_deliverable_files for select to authenticated using(
  public.owns_submission(submission_id)
  or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])
);

grant select on public.submission_deliverable_files to authenticated;
revoke all on function public.register_submission_deliverable(uuid,public.submission_deliverable_kind,text,text,bigint,text) from public,anon;
grant execute on function public.register_submission_deliverable(uuid,public.submission_deliverable_kind,text,text,bigint,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('submission-deliverables','submission-deliverables',false,52428800,array[
  'application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png'
])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists ncfd_deliverables_insert on storage.objects;
create policy ncfd_deliverables_insert on storage.objects for insert to authenticated with check(
  bucket_id='submission-deliverables'
  and (storage.foldername(name))[1]=auth.uid()::text
  and (storage.foldername(name))[3] in ('poster','authorization')
  and exists(
    select 1 from public.submissions s
    where s.id::text=(storage.foldername(name))[2]
      and s.owner_id=auth.uid()
      and s.status in ('accepted','final_submitted')
  )
);

drop policy if exists ncfd_deliverables_select on storage.objects;
create policy ncfd_deliverables_select on storage.objects for select to authenticated using(
  bucket_id='submission-deliverables'
  and public.can_access_submission_deliverable_path(name)
);

commit;
