# NCFD2026 會議註冊系統 Patch

此套件**不覆蓋你目前已設定好的 `submission/assets/js/config.js`**。
註冊系統會直接共用投稿系統現有的 Supabase Project URL 與 Publishable key。

## 1. 先在 Supabase 執行 migration

打開：

`registration/supabase/registration_migration.sql`

到 Supabase → SQL Editor → **Database** → New query，
貼入完整內容並 Run。

Migration 會新增：

- `registration_settings`
- `registrations`
- `registration_payments`
- 私有 Storage bucket：`registration-payment-proofs`
- 註冊費伺服器端計算
- 付款證明 RLS
- 管理員人工付款審核 RPC

## 2. Authentication Redirect URL

Supabase → Authentication → URL Configuration → Redirect URLs
再加入：

`https://chihyungwu0811.github.io/NCFD2026/registration/dashboard.html`

## 3. GitHub 上傳

把本 Patch 的以下內容放到 NCFD2026 repository 根目錄：

- `registration/` 整個資料夾
- `index.html` 覆蓋首頁
- `sitemap.xml` 覆蓋原 sitemap

**不要刪除或覆蓋你目前的 submission 資料夾。**

## 4. 管理員先設定收款資料

登入 Chair/Admin 後：

`https://chihyungwu0811.github.io/NCFD2026/registration/admin.html`

填寫：
- 銀行名稱／代碼／帳號／戶名
- 郵政劃撥帳號／戶名
- 付款說明

## 目前費率

- 稿件早鳥：NT$4,000／篇，含 1 位作者註冊
- 稿件一般：NT$4,500／篇，含 1 位作者註冊
- 稿件現場：NT$5,000／篇，含 1 位作者註冊
- 同篇第 2 位及後續作者：NT$2,000／人
- 無投稿一般與會者：NT$2,000／人
- 學生：沒有不同費率
- 陪同親友：免費

## 付款證明

接受 JPG / PNG / PDF，最大 10 MB。
檔案存於 private Supabase Storage，只有本人與 Chair/Admin 可讀取。
