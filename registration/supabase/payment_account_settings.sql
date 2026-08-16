-- NCFD2026 收款資訊設定
-- Supabase > SQL Editor > Database 執行一次即可。
-- 不會更動投稿資料、註冊資料或付款審核紀錄。

update public.registration_settings
set
  bank_name = '中華郵政',
  bank_code = '700',
  bank_account = '00310710964176',
  bank_account_name = '中華民國航空太空學會袁曉峰',
  postal_giro_number = '19826163',
  postal_giro_name = '中華民國航空太空學會袁曉峰',
  payment_note = '使用劃撥或轉帳時，記得於備註欄填寫會議論文號碼，以利後續查核。完成付款後，請將掃描收據或轉帳紀錄於註冊系統中上傳。'
where id = 1;

select
  bank_name,
  bank_code,
  bank_account,
  bank_account_name,
  postal_giro_number,
  postal_giro_name,
  payment_note
from public.registration_settings
where id = 1;
