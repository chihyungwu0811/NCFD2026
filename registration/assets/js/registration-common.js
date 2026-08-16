const REG = {
  cfg: window.NCFD_CONFIG || {},
  db: window.ncfd,
  configured: !!window.NCFD_IS_CONFIGURED,
  registrationLabels: {
    paper_primary_author:'投稿稿件（稿件費包含 1 位作者註冊）',
    paper_additional_author:'同篇稿件第 2 位及後續作者',
    general_attendee:'一般與會者'
  },
  statusLabels: {
    pending_payment:'待付款',
    payment_submitted:'付款證明待審核',
    paid:'已確認付款',
    reupload_required:'付款證明需補件',
    cancelled:'已取消'
  },
  categoryLabels:{
    faculty_researcher:'教師／研究人員',industry:'產業人士',student:'學生',other:'其他'
  },
  el(sel,root=document){return root.querySelector(sel)},
  els(sel,root=document){return [...root.querySelectorAll(sel)]},
  escape(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))},
  money(n){return 'NT$ '+Number(n||0).toLocaleString('zh-TW')},
  date(v){if(!v)return '—';try{return new Intl.DateTimeFormat('zh-TW',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Taipei'}).format(new Date(v))}catch{return v}},
  toast(message,type='success'){
    const box=document.createElement('div');box.className=`notice ${type}`;box.textContent=message;
    const host=document.querySelector('[data-flash]')||document.querySelector('.content .container')||document.body;
    host.prepend(box);setTimeout(()=>box.remove(),7000);
  },
  async session(){if(!this.db)return null;const {data}=await this.db.auth.getSession();return data.session},
  async user(){const s=await this.session();return s?.user||null},
  async roles(){const u=await this.user();if(!u)return[];const {data}=await this.db.from('staff_roles').select('role').eq('user_id',u.id);return(data||[]).map(x=>x.role)},
  async requireAuth(){
    if(!this.configured){document.body.innerHTML='<main class="content"><div class="container"><div class="notice error">尚未連接 Supabase。請先完成投稿系統的 config.js 設定。</div></div></main>';return null}
    const u=await this.user();
    if(!u){location.href='auth.html?next='+encodeURIComponent(location.pathname.split('/').pop()+location.search);return null}
    return u
  },
  async requireStaff(){
    const u=await this.requireAuth();if(!u)return null;
    const roles=await this.roles();
    if(!roles.some(x=>['chair','admin'].includes(x))){
      document.body.innerHTML='<main class="content"><div class="container"><div class="notice error">您沒有會議註冊管理權限。</div><a class="btn btn-blue" href="dashboard.html">返回我的註冊</a></div></main>';
      return null
    }
    return {user:u,roles}
  },
  safeFilename(name){return name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120)},
  async signedProofUrl(path,expires=300){
    const {data,error}=await this.db.storage.from('registration-payment-proofs').createSignedUrl(path,expires);
    if(error)throw error;return data.signedUrl
  },
  statusBadge(s){return `<span class="status status-${this.escape(s)}">${this.escape(this.statusLabels[s]||s)}</span>`},
  async refreshNav(){
    const nav=this.el('[data-reg-nav]');if(!nav)return;
    if(!this.configured){nav.innerHTML='<a class="nav-cta" href="../index.html">會議首頁</a>';return}
    const u=await this.user();
    if(!u){nav.innerHTML='<a href="../submission/auth.html">論文投稿</a><a class="nav-cta" href="auth.html">註冊 / 登入</a>';return}
    const roles=await this.roles();
    let extra=roles.some(x=>['chair','admin'].includes(x))?'<a href="admin.html">註冊管理</a>':'';
    nav.innerHTML=`<a href="../index.html">會議首頁</a><a href="../submission/dashboard.html">我的投稿</a>${extra}<a href="dashboard.html">我的註冊</a><button class="btn btn-sm btn-outline" data-reg-logout>登出</button>`;
    this.el('[data-reg-logout]')?.addEventListener('click',async()=>{await this.db.auth.signOut();location.href='index.html'})
  }
};
window.REG=REG;
document.addEventListener('DOMContentLoaded',()=>REG.refreshNav());
