(function(){
  const cfg = window.NCFD_CONFIG || {};
  const isConfigured = cfg.supabaseUrl && cfg.supabasePublishableKey &&
    !cfg.supabaseUrl.includes('PASTE_') && !cfg.supabasePublishableKey.includes('PASTE_');
  window.NCFD_IS_CONFIGURED = !!isConfigured;
  window.ncfd = isConfigured
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;
})();
