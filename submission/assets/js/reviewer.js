document.addEventListener('DOMContentLoaded', async()=>{
  const gate=await NCFD.requireRole(['reviewer','admin','chair']); if(!gate) return;
  const host=NCFD.el('#review-list');
  async function load(){
    const {data,error}=await NCFD.db.from('review_assignments')
      .select('id,submission_id,assigned_at,submissions(id,submission_number,title_zh,title_en,abstract_zh,abstract_en,keywords,status,topic_id,current_file_id,topics(name_zh),submission_authors(*),submission_files!submissions_current_file_id_fkey(path,original_name)),reviews(*)')
      .eq('reviewer_id',gate.user.id).order('assigned_at',{ascending:false});
    if(error){ host.innerHTML=`<div class="notice error">${NCFD.escape(error.message)}</div>`; return; }
    if(!data?.length){ host.innerHTML='<div class="panel empty">目前沒有指派給您的稿件。</div>'; return; }
    host.innerHTML='';
    for(const a of data){
      const s=a.submissions, r=(a.reviews||[])[0]||{};
      const authors=(s.submission_authors||[]).sort((x,y)=>x.sort_order-y.sort_order).map(x=>`${x.name_zh||x.name_en}（${x.affiliation}）`).join('、');
      const card=document.createElement('article'); card.className='review-card';
      card.innerHTML=`
        <h3>${NCFD.escape(s.submission_number)}｜${NCFD.escape(s.title_zh||s.title_en)}</h3>
        <div class="review-meta"><span>${NCFD.escape(s.topics?.name_zh||'未分類')}</span><span>${NCFD.statusBadge(s.status)}</span><span>作者：${NCFD.escape(authors||'—')}</span></div>
        <p><strong>中文摘要</strong><br>${NCFD.escape(s.abstract_zh||'—')}</p>
        ${s.abstract_en?`<p><strong>English Abstract</strong><br>${NCFD.escape(s.abstract_en)}</p>`:''}
        <div class="inline"><button type="button" class="btn btn-sm btn-outline" data-pdf>下載 PDF</button></div>
        <hr style="border:0;border-top:1px solid #e3edf5;margin:18px 0">
        <form data-review-form>
          <div class="score-grid">
            ${['originality','technical_quality','relevance','presentation_quality'].map((key,i)=>`<div class="field"><label>${['原創性','技術品質','主題相關性','表達品質'][i]}（1–5）</label><select name="${key}" required><option value="">請選擇</option>${[1,2,3,4,5].map(v=>`<option value="${v}" ${Number(r[key])===v?'selected':''}>${v}</option>`).join('')}</select></div>`).join('')}
          </div>
          <div class="field" style="margin-top:12px"><label>建議</label><select name="recommendation" required><option value="">請選擇</option><option value="accept" ${r.recommendation==='accept'?'selected':''}>建議錄取</option><option value="minor_revision" ${r.recommendation==='minor_revision'?'selected':''}>建議修正</option><option value="reject" ${r.recommendation==='reject'?'selected':''}>建議不錄取</option></select></div>
          <div class="field" style="margin-top:12px"><label>給作者的意見</label><textarea name="comments_to_author">${NCFD.escape(r.comments_to_author||'')}</textarea></div>
          <div class="field" style="margin-top:12px"><label>僅供籌備委員會參考</label><textarea name="comments_confidential">${NCFD.escape(r.comments_confidential||'')}</textarea></div>
          <div class="form-actions"><button class="btn btn-blue" type="submit">${r.id?'更新審查':'提交審查'}</button></div>
        </form>`;
      host.appendChild(card);
      card.querySelector('[data-pdf]').addEventListener('click',async()=>{
        const path=s.submission_files?.path; if(!path) return NCFD.toast('此稿件尚無 PDF。','warn');
        try{window.open(await NCFD.signedFileUrl(path),'_blank','noopener')}catch(e){NCFD.toast('PDF 開啟失敗：'+e.message,'error')}
      });
      card.querySelector('[data-review-form]').addEventListener('submit',async e=>{
        e.preventDefault(); const fd=new FormData(e.currentTarget); const payload={
          assignment_id:a.id, reviewer_id:gate.user.id,
          originality:Number(fd.get('originality')),technical_quality:Number(fd.get('technical_quality')),
          relevance:Number(fd.get('relevance')),presentation_quality:Number(fd.get('presentation_quality')),
          recommendation:fd.get('recommendation'),comments_to_author:fd.get('comments_to_author').trim(),comments_confidential:fd.get('comments_confidential').trim(),submitted_at:new Date().toISOString()
        };
        let res=r.id?await NCFD.db.from('reviews').update(payload).eq('id',r.id):await NCFD.db.from('reviews').insert(payload);
        if(res.error) return NCFD.toast('審查儲存失敗：'+res.error.message,'error');
        NCFD.toast('審查意見已儲存。','success'); load();
      });
    }
  }
  load();
});
