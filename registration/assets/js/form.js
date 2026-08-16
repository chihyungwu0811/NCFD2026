document.addEventListener('DOMContentLoaded',async()=>{
  const u=await REG.requireAuth();if(!u)return;
  const {data:existing}=await REG.db.from('registrations').select('id,registration_number,status').eq('user_id',u.id).neq('status','cancelled').maybeSingle();
  if(existing){REG.el('#registration-form').classList.add('hidden');REG.el('#already').classList.remove('hidden');REG.el('#already').innerHTML=`您已有有效註冊 <strong>${REG.escape(existing.registration_number)}</strong>。<a href="dashboard.html">返回我的註冊</a>`;return}

  const {data:profile}=await REG.db.from('profiles').select('*').eq('id',u.id).maybeSingle();
  if(profile){
    for(const k of ['full_name_zh','full_name_en','affiliation','job_title','phone']){
      const el=REG.el(`[name="${k==='full_name_zh'?'name_zh':k==='full_name_en'?'name_en':k}"]`);
      if(el)el.value=profile[k]||''
    }
  }
  REG.el('[name=email]').value=u.email||'';

  const type=REG.el('[name=registration_type]');
  const subWrap=REG.el('#submission-wrap'),quoteBox=REG.el('#fee-quote');

  async function quote(){
    const t=type.value;
    subWrap.classList.toggle('hidden',t==='general_attendee');
    if(!t){quoteBox.innerHTML='請先選擇參加身份。';return}
    const sn=REG.el('[name=submission_number]').value.trim();
    if(t!=='general_attendee'&&!sn){quoteBox.innerHTML='請輸入 Submission ID 後查看應繳金額。';return}
    const {data,error}=await REG.db.rpc('registration_fee_quote',{p_registration_type:t,p_submission_number:sn||null});
    if(error){quoteBox.innerHTML=`<span style="color:#a7333d">${REG.escape(error.message)}</span>`;return}
    if(t==='paper_primary_author'&&data.primary_slot_used){
      quoteBox.innerHTML='<span style="color:#a7333d"><strong>此稿件已使用包含的 1 位作者註冊資格。</strong> 請改選「同篇稿件第 2 位及後續作者」。</span>';return
    }
    quoteBox.innerHTML=`<strong>${REG.escape(data.label)}</strong><div class="amount">${REG.money(data.amount)}</div>${data.submission_title?`<div>稿件：${REG.escape(data.submission_title)}</div>`:''}${!data.open?'<div style="color:#9b6200">目前不在正式開放註冊時段；管理員可於測試期間調整開放時間。</div>':''}`
  }
  type.addEventListener('change',quote);REG.el('[name=submission_number]').addEventListener('blur',quote);await quote();

  REG.el('#registration-form').addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    if(!fd.get('attend_day1')&&!fd.get('attend_day2'))return REG.toast('請至少選擇一天參加會議。','error');
    const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
    const args={
      p_registration_type:fd.get('registration_type'),
      p_submission_number:fd.get('submission_number')?.trim()||null,
      p_name_zh:fd.get('name_zh').trim(),p_name_en:fd.get('name_en').trim(),
      p_affiliation:fd.get('affiliation').trim(),p_job_title:fd.get('job_title').trim(),
      p_phone:fd.get('phone').trim(),p_participant_category:fd.get('participant_category'),
      p_attend_day1:!!fd.get('attend_day1'),p_attend_day2:!!fd.get('attend_day2'),
      p_dietary_requirement:fd.get('dietary_requirement').trim(),
      p_companion_count:Number(fd.get('companion_count')||0),
      p_receipt_title:fd.get('receipt_title').trim(),p_tax_id:fd.get('tax_id').trim()
    };
    const {data,error}=await REG.db.rpc('create_conference_registration',args);btn.disabled=false;
    if(error)return REG.toast('建立註冊失敗：'+error.message,'error');
    REG.toast(`註冊成功：${data.registration_number}`,'success');
    setTimeout(()=>location.href='payment.html?id='+encodeURIComponent(data.id),700)
  })
});
