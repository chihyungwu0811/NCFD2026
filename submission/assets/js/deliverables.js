document.addEventListener('DOMContentLoaded',async()=>{
  const user=await NCFD.requireAuth(); if(!user)return;
  const sid=new URLSearchParams(location.search).get('id');
  if(!sid){NCFD.toast('缺少稿件識別碼。','error');return}
  let submission=null, files=[];

  async function signed(path){
    const {data,error}=await NCFD.db.storage.from('submission-deliverables').createSignedUrl(path,300);
    if(error)throw error; return data.signedUrl;
  }
  async function load(){
    const {data:s,error}=await NCFD.db.from('submissions')
      .select('id,submission_number,title_zh,title_en,status,owner_id')
      .eq('id',sid).eq('owner_id',user.id).single();
    if(error||!s){NCFD.toast('找不到您的稿件。','error');disableAll();return}
    submission=s;
    NCFD.el('#submission-summary').innerHTML=`<strong>${NCFD.escape(s.submission_number||'')}</strong>　${NCFD.escape(s.title_zh||s.title_en||'')}　${NCFD.statusBadge(s.status)}`;
    const eligible=['accepted','final_submitted'].includes(s.status);
    NCFD.el('#eligibility-note').className='notice '+(eligible?'success':'warn');
    NCFD.el('#eligibility-note').textContent=eligible?'此稿件已錄取，可上傳或更新海報與授權書。':'目前稿件尚未進入可上傳海報／授權書的狀態。錄取後此功能會開放。';
    if(!eligible)disableAll();
    const {data:f,error:ferr}=await NCFD.db.from('submission_deliverable_files').select('*').eq('submission_id',sid);
    if(ferr)return NCFD.toast('讀取最終文件失敗：'+ferr.message,'error');
    files=f||[]; render();
  }
  function disableAll(){
    ['poster-file','authorization-file','poster-upload','authorization-upload'].forEach(id=>{const e=NCFD.el('#'+id);if(e)e.disabled=true});
  }
  function renderOne(kind,hostId){
    const f=files.find(x=>x.file_kind===kind), host=NCFD.el('#'+hostId);
    if(!f){host.textContent='尚未上傳';return}
    host.innerHTML=`目前檔案：<strong>${NCFD.escape(f.original_name)}</strong>　${NCFD.formatDate(f.uploaded_at)} <button type="button" class="btn btn-sm btn-outline" data-open="${NCFD.escape(f.path)}">下載</button>`;
  }
  function render(){
    renderOne('poster','poster-current'); renderOne('authorization','authorization-current');
    const complete=['poster','authorization'].every(k=>files.some(x=>x.file_kind===k));
    const note=NCFD.el('#complete-note');
    note.className='notice '+(complete?'success':'warn');
    note.innerHTML=complete?'<strong>兩項文件均已完成上傳。</strong> 主辦單位可在投稿管理後台下載查核。':'海報與授權書兩項皆須完成上傳。';
    NCFD.els('[data-open]').forEach(b=>b.addEventListener('click',async()=>{try{window.open(await signed(b.dataset.open),'_blank','noopener')}catch(e){NCFD.toast('下載失敗：'+e.message,'error')}}));
  }
  async function upload(kind,inputId){
    if(!submission||!['accepted','final_submitted'].includes(submission.status))return;
    const input=NCFD.el('#'+inputId), f=input.files[0]; if(!f)return NCFD.toast('請先選擇檔案。','warn');
    const posterTypes=['application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    const authTypes=['application/pdf','image/jpeg','image/png'];
    const ext=f.name.toLowerCase().split('.').pop();
    const valid=kind==='poster'?(posterTypes.includes(f.type)||['ppt','pptx','pdf'].includes(ext)):(authTypes.includes(f.type)||['pdf','jpg','jpeg','png'].includes(ext));
    if(!valid)return NCFD.toast(kind==='poster'?'海報僅接受 PPT、PPTX 或 PDF。':'授權書僅接受 PDF、JPG 或 PNG。','error');
    const max=kind==='poster'?50*1024*1024:10*1024*1024;
    if(f.size>max)return NCFD.toast(`檔案不可超過 ${Math.round(max/1024/1024)} MB。`,'error');
    const path=`${user.id}/${sid}/${kind}/${Date.now()}_${NCFD.safeFilename(f.name)}`;
    const button=NCFD.el('#'+(kind==='poster'?'poster-upload':'authorization-upload')); button.disabled=true;
    try{
      const {error:upErr}=await NCFD.db.storage.from('submission-deliverables').upload(path,f,{contentType:f.type||undefined,upsert:false});
      if(upErr)throw upErr;
      const {error:rpcErr}=await NCFD.db.rpc('register_submission_deliverable',{
        p_submission_id:sid,p_file_kind:kind,p_path:path,p_original_name:f.name,p_size_bytes:f.size,p_mime_type:f.type||''
      });
      if(rpcErr)throw rpcErr;
      NCFD.toast(kind==='poster'?'海報檔案已上傳。':'授權書已上傳。','success'); input.value=''; await load();
    }catch(e){NCFD.toast('上傳失敗：'+e.message,'error')}
    finally{button.disabled=false}
  }
  NCFD.el('#poster-upload').addEventListener('click',()=>upload('poster','poster-file'));
  NCFD.el('#authorization-upload').addEventListener('click',()=>upload('authorization','authorization-file'));
  await load();
});