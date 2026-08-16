document.addEventListener('DOMContentLoaded',async()=>{
  if(!REG.configured){REG.toast('尚未連接 Supabase，請先完成 submission/assets/js/config.js。','error');return}
  const next=new URLSearchParams(location.search).get('next')||'dashboard.html';
  const existing=await REG.user();if(existing){location.href=next;return}

  const loginTab=REG.el('#login-tab'),signupTab=REG.el('#signup-tab');
  const loginPanel=REG.el('#login-panel'),signupPanel=REG.el('#signup-panel');
  function tab(which){
    const login=which==='login';
    loginTab.classList.toggle('active',login);signupTab.classList.toggle('active',!login);
    loginPanel.classList.toggle('hidden',!login);signupPanel.classList.toggle('hidden',login)
  }
  loginTab.addEventListener('click',()=>tab('login'));signupTab.addEventListener('click',()=>tab('signup'));

  REG.el('#login-form').addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
    const {error}=await REG.db.auth.signInWithPassword({email:fd.get('email').trim(),password:fd.get('password')});btn.disabled=false;
    if(error)return REG.toast('登入失敗：'+error.message,'error');location.href=next
  });

  REG.el('#signup-form').addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    if(fd.get('password')!==fd.get('password2'))return REG.toast('兩次密碼不一致。','error');
    if(!fd.get('privacy'))return REG.toast('請先同意個資與付款證明使用說明。','error');
    const redirect=new URL('dashboard.html',location.href).href;
    const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
    const {data,error}=await REG.db.auth.signUp({
      email:fd.get('email').trim(),password:fd.get('password'),
      options:{emailRedirectTo:redirect,data:{full_name_zh:fd.get('full_name_zh').trim(),affiliation:fd.get('affiliation').trim()}}
    });btn.disabled=false;
    if(error)return REG.toast('建立帳號失敗：'+error.message,'error');
    if(data.session)location.href='dashboard.html';
    else REG.toast('帳號已建立。請至 Email 完成驗證後再登入。','success')
  });

  REG.el('#forgot').addEventListener('click',async()=>{
    const email=prompt('請輸入註冊 Email：');if(!email)return;
    const redirect=new URL('../submission/reset-password.html',location.href).href;
    const {error}=await REG.db.auth.resetPasswordForEmail(email.trim(),{redirectTo:redirect});
    if(error)return REG.toast('無法寄出重設信：'+error.message,'error');
    REG.toast('若此 Email 已註冊，系統將寄出密碼重設信。','success')
  })
});
