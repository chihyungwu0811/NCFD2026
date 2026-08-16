document.addEventListener('DOMContentLoaded',async()=>{
  const staff=await REG.requireStaff();if(!staff)return;

  const toLocalInput=(value)=>{
    if(!value)return '';
    try{
      // sv-SE gives YYYY-MM-DD HH:mm:ss; datetime-local requires a literal "T".
      return new Date(value).toLocaleString('sv-SE',{
        timeZone:'Asia/Taipei',hour12:false
      }).replace(' ','T').slice(0,16);
    }catch{return ''}
  };

  async function load(){
    const [regRes,setRes]=await Promise.all([
      REG.db.from('registrations')
        .select('*,submissions(submission_number,title_zh,title_en),registration_payments(*)')
        .order('created_at',{ascending:false}),
      REG.db.from('registration_settings').select('*').eq('id',1).maybeSingle()
    ]);

    if(regRes.error)return REG.toast('讀取註冊資料失敗：'+regRes.error.message,'error');
    if(setRes.error)REG.toast('讀取註冊設定失敗：'+setRes.error.message,'error');

    const regs=regRes.data||[];
    const settings=setRes.data||null;

    const active=regs.filter(r=>r.status!=='cancelled');
    const waitingUpload=active.filter(r=>r.status==='pending_payment');
    const pending=active.filter(r=>r.status==='payment_submitted');
    const paid=active.filter(r=>r.status==='paid');
    const reup=active.filter(r=>r.status==='reupload_required');

    REG.el('#stats').innerHTML=[
      ['註冊申請',active.length],
      ['待上傳付款',waitingUpload.length],
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
        const el=REG.el(`[name=${k}]`);if(el)el.value=toLocalInput(settings[k])
      }
    }

    window._regs=regs;
    render(regs)
  }

  function render(regs){
    const q=(REG.el('#search').value||'').trim().toLowerCase();
    const status=REG.el('#status-filter').value;

    regs=regs.filter(r=>{
      const p=(r.registration_payments||[])[0];
      const hay=[
        r.registration_number,r.name_zh,r.email,r.affiliation,
        r.submissions?.submission_number,r.submissions?.title_zh,r.submissions?.title_en,
        p?.reference_last5,p?.proof_original_name
      ].join(' ').toLowerCase();
      return(!q||hay.includes(q))&&(!status||r.status===status)
    });

    REG.el('#rows').innerHTML=regs.map(r=>{
      const p=(r.registration_payments||[])[0];

      const proof=p
        ? `<button class="btn btn-outline btn-sm" data-proof="${REG.escape(p.proof_path)}">查看證明</button>`
        : '—';

      // 補件中的舊證明不可直接按「確認付款」；等使用者重新上傳後，
      // status 會回到 payment_submitted，才重新出現審核按鈕。
      const review=(p&&r.status==='payment_submitted')
        ? `<button class="btn btn-blue btn-sm" data-paid="${r.id}">確認付款</button>
           <button class="btn btn-danger btn-sm" data-reupload="${r.id}">要求補件</button>`
        : '';

      const paymentInfo=p
        ? `<div class="small muted">
             ${REG.escape(REG.paymentMethodLabels[p.payment_method]||p.payment_method)}
             ｜付款日 ${REG.escape(p.payment_date||'—')}
             ${p.reference_last5?`｜末碼/識別 ${REG.escape(p.reference_last5)}`:''}
           </div>
           ${p.review_note?`<div class="small" style="color:#9b6200">審核註記：${REG.escape(p.review_note)}</div>`:''}`
        : '';

      const receipt=[
        r.receipt_title?`抬頭：${REG.escape(r.receipt_title)}`:'',
        r.tax_id?`統編：${REG.escape(r.tax_id)}`:''
      ].filter(Boolean).join('｜');

      return `<tr>
        <td>${REG.escape(r.registration_number)}
          <div class="small muted">${REG.date(r.created_at)}</div>
        </td>
        <td><strong>${REG.escape(r.name_zh)}</strong>
          <br><span class="small muted">${REG.escape(r.email)}</span>
          <br><span class="small muted">${REG.escape(r.affiliation)}</span>
        </td>
        <td>${REG.escape(REG.registrationLabels[r.registration_type]||r.registration_type)}
          <br><span class="small">${REG.escape(r.submissions?.submission_number||'')}</span>
        </td>
        <td>${REG.money(r.amount_due)}
          ${receipt?`<div class="small muted">${receipt}</div>`:''}
        </td>
        <td>${REG.statusBadge(r.status)}
          <div class="small muted">同行 ${Number(r.companion_count||0)} 人</div>
        </td>
        <td>${proof}${paymentInfo}</td>
        <td><div class="actions">${review}</div></td>
      </tr>`
    }).join('')||'<tr><td colspan="7" class="muted">沒有符合的資料。</td></tr>';

    REG.els('[data-proof]').forEach(b=>b.addEventListener('click',async()=>{
      try{
        const url=await REG.signedProofUrl(b.dataset.proof);
        const win=window.open(url,'_blank','noopener');
        if(!win)REG.toast('瀏覽器阻擋了新視窗，請允許彈出視窗後再試。','warn')
      }catch(e){REG.toast('無法開啟付款證明：'+e.message,'error')}
    }));
    REG.els('[data-paid]').forEach(b=>b.addEventListener('click',()=>review(b.dataset.paid,'paid')));
    REG.els('[data-reupload]').forEach(b=>b.addEventListener('click',()=>review(b.dataset.reupload,'reupload_required')))
  }

  async function review(id,decision){
    let note='';
    if(decision==='reupload_required'){
      note=prompt('請輸入補件原因：','圖片不清楚，請重新上傳付款證明。');
      if(note===null)return;
      note=note.trim()||'請重新上傳付款證明。'
    }
    if(decision==='paid'&&!confirm('確認此筆款項已核對入帳？'))return;

    const {error}=await REG.db.rpc('review_registration_payment',{
      p_registration_id:id,p_decision:decision,p_review_note:note
    });
    if(error)return REG.toast('審核失敗：'+error.message,'error');
    REG.toast('付款狀態已更新。','success');
    await load()
  }

  REG.el('#search').addEventListener('input',()=>render(window._regs||[]));
  REG.el('#status-filter').addEventListener('change',()=>render(window._regs||[]));

  REG.el('#settings-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);

    const requiredTimes=['registration_open_at','early_bird_deadline','online_registration_deadline'];
    if(requiredTimes.some(k=>!fd.get(k))){
      return REG.toast('請完整填寫開放時間、早鳥截止與一般報名截止。','error')
    }

    const payload={
      registrations_enabled:!!fd.get('registrations_enabled'),
      registration_open_at:new Date(fd.get('registration_open_at')+':00+08:00').toISOString(),
      early_bird_deadline:new Date(fd.get('early_bird_deadline')+':00+08:00').toISOString(),
      online_registration_deadline:new Date(fd.get('online_registration_deadline')+':00+08:00').toISOString(),
      bank_name:fd.get('bank_name').trim(),
      bank_code:fd.get('bank_code').trim(),
      bank_account:fd.get('bank_account').trim(),
      bank_account_name:fd.get('bank_account_name').trim(),
      postal_giro_number:fd.get('postal_giro_number').trim(),
      postal_giro_name:fd.get('postal_giro_name').trim(),
      payment_note:fd.get('payment_note').trim()
    };

    const btn=e.currentTarget.querySelector('button[type=submit]');
    if(btn)btn.disabled=true;
    const {error}=await REG.db.from('registration_settings').update(payload).eq('id',1);
    if(btn)btn.disabled=false;

    if(error)return REG.toast('儲存設定失敗：'+error.message,'error');
    REG.toast('註冊與付款設定已儲存。','success');
    await load()
  });

  REG.el('#export-csv').addEventListener('click',()=>{
    const rows=window._regs||[];
    const cols=[
      ['registration_number','註冊編號'],['name_zh','中文姓名'],['email','Email'],
      ['affiliation','服務單位'],['participant_category','身份'],
      ['registration_type','註冊類型'],['submission_number','投稿編號'],
      ['amount_due','應繳金額'],['status','註冊狀態'],
      ['payment_method','付款方式'],['payment_date','付款日期'],
      ['reference_last5','末五碼/識別資訊'],['payment_status','付款審核狀態'],
      ['receipt_title','收據抬頭'],['tax_id','統一編號'],
      ['attend_day1','12/11'],['attend_day2','12/12'],
      ['dietary_requirement','飲食需求'],['companion_count','同行親友人數'],
      ['created_at','建立時間']
    ];

    const values=rows.map(r=>{
      const p=(r.registration_payments||[])[0]||{};
      const flat={
        ...r,
        submission_number:r.submissions?.submission_number||'',
        payment_method:REG.paymentMethodLabels[p.payment_method]||p.payment_method||'',
        payment_date:p.payment_date||'',
        reference_last5:p.reference_last5||'',
        payment_status:p.status||''
      };
      return cols.map(([key])=>flat[key]??'')
    });

    const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
    const csv='\uFEFF'+[
      cols.map(x=>x[1]),
      ...values
    ].map(row=>row.map(esc).join(',')).join('\r\n');

    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='NCFD2026_registrations.csv';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000)
  });

  await load()
});
