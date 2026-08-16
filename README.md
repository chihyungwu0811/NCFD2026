# NCFD2026 付費方式資訊 Patch

本 Patch 加入：

## 郵政劃撥
- 劃撥帳號：19826163
- 戶名：中華民國航空太空學會袁曉峰

## 郵局帳戶轉帳
- 金融機構代碼：700
- 帳號：0031071 0964176
- 戶名：中華民國航空太空學會袁曉峰

## 付款提醒
使用劃撥或轉帳時，記得於備註欄填寫會議論文號碼，以利後續查核。
完成付款後，請將掃描收據或轉帳紀錄於註冊系統中上傳。

## 操作

### 1. Supabase
先執行：
`registration/supabase/payment_account_settings.sql`

這樣註冊者的付款頁會自動從 Supabase 顯示正確收款資訊。

### 2. GitHub
覆蓋：
- `index.html`
- `registration/index.html`
- `registration/payment.html`
- `registration/admin.html`
- `registration/assets/js/registration-common.js`

不要覆蓋：
- `submission/assets/js/config.js`
- `registration/assets/js/admin.js`

此 Patch 的 `registration-common.js` 已沿用上一版後台檢查修正版，
不會移除「投稿管理 / 註冊管理」互通連結。
