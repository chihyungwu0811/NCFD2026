-- NCFD2026 會議註冊參加系統 migration
-- 前提：已先完成 NCFD2026 投稿系統 schema。
-- 在 Supabase Dashboard > SQL Editor > Database 中完整執行一次。

begin;

do $$ begin
  create type public.registration_type as enum (
    'paper_primary_author',
    'paper_additional_author',
    'general_attendee'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.registration_status as enum (
    'pending_payment',
    'payment_submitted',
    'paid',
    'reupload_required',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.registration_payment_status as enum (
    'proof_uploaded',
    'paid',
    'reupload_required'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.registration_payment_method as enum (
    'bank_transfer',
    'postal_giro'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.registration_settings (
  id integer primary key default 1 check (id=1),
  registrations_enabled boolean not null default true,
  registration_open_at timestamptz not null default '2026-08-17 00:00:00+08',
  early_bird_deadline timestamptz not null default '2026-10-30 23:59:59+08',
  online_registration_deadline timestamptz not null default '2026-11-27 23:59:59+08',
  event_start timestamptz not null default '2026-12-11 08:00:00+08',
  event_end timestamptz not null default '2026-12-12 18:00:00+08',
  onsite_registration_enabled boolean not null default true,

  paper_fee_early integer not null default 4000 check (paper_fee_early>=0),
  paper_fee_regular integer not null default 4500 check (paper_fee_regular>=0),
  paper_fee_onsite integer not null default 5000 check (paper_fee_onsite>=0),
  additional_author_fee integer not null default 2000 check (additional_author_fee>=0),
  general_attendee_fee integer not null default 2000 check (general_attendee_fee>=0),

  bank_name text not null default '',
  bank_code text not null default '',
  bank_account text not null default '',
  bank_account_name text not null default '',
  postal_giro_number text not null default '',
  postal_giro_name text not null default '',
  payment_note text not null default '',
  max_proof_bytes bigint not null default 10485760,

  updated_at timestamptz not null default now()
);

insert into public.registration_settings(id)
values(1)
on conflict(id) do nothing;

create sequence if not exists public.registration_number_seq start 1;

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  registration_number text unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  registration_type public.registration_type not null,
  submission_id uuid null references public.submissions(id) on delete restrict,

  name_zh text not null,
  name_en text not null default '',
  email text not null,
  affiliation text not null,
  job_title text not null default '',
  phone text not null,
  participant_category text not null default 'other'
    check (participant_category in ('faculty_researcher','industry','student','other')),

  attend_day1 boolean not null default true,
  attend_day2 boolean not null default true,
  dietary_requirement text not null default '一般',
  companion_count integer not null default 0 check (companion_count between 0 and 20),

  receipt_title text not null default '',
  tax_id text not null default '',

  amount_due integer not null default 0 check (amount_due>=0),
  fee_label text not null default '',
  status public.registration_status not null default 'pending_payment',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 一個登入帳號只保留一筆有效的「正式與會者註冊」。
create unique index if not exists registrations_one_active_per_user
on public.registrations(user_id)
where status <> 'cancelled';

-- 每篇稿件只有一位作者可使用「稿件費已包含 1 位作者註冊」資格。
create unique index if not exists registrations_one_primary_author_per_submission
on public.registrations(submission_id)
where registration_type='paper_primary_author'
  and status <> 'cancelled'
  and submission_id is not null;

create table if not exists public.registration_payments (
  id bigserial primary key,
  registration_id uuid unique not null references public.registrations(id) on delete cascade,
  payment_method public.registration_payment_method not null,
  payment_amount integer not null check (payment_amount>=0),
  payment_date date not null,
  reference_last5 text not null default '',
  proof_path text unique not null,
  proof_original_name text not null default '',
  proof_mime_type text not null default '',
  status public.registration_payment_status not null default 'proof_uploaded',
  review_note text not null default '',
  reviewed_by uuid null references public.profiles(id),
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.assign_registration_number()
returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.registration_number is null then
    new.registration_number :=
      'NCFD2026-R' || lpad(nextval('public.registration_number_seq')::text,4,'0');
  end if;
  return new;
end $$;

drop trigger if exists trg_registration_number on public.registrations;
create trigger trg_registration_number
before insert on public.registrations
for each row execute function public.assign_registration_number();

drop trigger if exists trg_registrations_touch on public.registrations;
create trigger trg_registrations_touch
before update on public.registrations
for each row execute function public.touch_updated_at();

drop trigger if exists trg_registration_payments_touch on public.registration_payments;
create trigger trg_registration_payments_touch
before update on public.registration_payments
for each row execute function public.touch_updated_at();

drop trigger if exists trg_registration_settings_touch on public.registration_settings;
create trigger trg_registration_settings_touch
before update on public.registration_settings
for each row execute function public.touch_updated_at();

create or replace function public.registration_is_open()
returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((
    select registrations_enabled
      and now() >= registration_open_at
      and (
        now() <= online_registration_deadline
        or (
          onsite_registration_enabled
          and now() >= event_start
          and now() <= event_end
        )
      )
    from public.registration_settings
    where id=1
  ),false);
$$;

create or replace function public.registration_matches_submission(p_submission_id uuid)
returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1
    from public.submissions s
    where s.id=p_submission_id
      and (
        s.owner_id=auth.uid()
        or exists(
          select 1
          from public.submission_authors a
          join auth.users u on u.id=auth.uid()
          where a.submission_id=s.id
            and lower(btrim(a.email))=lower(btrim(u.email))
        )
      )
  );
$$;

create or replace function public.registration_fee_quote(
  p_registration_type public.registration_type,
  p_submission_number text default null
)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  st public.registration_settings%rowtype;
  sid uuid;
  stitle text;
  slot_used boolean := false;
  amount integer := 0;
  label text := '';
  open_now boolean := false;
begin
  if auth.uid() is null then
    raise exception '請先登入。';
  end if;

  select * into st from public.registration_settings where id=1;
  open_now := public.registration_is_open();

  if p_registration_type in ('paper_primary_author','paper_additional_author') then
    select id, coalesce(nullif(title_zh,''),title_en)
      into sid, stitle
    from public.submissions
    where upper(btrim(submission_number))=upper(btrim(p_submission_number))
    limit 1;

    if sid is null then
      raise exception '找不到此投稿編號。';
    end if;
    if not public.registration_matches_submission(sid) then
      raise exception '目前登入 Email 未出現在此稿件作者資料中。';
    end if;
  end if;

  if p_registration_type='paper_primary_author' then
    select exists(
      select 1 from public.registrations
      where submission_id=sid
        and registration_type='paper_primary_author'
        and status <> 'cancelled'
    ) into slot_used;

    if now() <= st.early_bird_deadline then
      amount := st.paper_fee_early;
      label := '稿件早鳥費（包含 1 位作者註冊）';
    elsif now() <= st.online_registration_deadline then
      amount := st.paper_fee_regular;
      label := '稿件一般費（包含 1 位作者註冊）';
    else
      amount := st.paper_fee_onsite;
      label := '稿件現場費（包含 1 位作者註冊）';
    end if;
  elsif p_registration_type='paper_additional_author' then
    amount := st.additional_author_fee;
    label := '同篇稿件第 2 位及後續作者註冊費';
  else
    amount := st.general_attendee_fee;
    label := '一般與會者註冊費';
  end if;

  return jsonb_build_object(
    'open',open_now,
    'amount',amount,
    'label',label,
    'submission_id',sid,
    'submission_title',coalesce(stitle,''),
    'primary_slot_used',slot_used,
    'early_bird_deadline',st.early_bird_deadline,
    'online_registration_deadline',st.online_registration_deadline
  );
end $$;

create or replace function public.create_conference_registration(
  p_registration_type public.registration_type,
  p_submission_number text,
  p_name_zh text,
  p_name_en text,
  p_affiliation text,
  p_job_title text,
  p_phone text,
  p_participant_category text,
  p_attend_day1 boolean,
  p_attend_day2 boolean,
  p_dietary_requirement text,
  p_companion_count integer,
  p_receipt_title text,
  p_tax_id text
)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  q jsonb;
  uid uuid := auth.uid();
  user_email text;
  sid uuid;
  rid uuid;
  rnum text;
  amount integer;
  label text;
begin
  if uid is null then raise exception '請先登入。'; end if;
  if not public.registration_is_open() then
    raise exception '目前不在會議註冊開放時段。';
  end if;

  if nullif(btrim(p_name_zh),'') is null
     or nullif(btrim(p_affiliation),'') is null
     or nullif(btrim(p_phone),'') is null then
    raise exception '姓名、服務單位與電話為必填。';
  end if;

  if p_participant_category not in ('faculty_researcher','industry','student','other') then
    raise exception '參加者身份不正確。';
  end if;

  select email into user_email from auth.users where id=uid;

  q := public.registration_fee_quote(p_registration_type,p_submission_number);
  sid := nullif(q->>'submission_id','')::uuid;
  amount := (q->>'amount')::integer;
  label := q->>'label';

  if p_registration_type='paper_primary_author'
     and coalesce((q->>'primary_slot_used')::boolean,false) then
    raise exception '此稿件已使用「稿件費包含 1 位作者註冊」資格，請改選同篇稿件其他作者。';
  end if;

  -- 同步最新基本資料到 profile。
  update public.profiles
  set full_name_zh=btrim(p_name_zh),
      full_name_en=coalesce(btrim(p_name_en),''),
      affiliation=btrim(p_affiliation),
      job_title=coalesce(btrim(p_job_title),''),
      phone=btrim(p_phone)
  where id=uid;

  insert into public.registrations(
    user_id,registration_type,submission_id,
    name_zh,name_en,email,affiliation,job_title,phone,participant_category,
    attend_day1,attend_day2,dietary_requirement,companion_count,
    receipt_title,tax_id,amount_due,fee_label
  ) values(
    uid,p_registration_type,sid,
    btrim(p_name_zh),coalesce(btrim(p_name_en),''),lower(user_email),
    btrim(p_affiliation),coalesce(btrim(p_job_title),''),btrim(p_phone),p_participant_category,
    coalesce(p_attend_day1,true),coalesce(p_attend_day2,true),
    coalesce(nullif(btrim(p_dietary_requirement),''),'一般'),
    greatest(0,least(coalesce(p_companion_count,0),20)),
    coalesce(btrim(p_receipt_title),''),coalesce(btrim(p_tax_id),''),
    amount,label
  )
  returning id,registration_number into rid,rnum;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,details)
  values(uid,'registration',rid::text,'registration_created',
         jsonb_build_object('registration_number',rnum,'amount_due',amount));

  return jsonb_build_object(
    'id',rid,'registration_number',rnum,'amount_due',amount,'fee_label',label
  );
exception
  when unique_violation then
    raise exception '您已有有效的會議註冊，或此稿件的包含作者名額已被使用。';
end $$;

create or replace function public.submit_registration_payment(
  p_registration_id uuid,
  p_payment_method public.registration_payment_method,
  p_payment_date date,
  p_reference_last5 text,
  p_proof_path text,
  p_proof_original_name text,
  p_proof_mime_type text
)
returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  r public.registrations%rowtype;
  prefix text;
begin
  if auth.uid() is null then raise exception '請先登入。'; end if;

  select * into r
  from public.registrations
  where id=p_registration_id and user_id=auth.uid();

  if r.id is null then raise exception '找不到註冊資料。'; end if;
  if r.status in ('paid','cancelled') then
    raise exception '此註冊狀態不可再上傳付款證明。';
  end if;

  prefix := auth.uid()::text || '/' || r.id::text || '/';
  if position(prefix in p_proof_path) <> 1 then
    raise exception '付款證明檔案路徑不正確。';
  end if;

  insert into public.registration_payments(
    registration_id,payment_method,payment_amount,payment_date,reference_last5,
    proof_path,proof_original_name,proof_mime_type,status,review_note,reviewed_by,reviewed_at
  ) values(
    r.id,p_payment_method,r.amount_due,p_payment_date,coalesce(btrim(p_reference_last5),''),
    p_proof_path,coalesce(p_proof_original_name,''),coalesce(p_proof_mime_type,''),
    'proof_uploaded','',null,null
  )
  on conflict(registration_id) do update set
    payment_method=excluded.payment_method,
    payment_amount=r.amount_due,
    payment_date=excluded.payment_date,
    reference_last5=excluded.reference_last5,
    proof_path=excluded.proof_path,
    proof_original_name=excluded.proof_original_name,
    proof_mime_type=excluded.proof_mime_type,
    status='proof_uploaded',
    review_note='',
    reviewed_by=null,
    reviewed_at=null,
    updated_at=now();

  update public.registrations
  set status='payment_submitted'
  where id=r.id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,details)
  values(auth.uid(),'registration',r.id::text,'payment_proof_uploaded',
         jsonb_build_object('method',p_payment_method,'amount',r.amount_due));
end $$;

create or replace function public.review_registration_payment(
  p_registration_id uuid,
  p_decision public.registration_payment_status,
  p_review_note text default ''
)
returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  payid bigint;
begin
  if not public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]) then
    raise exception '無管理權限。';
  end if;

  if p_decision not in ('paid','reupload_required') then
    raise exception '審核結果不正確。';
  end if;

  select id into payid
  from public.registration_payments
  where registration_id=p_registration_id;

  if payid is null then raise exception '尚未上傳付款證明。'; end if;

  update public.registration_payments
  set status=p_decision,
      review_note=coalesce(p_review_note,''),
      reviewed_by=auth.uid(),
      reviewed_at=now()
  where id=payid;

  update public.registrations
  set status=case when p_decision='paid' then 'paid'::public.registration_status
                  else 'reupload_required'::public.registration_status end
  where id=p_registration_id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,details)
  values(auth.uid(),'registration',p_registration_id::text,'payment_reviewed',
         jsonb_build_object('decision',p_decision,'note',coalesce(p_review_note,'')));
