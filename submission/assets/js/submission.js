document.addEventListener('DOMContentLoaded', async()=>{
  const user=await NCFD.requireAuth(); if(!user) return;
  const form=NCFD.el('#submission-form'), authorsHost=NCFD.el('#authors'), fileInput=NCFD.el('#pdf_file');
  const params=new URLSearchParams(location.search); let submissionId=params.get('id'); let record=null; let settings=null;

  function addAuthor(a={}){
    const idx=authorsHost.children.length+1;
    const row=document.createElement('div'); row.className='author-row';
    row.innerHTML=`
      <div><strong>#${idx}</strong></div>
      <div class="field"><label>中文姓名</label><input name="author_name_zh" value="${NCFD.escape(a.name_zh||'')}"></div>
      <div class="field"><label>英文姓名</label><input name="author_name_en" value="${NCFD.escape(a.name_en||'')}"></div>
      <div class="field affiliation"><label>服務單位 *</label><input name="author_affiliation" value="${NCFD.escape(a.affiliation||'')}"></div>
      <div class="remove-wrap"><button type="button" class="btn btn-sm btn-danger" data-remove-author>移除</button></div>
      <div class="checks">
        <label>Email * <input type="email" name="author_email" value="${NCFD.escape(a.email||'')}"></label>
        <label><input type="checkbox" name="author_corresponding" ${a.is_corresponding?'checked':''}> 通訊作者</label>
        <label><input type="checkbox" name="author_presenter" ${a.is_presenter?'checked':''}> 海報報告者</label>
      </div>`;
    row.querySelector('[data-remove-author]').addEventListener('click',()=>{ if(authorsHost.children.length>1) row.remove(); renumber(); });
    authorsHost.appendChild(row);
  }
  function renumber(){ [...authorsHost.children].forEach((r,i)=>{const b=r.querySelector('strong'); if(b)b.textContent='#'+(i+1);}); }
  function collectAuthors(){
    return [...authorsHost.children].map((r,i)=>({
      sort_order:i+1,
      name_zh:r.querySelector('[name=author_name_zh]').value.trim(),
      name_en:r.querySelector('[name=author_name_en]').value.trim(),
      affiliation:r.querySelector('[name=author_affiliation]').value.trim(),
      email:r.querySelector('[name=author_email]').value.trim(),
      is_corresponding:r.querySelector('[name=author_corresponding]').checked,
      is_presenter:r.querySelector('[name=author_presenter]').checked
    })).filter(a=>a.name_zh||a.name_en||a.email||a.affiliation);
  }
  function applyReadOnly(){
    const editable=!record || ['draft','submitted','revision'].includes(record.status);
    if(!editable){
      form.querySelectorAll('input,select,textarea,button').forEach(el=>{ if(!el.matches('[data-back]')) el.disabled=true; });
      NCFD.el('#locked-note').classList.remove('hidden');
    }
  }
  async function loadSettings(){
    const {data}=await NCFD.db.from('conference_settings').select('*').eq('id',1).single(); settings=data;
    if(data){
      NCFD.el('#open-info').textContent = data.submissions_enabled
        ? `投稿開放：${NCFD.formatDate(data.submission_open_at)}；截止：${data.submission_deadline?NCFD.formatDate(data.submission_deadline):'尚未設定'}`
        : '目前暫停接受投稿。';
    }
  }
  async function loadTopics(){
    const {data,error}=await NCFD.db.from('topics').select('*').eq('active',true).order('sort_order');
    if(error) throw error;
    const sel=form.elements.topic_id; sel.innerHTML='<option value="">請選擇</option>'+(data||[]).map(t=>`<option value="${t.id}">${NCFD.escape(t.name_zh)}</option>`).join('');
  }
  async function loadRecord(){
    if(!submissionId) return;
    const {data,error}=await NCFD.db.from('submissions').select('*, submission_authors(*), submission_files!submissions_current_file_id_fkey(path,original_name,version_number)').eq('id',submissionId).single();
    if(error) throw error; record=data;
    for(const k of ['topic_id','title_zh','title_en','abstract_zh','abstract_en']) if(form.elements[k]) form.elements[k].value=data[k]??'';
    form.elements.keywords.value=(data.keywords||[]).join('、');
    NCFD.el('#submission-number').textContent=data.submission_number||'草稿';
    NCFD.el('#submission-status').innerHTML=NCFD.statusBadge(data.status);
    if(data.submission_files?.path) NCFD.el('#current-file').innerHTML=`目前檔案：<strong>${NCFD.escape(data.submission_files.original_name)}</strong>（v${data.submission_files.version_number}） <button type="button" class="btn btn-sm btn-outline" id="download-current">下載</button>`;
    authorsHost.innerHTML=''; (data.submission_authors||[]).sort((a,b)=>a.sort_order-b.sort_order).forEach(addAuthor); if(!authorsHost.children.length)addAuthor();
    NCFD.el('#download-current')?.addEventListener('click',async()=>{try{window.open(await NCFD.signedFileUrl(data.submission_files.path),'_blank','noopener')}catch(e){NCFD.toast(e.message,'error')}});
    applyReadOnly();
  }
  async function prefillAuthor(){
    if(submissionId) return;
    const {data}=await NCFD.db.from('profiles').select('*').eq('id',user.id).single();
    addAuthor({name_zh:data?.full_name_zh||'',name_en:data?.full_name_en||'',affiliation:data?.affiliation||'',email:data?.email||user.email,is_corresponding:true,is_presenter:true});
  }
  async function uploadPdf(sid){
    const f=fileInput.files[0]; if(!f) return null;
    if(f.type!=='application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) throw new Error('投稿檔案僅接受 PDF。');
    const max=settings?.max_pdf_bytes||10485760; if(f.size>max) throw new Error(`PDF 檔案不可超過 ${Math.round(max/1024/1024)} MB。`);
    const path=`${user.id}/${sid}/${Date.now()}_${NCFD.safeFilename(f.name)}`;
    const {error:upErr}=await NCFD.db.storage.from('submission-files').upload(path,f,{contentType:'application/pdf',upsert:false}); if(upErr) throw upErr;
    const {data:meta,error:metaErr}=await NCFD.db.from('submission_files').insert({submission_id:sid,path,original_name:f.name,size_bytes:f.size,mime_type:'application/pdf',uploaded_by:user.id}).select().single();
    if(metaErr) throw metaErr;
    const {error:uErr}=await NCFD.db.from('submissions').update({current_file_id:meta.id}).eq('id',sid); if(uErr) throw uErr;
    return meta;
  }
  async function save(submit=false){
    const fd=new FormData(form); const btns=form.querySelectorAll('button'); btns.forEach(b=>b.disabled=true);
    try{
      const payload={
        topic_id:fd.get('topic_id')?Number(fd.get('topic_id')):null,
        title_zh:fd.get('title_zh').trim(), title_en:fd.get('title_en').trim(),
        abstract_zh:fd.get('abstract_zh').trim(), abstract_en:fd.get('abstract_en').trim(),
        keywords:fd.get('keywords').split(/[、,，;]/).map(x=>x.trim()).filter(Boolean)
      };
      if(!submissionId){
        payload.owner_id=user.id; payload.status='draft';
        const {data,error}=await NCFD.db.from('submissions').insert(payload).select().single(); if(error) throw error;
        submissionId=data.id; record=data; history.replaceState({},'',`submission.html?id=${encodeURIComponent(submissionId)}`);
      }else{
        const {error}=await NCFD.db.from('submissions').update(payload).eq('id',submissionId); if(error) throw error;
      }
      const authors=collectAuthors();
      const {error:delErr}=await NCFD.db.from('submission_authors').delete().eq('submission_id',submissionId); if(delErr) throw delErr;
      if(authors.length){ const {error:aErr}=await NCFD.db.from('submission_authors').insert(authors.map(a=>({...a,submission_id:submissionId}))); if(aErr) throw aErr; }
      if(fileInput.files[0]) await uploadPdf(submissionId);
      if(submit){
        if(!fd.get('declaration')) throw new Error('正式提交前，請勾選投稿聲明。');
        const {data,error}=await NCFD.db.rpc('submit_submission',{p_submission_id:submissionId}); if(error) throw error;
        if(NCFD.cfg.submissionConfirmationEmailEnabled){ try{ await NCFD.db.functions.invoke('send-submission-confirmation',{body:{submission_id:submissionId}}); }catch(_){} }
        NCFD.toast(`正式投稿完成：${data}`,'success'); setTimeout(()=>location.href='dashboard.html',1200); return;
      }
      NCFD.toast('草稿已儲存。','success'); await loadRecord();
    }catch(err){ NCFD.toast('儲存失敗：'+err.message,'error'); }
    finally{btns.forEach(b=>b.disabled=false);}
  }

  NCFD.el('#add-author').addEventListener('click',()=>addAuthor());
  NCFD.el('#save-draft').addEventListener('click',()=>save(false));
  form.addEventListener('submit',e=>{e.preventDefault();save(true);});
  try{ await loadSettings(); await loadTopics(); await (submissionId?loadRecord():prefillAuthor()); }
  catch(err){ NCFD.toast('載入投稿資料失敗：'+err.message,'error'); }
});
