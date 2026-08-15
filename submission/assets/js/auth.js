document.addEventListener('DOMContentLoaded', async () => {
  if(!NCFD.configured){ NCFD.showConfigRequired(); return; }
  const loginTab=NCFD.el('#login-tab'), signupTab=NCFD.el('#signup-tab');
  const loginPanel=NCFD.el('#login-panel'), signupPanel=NCFD.el('#signup-panel');
  function switchTab(which){
    const login=which==='login';
    loginTab.classList.toggle('active',login); signupTab.classList.toggle('active',!login);
    loginPanel.classList.toggle('hidden',!login); signupPanel.classList.toggle('hidden',login);
  }
  loginTab?.addEventListener('click',()=>switchTab('login'));
  signupTab?.addEventListener('click',()=>switchTab('signup'));

  const next=new URLSearchParams(location.search).get('next') || 'dashboard.html';
  const current=await NCFD.user(); if(current){ location.href=next; return; }

  NCFD.el('#login-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const btn=e.currentTarget.querySelector('button[type=submit]'); btn.disabled=true;
    const {error}=await NCFD.db.auth.signInWithPassword({email:fd.get('email').trim(),password:fd.get('password')});
    btn.disabled=false;
    if(error) return NCFD.toast('登入失敗：'+error.message,'error');
    location.href=next;
  });

  NCFD.el('#signup-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    if(fd.get('password')!==fd.get('password2')) return NCFD.toast('兩次輸入的密碼不一致。','error');
    if(!fd.get('privacy')) return NCFD.toast('請先同意個資使用說明。','error');
    const email=fd.get('email').trim();
    const redirect=NCFD.cfg.siteUrl+'dashboard.html';
    const btn=e.currentTarget.querySelector('button[type=submit]'); btn.disabled=true;
    const {data,error}=await NCFD.db.auth.signUp({
      email,password:fd.get('password'),
      options:{emailRedirectTo:redirect,data:{full_name_zh:fd.get('full_name_zh').trim(),affiliation:fd.get('affiliation').trim()}}
    });
    btn.disabled=false;
    if(error) return NCFD.toast('註冊失敗：'+error.message,'error');
    if(data.session) location.href='dashboard.html';
    else NCFD.toast('帳號已建立。請到信箱完成 Email 驗證後再登入。','success');
  });

  NCFD.el('#reset-form')?.addEventListener('submit',async e=>{
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    const {error}=await NCFD.db.auth.resetPasswordForEmail(fd.get('email').trim(),{redirectTo:NCFD.cfg.siteUrl+'reset-password.html'});
    if(error) return NCFD.toast('無法寄出重設信：'+error.message,'error');
    NCFD.toast('若此 Email 已註冊，系統將寄出密碼重設信。','success');
  });
});
