// NCFD2026 投稿系統前端設定
// Supabase Publishable key 可以放在瀏覽器端；真正的資料存取安全由 RLS 控制。
window.NCFD_CONFIG = {
  siteUrl: 'https://chihyungwu0811.github.io/NCFD2026',
  supabaseUrl: 'https://gusvelqjkafjtzeiztwf.supabase.co',
  supabasePublishableKey: 'sb_publishable_Lyk9M8hmidYd_nn4du8_8w_WTiIzoE2',
  submissionConfirmationEmailEnabled: false,
  conference: {
    nameZh: '2026 全國計算流體力學會議',
    nameEn: 'National Computational Fluid Dynamics Conference'
  }
};