end $$;

-- RLS
alter table public.registration_settings enable row level security;
alter table public.registrations enable row level security;
alter table public.registration_payments enable row level security;

drop policy if exists registration_settings_select on public.registration_settings;
create policy registration_settings_select
on public.registration_settings for select
to authenticated
using(true);

drop policy if exists registration_settings_admin_update on public.registration_settings;
create policy registration_settings_admin_update
on public.registration_settings for update
to authenticated
using(public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]))
with check(public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]));

drop policy if exists registrations_select on public.registrations;
create policy registrations_select
on public.registrations for select
to authenticated
using(
  user_id=auth.uid()
  or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])
);

drop policy if exists registration_payments_select on public.registration_payments;
create policy registration_payments_select
on public.registration_payments for select
to authenticated
using(
  exists(
    select 1 from public.registrations r
    where r.id=registration_id
      and (
        r.user_id=auth.uid()
        or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])
      )
  )
);

-- Private payment proof bucket
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'registration-payment-proofs',
  'registration-payment-proofs',
  false,
  10485760,
  array['image/jpeg','image/png','application/pdf']
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists registration_proof_insert on storage.objects;
create policy registration_proof_insert
on storage.objects for insert
to authenticated
with check(
  bucket_id='registration-payment-proofs'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists(
    select 1 from public.registrations r
    where r.user_id=auth.uid()
      and r.id::text=(storage.foldername(name))[2]
      and r.status not in ('paid','cancelled')
  )
);

drop policy if exists registration_proof_select on storage.objects;
create policy registration_proof_select
on storage.objects for select
to authenticated
using(
  bucket_id='registration-payment-proofs'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role])
  )
);

grant select on public.registration_settings,public.registrations,public.registration_payments to authenticated;
grant usage,select on sequence public.registration_number_seq to authenticated;

grant execute on function public.registration_is_open() to anon,authenticated;
grant execute on function public.registration_fee_quote(public.registration_type,text) to authenticated;
grant execute on function public.create_conference_registration(
  public.registration_type,text,text,text,text,text,text,text,boolean,boolean,text,integer,text,text
) to authenticated;
grant execute on function public.submit_registration_payment(
  uuid,public.registration_payment_method,date,text,text,text,text
) to authenticated;
grant execute on function public.review_registration_payment(
  uuid,public.registration_payment_status,text
) to authenticated;

commit;
