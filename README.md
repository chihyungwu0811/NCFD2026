# NCFD2026 後台檢查修正版

我檢查了目前「投稿後台 + 會議註冊後台」的程式，這個 Patch 修正幾個實際問題。

## 已修正

1. **註冊後台儲存設定權限**
   - 原本有 RLS policy，但缺少 PostgreSQL `UPDATE` grant。
   - 可能造成 Chair/Admin 按「儲存設定」時出現 permission denied。

2. **註冊後台 datetime-local 顯示**
   - 原本產生 `YYYY-MM-DD HH:mm`。
   - HTML `datetime-local` 需要 `YYYY-MM-DDTHH:mm`。
   - 已修正，避免時間欄位載入後變空白。

3. **避免繞過稿件費**
   - 原本共同作者可以在尚未有人建立稿件費註冊時，直接選「第 2 位及後續作者」只繳 NT$2,000。
   - 修正後：每篇稿件必須先有 1 位作者建立 4,000 / 4,500 / 5,000 元稿件費註冊，其他作者才能使用 NT$2,000 費率。

4. **作者資格**
   - 必須以目前登入 Email 出現在該稿件作者名單中。
   - 草稿、撤稿、未錄取稿件不可使用稿件作者費率。

5. **付款審核**
   - 補件狀態不再直接顯示「確認付款」按鈕。
   - 等註冊者重新上傳付款證明後才重新進入待審核。
   - 已取消註冊不可誤標成已付款。
   - 後台會顯示付款方式、日期、末五碼/識別資訊、審核註記。

6. **CSV**
   - 增加投稿編號、付款方式、付款日期、末五碼、付款狀態、收據抬頭、統編、參加日期、飲食需求、同行人數等欄位。

7. **兩個後台互通**
   - 投稿系統 Chair/Admin 導覽列增加「註冊管理」。
   - 註冊系統 Chair/Admin 導覽列增加「投稿管理」。

## 使用方式

### A. 先執行 SQL Hotfix
Supabase → SQL Editor → **Database** → New query

執行：
`registration/supabase/registration_backend_hotfix_v2.sql`

### B. 再覆蓋 GitHub 的三個檔案

- `registration/assets/js/admin.js`
- `registration/assets/js/registration-common.js`
- `submission/assets/js/common.js`

**不要覆蓋 `submission/assets/js/config.js`。**

## 一個仍建議日後處理的情境

目前資料模型設定「一個登入帳號只能有一筆有效會議註冊」。
如果未來發生「同一位作者同時是兩篇或多篇稿件唯一作者／繳費負責人」，
每篇稿件都需要獨立稿件費，但同一個人只應算一位與會者。
這種情況最好再把「與會註冊」和「每篇稿件費」拆成兩種資料。
目前一般的一人一稿／多人一稿流程可正常使用。
