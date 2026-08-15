document.addEventListener('DOMContentLoaded', async()=>{
  if(!NCFD.configured){ NCFD.showConfigRequired(); return; }
  NCFD.el('#password-form')?.addEventListener('submit',async e=>{
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    if(fd.get('password')!==fd.get('password2')) return NCFD.toast('兩次輸入的密碼不一致。','error');
    const {error}=await NCFD.db.auth.updateUser({password:fd.get('password')});
    if(error) return NCFD.toast('更新密碼失敗：'+error.message,'error');
    NCFD.toast('密碼已更新，正在前往投稿者首頁。','success');
    setTimeout(()=>location.href='dashboard.html',900);
  });
});
