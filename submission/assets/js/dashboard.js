document.addEventListener('DOMContentLoaded', async()=>{
  const user=await NCFD.requireAuth(); if(!user) return;
  const profileForm=NCFD.el('#profile-form');
  async function loadProfile(){
    const {data,error}=await NCFD.db.from('profiles').select('*').eq('id',user.id).single();
    if(error) return NCFD.toast('讀取個人資料失敗：'+error.message,'error');
    for(const k of ['full_name_zh','full_name_en','affiliation','job_title','phone']) if(profileForm.elements[k]) profileForm.elements[k].value=data[k]||'';
    NCFD.el('#profile-email').textContent=data.email||user.email;
  }
  async function loadSubmissions(){
    const {data,error}=await NCFD.db.from('submissions').select('id,submission_number,title_zh,title_en,status,submitted_at,updated_at,current_file_id,topics(name_zh)').order('created_at',{ascending:false});
    if(error) return NCFD.toast('讀取投稿失敗：'+error.message,'error');
    const body=NCFD.el('#submission-body'); body.innerHTML='';
    NCFD.el('#stat-total').textContent=data.length;
    NCFD.el('#stat-submitted').textContent=data.filter(x=>!['draft','withdrawn'].includes(x.status)).length;
    NCFD.el('#stat-accepted').textContent=data.filter(x=>['accepted','final_submitted'].includes(x.status)).length;
    NCFD.el('#stat-draft').textContent=data.filter(x=>x.status==='draft').length;
    if(!data.length){ body.innerHTML='<tr><td colspan="6" class="empty">目前尚無投稿。點選「建立新投稿」開始。</td></tr>'; return; }
    for(const s of data){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><strong>${NCFD.escape(s.submission_number||'尚未編號')}</strong></td><td>${NCFD.escape(s.title_zh||s.title_en||'未命名')}</td><td>${NCFD.escape(s.topics?.name_zh||'—')}</td><td>${NCFD.statusBadge(s.status)}</td><td>${NCFD.formatDate(s.updated_at)}</td><td class="inline"><a class="btn btn-sm btn-outline" href="submission.html?id=${encodeURIComponent(s.id)}">查看/修改</a><button class="btn btn-sm btn-outline" data-download="${s.id}">PDF</button>${['draft','submitted','revision'].includes(s.status)?`<button class="btn btn-sm btn-danger" data-withdraw="${s.id}">撤稿</button>`:''}</td>`;
      body.appendChild(tr);
    }
    body.querySelectorAll('[data-download]').forEach(b=>b.addEventListener('click',async()=>{
      const sid=b.dataset.download;
      const {data,error}=await NCFD.db.from('submissions').select('current_file_id,submission_files!submissions_current_file_id_fkey(path,original_name)').eq('id',sid).single();
      if(error||!data?.submission_files?.path) return NCFD.toast('目前沒有可下載的 PDF。','warn');
      try{ window.open(await NCFD.signedFileUrl(data.submission_files.path),'_blank','noopener'); }catch(err){NCFD.toast('下載失敗：'+err.message,'error');}
    }));
    body.querySelectorAll('[data-withdraw]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('確定要撤回這篇投稿嗎？')) return;
      const {error}=await NCFD.db.rpc('withdraw_submission',{p_submission_id:b.dataset.withdraw});
      if(error) return NCFD.toast('撤稿失敗：'+error.message,'error');
      NCFD.toast('投稿已撤回。','success'); loadSubmissions();
    }));
  }
  profileForm?.addEventListener('submit',async e=>{
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    const payload={full_name_zh:fd.get('full_name_zh').trim(),full_name_en:fd.get('full_name_en').trim(),affiliation:fd.get('affiliation').trim(),job_title:fd.get('job_title').trim(),phone:fd.get('phone').trim()};
    const {error}=await NCFD.db.from('profiles').update(payload).eq('id',user.id);
    if(error) return NCFD.toast('更新失敗：'+error.message,'error'); NCFD.toast('個人資料已更新。','success');
  });
  await loadProfile(); await loadSubmissions();
});
