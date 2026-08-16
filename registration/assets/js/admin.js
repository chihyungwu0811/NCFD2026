document.addEventListener('DOMContentLoaded',async()=>{
  const staff=await REG.requireStaff();if(!staff)return;

  async function load(){
    const [{data:regs,error},{data:settings}]=await Promise.all([
      REG.db.from('registrations').select('*,submissions(submission_number,title_zh,title_en),registration_payments(*)').order('created_at',{ascending:false}),
      REG.db.from('registration_settings').select('*').eq('id',1).maybeSingle()
    ]);
    if(error)return REG.toast('讀取註冊資料失敗：'+error.message,'error');

    const paid=regs.filter(r=>r.status==='paid'),pending=regs.filter(r=>r.status==='payment_submitted'),reup=regs.filter(r=>r.status==='reupload_required');
    REG.el('#stats').innerHTML=[
      ['正式註冊',regs.filter(r=>r.status!=='cancelled').length],
      ['待審核付款',pending.length],
      ['已確認付款',paid.length],
      ['需補件',reup.length]
    ].map(x=>`<div class="stat"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');

    if(settings){
      for(const k of ['bank_name','bank_code','bank_account','bank_account_name','postal_giro_number','postal_giro_name','payment_note']){
        const el=REG.el(`[name=${k}]`);if(el)el.value=settings[k]||''
      }
      REG.el('[name=registrations_enabled]').checked=!!settings.registrations_enabled;
      for(const k of ['registration_open_at','early_bird_deadline','online_registration_deadline']){
        const el=REG.el(`[name=${k}]`);if(el&&settings[k])el.value=new Date(settings[k]).toLocaleString('sv-SE',{timeZone:'Asia/Taipei'}).slice(0,16)
      }
    }

    window._regs=regs;
    render(regs)
  }

  function render(regs){
    const q=(REG.el('#search').value||'').toLowerCase();
    const status=REG.el('#status-filter').value;
    regs=regs.filter(r=>{
      const hay=[r.registration_number,r.name_zh,r.email,r.affiliation,r.submissions?.submission_number].join(' ').toLowerCase();
      return(!q||hay.includes(q))&&(!status||r.status===status)
    });
    REG.el('#rows').innerHTML=regs.map(r=>{
      const p=(r.registration_payments||[])[0];
      const proof=p?`<button class="btn btn-outline btn-sm" data-proof="${REG.escape(p.proof_path)}">查看證明</button>`:'—';
      const review=p&&r.status!=='paid'?`<button class="btn btn-blue btn-sm" data-paid="${r.id}">確認付款</button><button class="btn btn-danger btn-sm" data-reupload="${r.id}">要求補件</button>`:'';
      return `<tr>
        <td>${REG.escape(r.registration_number)}</td>
        <td><strong>${REG.escape(r.name_zh)}</strong><br><span class="small muted">${REG.escape(r.email)}</span></td>
        <td>${REG.escape(REG.registrationLabels[r.registration_type])}<br><span class="small">${REG.escape(r.submissions?.submission_number||'')}</span></td>
        <td>${REG.money(r.amount_due)}</td>
        <td>${REG.statusBadge(r.status)}</td>
        <td>${proof}${p?`<div class="small muted">${REG.escape(p.payment_method)}｜${REG.escape(p.payment_date||'')}</div>`:''}</td>
        <td><div class="actions">${review}</div></td>
      </tr>`
    }).join('')||'<tr><td colspan="7" class="muted">沒有符合的資料。</td></tr>';

    REG.els('[data-proof]').forEach(b=>b.addEventListener('click',async()=>{
      try{window.open(await REG.signedProofUrl(b.dataset.proof),'_blank','noopener')}catch(e){REG.toast('無法開啟付款證明：'+e.message,'error')}
    }));
    REG.els('[data-paid]').forEach(b=>b.addEventListener('click',()=>review(b.dataset.paid,'paid')));
    REG.els('[data-reupload]').forEach(b=>b.addEventListener('click',()=>review(b.dataset.reupload,'reupload_required')))
  }

  async function review(id,decision){
    let note='';
    if(decision==='reupload_required')note=prompt('請輸入補件原因：','圖片不清楚，請重新上傳付款證明。')||'請重新上傳付款證明。';
    if(decision==='paid'&&!confirm('確認此筆款項已核對入帳？'))return;
    const {error}=await REG.db.rpc('review_registration_payment',{p_registration_id:id,p_decision:decision,p_review_note:note});
    if(error)return REG.toast('審核失敗：'+error.message,'error');REG.toast('付款狀態已更新。','success');await load()
  }

  REG.el('#search').addEventListener('input',()=>render(window._regs||[]));
  REG.el('#status-filter').addEventListener('change',()=>render(window._regs||[]));

  REG.el('#settings-form').addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const payload={
      registrations_enabled:!!fd.get('registrations_enabled'),
      registration_open_at:new Date(fd.get('registration_open_at')+':00+08:00').toISOString(),
      early_bird_deadline:new Date(fd.get('early_bird_deadline')+':00+08:00').toISOString(),
      online_registration_deadline:new Date(fd.get('online_registration_deadline')+':00+08:00').toISOString(),
      bank_name:fd.get('bank_name').trim(),bank_code:fd.get('bank_code').trim(),
      bank_account:fd.get('bank_account').trim(),bank_account_name:fd.get('bank_account_name').trim(),
      postal_giro_number:fd.get('postal_giro_number').trim(),postal_giro_name:fd.get('postal_giro_name').trim(),
      payment_note:fd.get('payment_note').trim()
    };
    const {error}=await REG.db.from('registration_settings').update(payload).eq('id',1);
    if(error)return REG.toast('儲存設定失敗：'+error.message,'error');REG.toast('註冊與付款設定已儲存。','success')
  });

  REG.el('#export-csv').addEventListener('click',()=>{
    const rows=window._regs||[];
    const cols=['registration_number','name_zh','email','affiliation','registration_type','amount_due','status','companion_count'];
    const lines=[cols.join(',')].concat(rows.map(r=>cols.map(c=>`"${String(r[c]??'').replaceAll('"','""')}"`).join(',')));
    const blob=new Blob(["\uFEFF"+lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='NCFD2026_registrations.csv';a.click();URL.revokeObjectURL(a.href)
  });

  await load()
});
