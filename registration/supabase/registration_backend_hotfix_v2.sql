-- NCFD2026 註冊系統後台 / 計費邏輯 Hotfix v2
-- 適用於已經執行過 registration_migration.sql 的 Supabase 專案。
-- Supabase > SQL Editor > Database > New query 執行一次即可。

begin;

-- BUG FIX 1:
-- 原 migration 建立了 registration_settings UPDATE RLS policy，
-- 但沒有給 authenticated UPDATE table privilege，導致 Chair/Admin 後台「儲存設定」可能 Permission denied。
grant select, update on public.registration_settings to authenticated;

-- 不需要讓一般 authenticated 直接消耗註冊編號 sequence。
revoke usage, select on sequence public.registration_number_seq from authenticated;

-- 僅真正列在作者名單中的 Email，才視為稿件作者。
create or replace function public.registration_matches_submission(p_submission_id uuid)
returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1
    from public.submission_authors a
    join auth.users u on u.id=auth.uid()
    where a.submission_id=p_submission_id
      and lower(btrim(a.email))=lower(btrim(u.email))
  );
$$;

-- BUG FIX 2:
-- 原版本允許作者直接選「第 2 位及後續作者」並繳 NT$2,000，
-- 即使該篇稿件尚未有人建立 NT$4,000/4,500/5,000 的稿件費註冊。
-- 這會形成繞過稿件費的漏洞。
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
  sstatus public.submission_status;
  primary_exists boolean := false;
  primary_status text := '';
  amount integer := 0;
  label text := '';
  open_now boolean := false;
begin
  if auth.uid() is null then
    raise exception '請先登入。';
  end if;

  select * into st from public.registration_settings where id=1;
  if st.id is null then
    raise exception '尚未建立會議註冊設定。';
  end if;

  open_now := public.registration_is_open();

  if p_registration_type in ('paper_primary_author','paper_additional_author') then
    if nullif(btrim(p_submission_number),'') is null then
      raise exception '請輸入投稿編號。';
    end if;

    select id, coalesce(nullif(title_zh,''),title_en),status
      into sid, stitle, sstatus
    from public.submissions
    where upper(btrim(submission_number))=upper(btrim(p_submission_number))
    limit 1;

    if sid is null then
      raise exception '找不到此投稿編號。';
    end if;

    if sstatus not in ('submitted','under_review','revision','accepted','final_submitted') then
      raise exception '此稿件目前狀態不適用作者註冊；請先正式提交稿件，或改以一般與會者註冊。';
    end if;

    if not public.registration_matches_submission(sid) then
      raise exception '目前登入 Email 未出現在此稿件作者名單中。';
    end if;

    select exists(
      select 1 from public.registrations
      where submission_id=sid
        and registration_type='paper_primary_author'
        and status <> 'cancelled'
    ) into primary_exists;

    select status::text
      into primary_status
    from public.registrations
    where submission_id=sid
      and registration_type='paper_primary_author'
      and status <> 'cancelled'
    order by created_at
    limit 1;
  end if;

  if p_registration_type='paper_primary_author' then
    if primary_exists then
      raise exception '此稿件已經有作者使用稿件費包含的註冊資格；其他作者請選擇「同篇稿件第 2 位及後續作者」。';
    end if;

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
    if not primary_exists then
      raise exception '此稿件尚未建立稿件費註冊。請先由其中 1 位作者選擇「稿件費包含 1 位作者註冊」，其他作者之後再以 NT$2,000 註冊。';
    end if;

    amount := st.additional_author_fee;
    label := '同篇稿件第 2 位及後續作者註冊費';

  elsif p_registration_type='general_attendee' then
    amount := st.general_attendee_fee;
    label := '一般與會者註冊費';

  else
    raise exception '參加身份不正確。';
  end if;

  return jsonb_build_object(
    'open',open_now,
    'amount',amount,
    'label',label,
    'submission_id',sid,
    'submission_title',coalesce(stitle,''),
    'primary_slot_used',primary_exists,
    'primary_registration_status',coalesce(primary_status,''),
    'early_bird_deadline',st.early_bird_deadline,
    'online_registration_deadline',st.online_registration_deadline
  );
end $$;

-- BUG FIX 3:
-- 管理員不可把「已取消」的註冊誤標成已付款；審核時也要求付款證明存在。
create or replace function public.review_registration_payment(
  p_registration_id uuid,
  p_decision public.registration_payment_status,
  p_review_note text default ''
)
returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  payid bigint;
  reg_status public.registration_status;
begin
  if not public.has_staff_role(array['admin'::public.staff_role,'chair'::public.staff_role]) then
    raise exception '無管理權限。';
  end if;

  if p_decision not in ('paid','reupload_required') then
    raise exception '審核結果不正確。';
  end if;

  select status into reg_status
  from public.registrations
  where id=p_registration_id;

  if reg_status is null then raise exception '找不到註冊資料。'; end if;
  if reg_status='cancelled' then raise exception '已取消的註冊不可進行付款審核。'; end if;

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
  set status=case
    when p_decision='paid' then 'paid'::public.registration_status
    else 'reupload_required'::public.registration_status
  end
  where id=p_registration_id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,details)
  values(
    auth.uid(),'registration',p_registration_id::text,'payment_reviewed',
    jsonb_build_object('decision',p_decision,'note',coalesce(p_review_note,''))
  );
end $$;

-- 收斂 SECURITY DEFINER RPC 的直接執行權限。
revoke all on function public.registration_matches_submission(uuid) from public,anon,authenticated;

revoke all on function public.registration_fee_quote(public.registration_type,text) from public,anon;
grant execute on function public.registration_fee_quote(public.registration_type,text) to authenticated;

revoke all on function public.create_conference_registration(
  public.registration_type,text,text,text,text,text,text,text,boolean,boolean,text,integer,text,text
) from public,anon;
grant execute on function public.create_conference_registration(
  public.registration_type,text,text,text,text,text,text,text,boolean,boolean,text,integer,text,text
) to authenticated;

revoke all on function public.submit_registration_payment(
  uuid,public.registration_payment_method,date,text,text,text,text
) from public,anon;
grant execute on function public.submit_registration_payment(
  uuid,public.registration_payment_method,date,text,text,text,text
) to authenticated;

revoke all on function public.review_registration_payment(
  uuid,public.registration_payment_status,text
) from public,anon;
grant execute on function public.review_registration_payment(
  uuid,public.registration_payment_status,text
) to authenticated;

commit;
