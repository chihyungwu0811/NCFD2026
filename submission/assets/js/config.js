// NCFD2026 投稿系統前端設定
// Supabase Publishable key 可以放在瀏覽器端；真正的資料存取安全由 RLS 控制。
window.NCFD_CONFIG = {
  siteUrl: 'https://chihyungwu0811.github.io/NCFD2026/',
  supabaseUrl: 'PASTE_YOUR_SUPABASE_URL_HERE',
  supabasePublishableKey: 'PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE',
  submissionConfirmationEmailEnabled: false,
  conference: {
    nameZh: '2026 全國計算流體力學會議',
    nameEn: 'National Computational Fluid Dynamics Conference'
  }
};
