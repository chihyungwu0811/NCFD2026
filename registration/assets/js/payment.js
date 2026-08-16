document.addEventListener('DOMContentLoaded',async()=>{
  const u=await REG.requireAuth();if(!u)return;
  const id=new URLSearchParams(location.search).get('id');if(!id){REG.toast('缺少註冊編號。','error');return}
  const [{data:r,error},{data:settings}]=await Promise.all([
    REG.db.from('registrations').select('*,registration_payments(*)').eq('id',id).eq('user_id',u.id).maybeSingle(),
    REG.db.from('registration_settings').select('*').eq('id',1).maybeSingle()
  ]);
  if(error||!r)return REG.toast('找不到您的註冊資料。','error');

  REG.el('#reg-summary').innerHTML=`<strong>${REG.escape(r.registration_number)}</strong><br>${REG.escape(r.name_zh)}｜${REG.escape(REG.registrationLabels[r.registration_type])}<br><span class="amount">${REG.money(r.amount_due)}</span><br>${REG.escape(r.fee_label)}`;

  const info=[];
  if(settings?.bank_name||settings?.bank_account){
    info.push(`<strong>銀行匯款</strong><br>銀行：${REG.escape(settings.bank_name||'尚未設定')} ${REG.escape(settings.bank_code||'')}<br>帳號：<code>${REG.escape(settings.bank_account||'尚未設定')}</code><br>戶名：${REG.escape(settings.bank_account_name||'尚未設定')}`)
  }
  if(settings?.postal_giro_number||settings?.postal_giro_name){
    info.push(`<strong>郵政劃撥</strong><br>劃撥帳號：<code>${REG.escape(settings.postal_giro_number||'尚未設定')}</code><br>戶名：${REG.escape(settings.postal_giro_name||'尚未設定')}`)
  }
  if(!info.length) info.push('<strong>主辦單位尚未在系統填入匯款／郵政劃撥帳號。</strong><br>請先聯絡 NCFD2026@proton.me 確認付款資訊。');
  REG.el('#payment-instructions').innerHTML=info.join('<hr>')+(settings?.payment_note?`<hr>${REG.escape(settings.payment_note)}`:'');

  const pay=(r.registration_payments||[])[0];
  if(pay){
    REG.el('[name=payment_method]').value=pay.payment_method;
    REG.el('[name=payment_date]').value=pay.payment_date||'';
    REG.el('[name=reference_last5]').value=pay.reference_last5||'';
    REG.el('#current-proof').textContent=`目前檔案：${pay.proof_original_name||'已上傳'}｜狀態：${pay.status}${pay.review_note?'｜審核意見：'+pay.review_note:''}`
  }

  REG.el('#payment-form').addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget),file=fd.get('proof');
    if(!(file instanceof File)||!file.size)return REG.toast('請選擇付款證明照片或 PDF。','error');
    const allowed=['image/jpeg','image/png','application/pdf'];
    if(!allowed.includes(file.type))return REG.toast('僅接受 JPG、PNG 或 PDF。','error');
    if(file.size>10*1024*1024)return REG.toast('付款證明檔案不可超過 10 MB。','error');

    const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
    const path=`${u.id}/${r.id}/${Date.now()}_${REG.safeFilename(file.name)}`;
    const {error:upErr}=await REG.db.storage.from('registration-payment-proofs').upload(path,file,{contentType:file.type,upsert:false});
    if(upErr){btn.disabled=false;return REG.toast('上傳檔案失敗：'+upErr.message,'error')}

    const {error:rpcErr}=await REG.db.rpc('submit_registration_payment',{
      p_registration_id:r.id,p_payment_method:fd.get('payment_method'),
      p_payment_date:fd.get('payment_date'),p_reference_last5:fd.get('reference_last5').trim(),
      p_proof_path:path,p_proof_original_name:file.name,p_proof_mime_type:file.type
    });
    btn.disabled=false;
    if(rpcErr)return REG.toast('登記付款證明失敗：'+rpcErr.message,'error');
    REG.toast('付款證明已上傳，請等待主辦單位人工審核。','success');
    setTimeout(()=>location.href='dashboard.html',800)
  })
});
