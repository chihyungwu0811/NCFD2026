# NCFD2026 投稿系統部署步驟

## 1. 建立 Supabase 專案

到 Supabase 建立一個專案。建立完成後，先不要把 Secret key 放到 GitHub。

## 2. 建立資料庫、權限與 Storage

在 Supabase Dashboard 開啟 **SQL Editor**，將 `supabase/schema.sql` 全部貼上並執行。

這個 SQL 會建立：

- profiles
- submissions
- submission_authors
- submission_files
- review_assignments
- reviews
- staff_roles
- audit_logs
- conference_settings
- `submission-files` 私有 Storage bucket
- Row Level Security (RLS) policies
- 投稿、撤稿、指派 reviewer、決議用 RPC

## 3. 設定 Supabase Auth 網址

在 Supabase 的 Authentication / URL Configuration 設定：

**Site URL**

`https://chihyungwu0811.github.io/NCFD2026/`

**Redirect URLs** 建議逐一加入：

- `https://chihyungwu0811.github.io/NCFD2026/dashboard.html`
- `https://chihyungwu0811.github.io/NCFD2026/reset-password.html`

若測試時使用 localhost，也另外加入你的 localhost URL。

## 4. 將 Supabase 連線資訊填入網站

到 Supabase Dashboard 的 API Keys 區域取得：

- Project URL
- Publishable key

修改：

`assets/js/config.js`

例如：

```js
window.NCFD_CONFIG = {
  siteUrl: 'https://chihyungwu0811.github.io/NCFD2026/',
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabasePublishableKey: 'sb_publishable_xxxxxxxxx',
  submissionConfirmationEmailEnabled: false,
  conference: {
    nameZh: '2026 全國計算流體力學會議',
    nameEn: 'National Computational Fluid Dynamics Conference'
  }
};
```

Publishable key 是設計給瀏覽器使用的；系統安全依賴資料庫 RLS。**Secret key / service_role key 絕對不可放在 GitHub 或網頁程式碼。**

## 5. 建立第一位 Chair / Admin

先到你自己的網站 `auth.html` 註冊一個籌備委員帳號並完成 Email 驗證。

接著回到 Supabase SQL Editor 執行：

```sql
select public.bootstrap_admin('你的Email@example.com');
```

這個帳號會取得 `chair` 權限，可進入 `admin.html`。

## 6. 測試階段提前開放投稿

正式設定預設 2026/08/17 才開放投稿。若你現在要測試，可在 SQL Editor 暫時執行：

```sql
update public.conference_settings
set submission_open_at = now() - interval '1 day',
    submission_deadline = now() + interval '14 days',
    submissions_enabled = true
where id = 1;
```

測試完成後，從 `admin.html` 改回正式時程。

目前「投稿摘要正式截止時間」尚未由既有會議資訊單獨指定，因此資料庫預設 `submission_deadline = NULL`。在正式公告前，請由 Chair 後台設定確切的截止時間（Asia/Taipei）。

## 7. Reviewer 使用方式

Reviewer 必須先自行在 `auth.html` 註冊並完成 Email 驗證。

Chair 在 `admin.html` 的稿件列表按「指派審查」，輸入 Reviewer 的註冊 Email。系統會：

1. 將該帳號加入 reviewer role。
2. 建立 review assignment。
3. Reviewer 登入後可從上方選單進入 `reviewer.html`。

## 8. 上傳到 GitHub Pages

將本專案所有檔案上傳至 GitHub repository `NCFD2026` 的根目錄，必須讓 `index.html` 位於 repository 最上層。

GitHub Pages 設定：

- Settings → Pages
- Source：Deploy from a branch
- Branch：`main`
- Folder：`/(root)`

發布完成後：

`https://chihyungwu0811.github.io/NCFD2026/`

## 9. 可選：投稿完成 Email 通知

專案內附：

`supabase/functions/send-submission-confirmation/index.ts`

若要啟用，需要 Resend 帳號、API key 與已驗證的寄件網域。將 `RESEND_API_KEY`、`RESEND_FROM` 設為 Supabase Edge Function secrets，再部署該 function。

部署完成後，把 `assets/js/config.js` 的：

```js
submissionConfirmationEmailEnabled: true
```

即可在正式提交後嘗試寄出確認信。即使 Email function 暫時未啟用，投稿資料仍會正常提交，投稿者可在 Dashboard 確認狀態。

## 10. 上線前測試清單

- [ ] 新帳號可註冊並收到 Email 驗證信
- [ ] 未登入者不能讀取投稿資料
- [ ] 投稿者 A 看不到投稿者 B 的稿件
- [ ] 可新增草稿、作者、摘要、PDF
- [ ] 非 PDF / 超過 10 MB 被拒絕
- [ ] 正式提交前會檢查領域、題目、中文摘要、關鍵字、作者、通訊作者、報告者、PDF
- [ ] Reviewer 只能看到被指派稿件
- [ ] Reviewer 可提交審查評分與意見
- [ ] Chair 可匯出 CSV、指派 reviewer、變更稿件狀態
- [ ] 一般使用者不能進入 admin/reviewer 功能
- [ ] GitHub repository 中沒有 Secret key / service_role key
- [ ] `privacy.html` 個資文字已由主辦單位確認
- [ ] 正式投稿截止時間已確定並設定
