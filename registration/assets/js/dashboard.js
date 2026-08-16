document.addEventListener('DOMContentLoaded',async()=>{
  const u=await REG.requireAuth();if(!u)return;
  const {data:regs,error}=await REG.db.from('registrations')
    .select('*,submissions(submission_number,title_zh,title_en),registration_payments(*)')
    .eq('user_id',u.id).order('created_at',{ascending:false});
  if(error)return REG.toast('讀取註冊資料失敗：'+error.message,'error');

  const host=REG.el('#registration-list');
  if(!regs?.length){
    host.innerHTML='<div class="panel"><h2>尚未建立會議註冊</h2><p class="muted">投稿系統與會議註冊系統共用同一組帳號；若您已投稿，不需要重新建立帳號。</p><a class="btn btn-primary" href="form.html">🎫 開始會議註冊</a></div>';
    return
  }
  host.innerHTML=regs.map(r=>{
    const pay=(r.registration_payments||[])[0];
    const sub=r.submissions?`<div><strong>稿件：</strong>${REG.escape(r.submissions.submission_number||'')} ${REG.escape(r.submissions.title_zh||r.submissions.title_en||'')}</div>`:'';
    let actions='';
    if(r.status!=='paid'&&r.status!=='cancelled')actions+=`<a class="btn btn-blue btn-sm" href="payment.html?id=${encodeURIComponent(r.id)}">${pay?'重新上傳付款證明':'上傳付款證明'}</a>`;
    return `<div class="panel" style="margin-bottom:18px">
      <div class="inline" style="justify-content:space-between"><h2 style="margin:0">${REG.escape(r.registration_number)}</h2>${REG.statusBadge(r.status)}</div>
      <p><strong>${REG.escape(r.name_zh)}</strong>｜${REG.escape(REG.registrationLabels[r.registration_type]||r.registration_type)}</p>
      ${sub}
      <div><strong>應繳金額：</strong> <span style="font-size:1.25rem;font-weight:900;color:#145ba8">${REG.money(r.amount_due)}</span></div>
      <div><strong>計費說明：</strong>${REG.escape(r.fee_label)}</div>
      <div><strong>同行親友：</strong>${r.companion_count} 人（不收費、不列正式註冊名單）</div>
      ${pay?`<div><strong>付款證明：</strong>${REG.escape(pay.proof_original_name||'已上傳')}｜${REG.escape(pay.status)}</div>`:''}
      <div class="actions" style="margin-top:15px">${actions}</div>
    </div>`
  }).join('')
});
