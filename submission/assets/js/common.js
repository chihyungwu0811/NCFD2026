const NCFD = {
  cfg: window.NCFD_CONFIG,
  db: window.ncfd,
  configured: window.NCFD_IS_CONFIGURED,
  statusLabels: {
    draft:'草稿', submitted:'已投稿', under_review:'審查中', revision:'退修',
    accepted:'錄取', rejected:'未錄取', withdrawn:'已撤稿', final_submitted:'最終版已上傳'
  },
  recommendationLabels: { accept:'建議錄取', minor_revision:'建議修正', reject:'建議不錄取' },
  el(sel, root=document){ return root.querySelector(sel); },
  els(sel, root=document){ return [...root.querySelectorAll(sel)]; },
  escape(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); },
  toast(message, type='success'){
    const box=document.createElement('div'); box.className=`notice ${type}`; box.textContent=message;
    const host=document.querySelector('[data-flash]') || document.querySelector('.content .container') || document.body;
    host.prepend(box); setTimeout(()=>box.remove(),6500);
  },
  async session(){ if(!this.db) return null; const {data}=await this.db.auth.getSession(); return data.session; },
  async user(){ const s=await this.session(); return s?.user || null; },
  async roles(){
    const u=await this.user(); if(!u) return [];
    const {data,error}=await this.db.from('staff_roles').select('role').eq('user_id',u.id);
    if(error) return []; return (data||[]).map(r=>r.role);
  },
  async requireAuth(){
    if(!this.configured){ this.showConfigRequired(); return null; }
    const u=await this.user();
    if(!u){ location.href='auth.html?next='+encodeURIComponent(location.pathname.split('/').pop()+location.search); return null; }
    return u;
  },
  async requireRole(allowed){
    const u=await this.requireAuth(); if(!u) return null;
    const roles=await this.roles();
    if(!roles.some(r=>allowed.includes(r))){
      document.body.innerHTML='<main class="content"><div class="container"><div class="notice error">您沒有權限瀏覽這個頁面。</div><a class="btn btn-blue" href="dashboard.html">返回投稿者首頁</a></div></main>';
      return null;
    }
    return {user:u,roles};
  },
  showConfigRequired(){
    const target=document.querySelector('[data-app]') || document.querySelector('.content .container') || document.body;
    target.innerHTML='<div class="panel"><h2>尚未連接投稿資料庫</h2><p>請先依照 <strong>SETUP.md</strong> 建立 Supabase 專案，然後將 Project URL 與 Publishable key 填入 <code>assets/js/config.js</code>。</p><a class="btn btn-blue" href="index.html">返回會議首頁</a></div>';
  },
  async refreshNav(){
    const nav=document.querySelector('[data-user-nav]'); if(!nav) return;
    if(!this.configured){ nav.innerHTML='<a class="nav-cta" href="auth.html">投稿系統設定</a>'; return; }
    const u=await this.user();
    if(!u){ nav.innerHTML='<a class="nav-cta" href="auth.html">投稿 / 登入</a>'; return; }
    const roles=await this.roles();
    let extras='';
    if(roles.includes('reviewer')||roles.includes('admin')||roles.includes('chair')) extras+='<a href="reviewer.html">審查</a>';
    if(roles.includes('admin')||roles.includes('chair')) extras+='<a href="admin.html">管理</a>';
    nav.innerHTML=`${extras}<a href="dashboard.html">我的投稿</a><button class="btn btn-sm btn-outline" data-logout>登出</button>`;
    const b=nav.querySelector('[data-logout]'); if(b) b.addEventListener('click',async()=>{await this.db.auth.signOut();location.href='index.html';});
  },
  statusBadge(status){ return `<span class="status status-${this.escape(status)}">${this.escape(this.statusLabels[status]||status)}</span>`; },
  formatDate(v){ if(!v) return '—'; try{return new Intl.DateTimeFormat('zh-TW',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Taipei'}).format(new Date(v));}catch{return v;} },
  async signedFileUrl(path, expires=300){
    if(!path) return null;
    const {data,error}=await this.db.storage.from('submission-files').createSignedUrl(path,expires);
    if(error) throw error; return data.signedUrl;
  },
  safeFilename(name){ return name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-100); }
};
window.NCFD=NCFD;
document.addEventListener('DOMContentLoaded',()=>NCFD.refreshNav());
