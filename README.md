# NCFD2026 2026-11-01 Hotfix

本 Patch 同時處理三件事：

1. **投稿者中心只顯示自己的投稿**
   - 即使 Chair/Admin 因 RLS 可以讀全部投稿，「我的投稿」仍強制 `.eq('owner_id', user.id)`。
   - 全部投稿只有 `投稿管理 admin.html` 顯示。

2. **會議註冊後台可手動變更註冊狀態**
   - 可選：待付款、付款證明待審核、已確認付款、需補件、已取消。
   - 付款證明相關狀態必須已有付款證明，避免把沒有佐證的註冊誤標為已付款。
   - 每次變更會寫入 audit_logs。

3. **錄取稿件新增海報與授權書上傳**
   - 海報：PPT / PPTX / PDF，最大 50 MB。
   - 授權書：PDF / JPG / PNG，最大 10 MB。
   - 只有稿件 owner 且狀態為 accepted / final_submitted 可以上傳。
   - Chair/Admin 可在投稿管理後台下載查核。
   - Reviewer 不會取得這兩份最終文件的存取權。

## Supabase
先執行：

`submission/supabase/NCFD2026_20261101_hotfix.sql`

請確認 SQL Editor 右上角為 **Database**。

## GitHub
覆蓋 / 新增：

- `submission/assets/js/dashboard.js`
- `submission/assets/js/admin.js`
- `submission/deliverables.html`（新增）
- `submission/assets/js/deliverables.js`（新增）
- `registration/assets/js/admin.js`

不要覆蓋：

- `submission/assets/js/config.js`
- 首頁 `index.html`
- 目前已調整好的導覽列 / CSS

## 使用流程

### 投稿者
錄取後，投稿者中心該稿件會多出 **「海報／授權書」** 按鈕，進入後分別上傳兩份文件。

### 投稿管理員
投稿管理表格原本「稿件/審查」欄會同時顯示：
- 摘要 PDF
- 海報（已上傳時）
- 授權書（已上傳時）

### 註冊管理員
註冊後台每一筆資料的「審核」欄會新增 **狀態下拉選單＋套用狀態**。
