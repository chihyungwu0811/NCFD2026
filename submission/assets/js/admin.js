document.addEventListener('DOMContentLoaded', async()=>{
  const gate=await NCFD.requireRole(['admin','chair']); if(!gate) return;
  const body=NCFD.el('#admin-submission-body'); let rows=[];

  async function loadSettings(){
    const {data,error}=await NCFD.db.from('conference_settings').select('*').eq('id',1).single();
    if(error) return NCFD.toast('讀取設定失敗：'+error.message,'error');
    const f=NCFD.el('#settings-form'); f.elements.submissions_enabled.checked=!!data.submissions_enabled;
    f.elements.submission_open_at.value=data.submission_open_at?new Date(data.submission_open_at).toISOString().slice(0,16):'';
    f.elements.submission_deadline.value=data.submission_deadline?new Date(data.submission_deadline).toISOString().slice(0,16):'';
  }
  NCFD.el('#settings-form').addEventListener('submit',async e=>{
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    const payload={submissions_enabled:e.currentTarget.elements.submissions_enabled.checked,submission_open_at:fd.get('submission_open_at')?new Date(fd.get('submission_open_at')).toISOString():null,submission_deadline:fd.get('submission_deadline')?new Date(fd.get('submission_deadline')).toISOString():null};
    const {error}=await NCFD.db.from('conference_settings').update(payload).eq('id',1);
    if(error)return NCFD.toast('設定更新失敗：'+error.message,'error'); NCFD.toast('投稿時程設定已更新。','success');
  });

  async function loadSubmissions(){
    const {data,error}=await NCFD.db.from('submissions').select('id,submission_number,title_zh,title_en,status,submitted_at,updated_at,topic_id,owner_id,current_file_id,topics(name_zh),profiles!submissions_owner_id_fkey(email,full_name_zh,affiliation),submission_files!submissions_current_file_id_fkey(path,original_name),submission_authors(*)').order('created_at',{ascending:false});
    if(error) return NCFD.toast('讀取投稿失敗：'+error.message,'error'); rows=data||[]; render(rows);
    NCFD.el('#a-total').textContent=rows.length; NCFD.el('#a-submitted').textContent=rows.filter(x=>!['draft','withdrawn'].includes(x.status)).length; NCFD.el('#a-review').textContent=rows.filter(x=>x.status==='under_review').length; NCFD.el('#a-accepted').textContent=rows.filter(x=>['accepted','final_submitted'].includes(x.status)).length;
  }
  function render(data){
    body.innerHTML='';
    if(!data.length){body.innerHTML='<tr><td colspan="7" class="empty">沒有符合條件的投稿。</td></tr>';return;}
    for(const s of data){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><strong>${NCFD.escape(s.submission_number)}</strong><div class="small muted">${NCFD.escape(s.profiles?.email||'')}</div></td><td>${NCFD.escape(s.title_zh||s.title_en||'未命名')}<div class="small muted">${NCFD.escape(s.profiles?.affiliation||'')}</div></td><td>${NCFD.escape(s.topics?.name_zh||'—')}</td><td>${NCFD.statusBadge(s.status)}</td><td>${NCFD.formatDate(s.submitted_at)}</td><td><div class="inline"><button class="btn btn-sm btn-outline" data-pdf>PDF</button><button class="btn btn-sm btn-outline" data-assign>指派審查</button></div></td><td><div class="inline"><select data-decision><option value="">變更狀態</option><option value="under_review">審查中</option><option value="revision">退修</option><option value="accepted">錄取</option><option value="rejected">未錄取</option><option value="final_submitted">最終版已上傳</option></select><button class="btn btn-sm btn-blue" data-apply>套用</button></div></td>`;
      body.appendChild(tr);
      tr.querySelector('[data-pdf]').addEventListener('click',async()=>{const path=s.submission_files?.path;if(!path)return NCFD.toast('此投稿尚無 PDF。','warn');try{window.open(await NCFD.signedFileUrl(path),'_blank','noopener')}catch(e){NCFD.toast(e.message,'error')}});
      tr.querySelector('[data-assign]').addEventListener('click',async()=>{
        const email=prompt('請輸入審查委員已註冊的 Email：'); if(!email)return;
        const {data,error}=await NCFD.db.rpc('assign_reviewer_by_email',{p_submission_id:s.id,p_reviewer_email:email.trim()});
        if(error)return NCFD.toast('指派失敗：'+error.message,'error'); NCFD.toast('已指派審查委員：'+data,'success');
      });
      tr.querySelector('[data-apply]').addEventListener('click',async()=>{
        const status=tr.querySelector('[data-decision]').value;if(!status)return;
        if(!confirm(`確定將 ${s.submission_number} 狀態改為「${NCFD.statusLabels[status]||status}」？`))return;
        const {error}=await NCFD.db.rpc('set_submission_status',{p_submission_id:s.id,p_status:status});
        if(error)return NCFD.toast('狀態更新失敗：'+error.message,'error'); NCFD.toast('投稿狀態已更新。','success');loadSubmissions();
      });
    }
  }
  NCFD.el('#filter').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();render(!q?rows:rows.filter(s=>[s.submission_number,s.title_zh,s.title_en,s.profiles?.email,s.profiles?.full_name_zh,s.profiles?.affiliation,s.topics?.name_zh].some(v=>String(v||'').toLowerCase().includes(q))));});
  NCFD.el('#export-csv').addEventListener('click',()=>{
    const cols=['投稿編號','中文題目','英文題目','領域','狀態','投稿者Email','投稿者姓名','單位','提交時間'];
    const values=rows.map(s=>[s.submission_number,s.title_zh,s.title_en,s.topics?.name_zh,s.status,s.profiles?.email,s.profiles?.full_name_zh,s.profiles?.affiliation,s.submitted_at]);
    const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"'; const csv='\ufeff'+[cols,...values].map(r=>r.map(esc).join(',')).join('\r\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='NCFD2026_submissions.csv';a.click();URL.revokeObjectURL(a.href);
  });
  await loadSettings(); await loadSubmissions();
});
