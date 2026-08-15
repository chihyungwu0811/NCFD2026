# NCFD2026 Conference + Submission System

2026 全國計算流體力學會議網站與投稿系統。

- 前端：純 HTML / CSS / JavaScript，可直接放在 GitHub Pages。
- 後端：Supabase Auth + Postgres + Storage + RLS。
- 投稿流程：註冊 → 草稿 → 正式提交 → 審查 → 決議。
- 角色：投稿者 / Reviewer / Admin / Chair。
- PDF：Private Storage，預設 10 MB、僅 PDF。
- Email：Supabase Auth 會處理帳號驗證與重設密碼；另附可選的投稿完成通知 Edge Function。

## 最快上線方式

請依照 [`SETUP.md`](SETUP.md) 操作。完成 Supabase 設定後，把整個資料夾內容上傳到目前的 GitHub repository `NCFD2026` 根目錄即可。

正式網址：

`https://chihyungwu0811.github.io/NCFD2026/`

## 主要檔案

- `index.html`：會議首頁
- `auth.html`：登入 / 註冊
- `dashboard.html`：投稿者中心
- `submission.html`：建立 / 修改投稿
- `reviewer.html`：審查委員中心
- `admin.html`：管理後台
- `privacy.html`：個資使用說明草案
- `assets/js/config.js`：Supabase Project URL / Publishable key
- `supabase/schema.sql`：資料表、RLS、Storage policy、RPC

## 注意

`assets/js/config.js` 只能放 Supabase **Publishable key**（或舊版 anon key），絕對不要放 Secret key / service_role key。
