// AMC manual activity log. Records are operator assertions, not delivery receipts.
// No outbound integrations and no automatic consent inference.
const EVENTS=Object.freeze({
  draft_reviewed:'Draft reviewed/approved by administrator',
  manual_attempt_reported:'Operator reports a separate manual contact attempt',
  customer_reply_reported:'Operator records a customer reply'
});
const CHANNELS=new Set(['whatsapp','sms','email','phone','other']);
const LANGUAGES=new Set(['en','ml']);
const trim=value=>String(value??'').trim();
const esc=value=>trim(value).replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

export function validateFollowupActivity({contract,customer,event_type,channel,language,consent_reference,summary}){
  if(!contract||!customer||contract.customer_id!==customer.id)
    return 'A matching real customer and contract are required.';
  if(!Object.hasOwn(EVENTS,event_type)||!CHANNELS.has(channel)||!LANGUAGES.has(language))
    return 'Choose a valid activity, channel and language.';
  if(channel==='phone'&&customer.do_not_call===true&&
    event_type!=='customer_reply_reported')
    return 'Telephone follow-up blocked: Do Not Call is enabled.';
  const consent=trim(consent_reference),note=trim(summary);
  if(event_type!=='customer_reply_reported'&&(consent.length<10||consent.length>400))
    return 'Describe the independent permission source (10–400 characters).';
  if(consent.length>0&&(consent.length<10||consent.length>400))
    return 'Permission reference must be 10–400 characters if provided.';
  if(note.length>0&&(note.length<3||note.length>500))
    return 'Activity note must be 3–500 characters if provided.';
  return null;
}

export function describeFollowupActivity(row){
  const type=EVENTS[row?.event_type]||'Unknown manual activity';
  return type+' · '+trim(row?.channel||'other')+' · '+trim(row?.language||'en');
}

export function installManualFollowupHistory(root,db){
  if(!root||!db)throw new TypeError('Manual follow-up audit requires admin UI and Supabase client');
  const el=name=>root.querySelector('[data-history="'+name+'"]');
  const contractSelect=el('contract'),typeSelect=el('event'),channelSelect=el('channel');
  const langSelect=el('language'),permissionField=el('permission');
  const noteField=el('summary'),confirmField=el('attestation');
  const saveButton=el('save'),eventsEl=el('events'),statusEl=el('status');
  let byId=new Map(),customerById=new Map(),requestId=null,revision=0,storageReady=false;
  const invalidate=()=>{
    requestId=null;
    confirmField.checked=false;
    saveButton.disabled=true;
    statusEl.textContent='';
  };
  const reflect=()=>{
    const c=byId.get(contractSelect.value);
    const customer=customerById.get(c?.customer_id);
    const error=validateFollowupActivity({
      contract:c,customer,event_type:typeSelect.value,channel:channelSelect.value,
      language:langSelect.value,consent_reference:permissionField.value,summary:noteField.value
    });
    saveButton.disabled=!storageReady||Boolean(error)||!confirmField.checked;
    return error;
  };
  for(const control of [contractSelect,typeSelect,channelSelect,langSelect,
    permissionField,noteField]){
    control.addEventListener('change',()=>{
      if(control===contractSelect)loadHistory();
      invalidate();
      reflect();
    });
    if(control===permissionField||control===noteField)
      control.addEventListener('input',()=>{invalidate();reflect();});
  }
  confirmField.addEventListener('change',reflect);

  async function loadHistory(){
    const contractId=contractSelect.value,version=++revision;
    if(!byId.has(contractId)){
      eventsEl.textContent='Choose a contract to read actual recorded follow-up activity.';
      return;
    }
    eventsEl.textContent='Loading manually recorded history…';
    const {data,error}=await db.from('service_maintenance_followup_events')
      .select('id,event_type,channel,language,consent_reference,summary,recorded_at,recorded_by')
      .eq('contract_id',contractId).order('recorded_at',{ascending:false}).limit(100);
    if(version!==revision||contractId!==contractSelect.value)return;
    if(error){
      eventsEl.textContent='History unavailable (database migration or permissions may be pending): '+error.message;
      return;
    }
    eventsEl.innerHTML=(data||[]).length?(data||[]).map(item=>
      '<article class="entry"><strong>'+esc(describeFollowupActivity(item))+'</strong>'+
      '<div class="muted">Recorded '+esc(item.recorded_at)+
      ' · Operator '+esc(item.recorded_by)+'</div>'+
      (item.consent_reference?
        '<div class="muted">Operator-stated permission reference: '+esc(item.consent_reference)+'</div>':'')+
      (item.summary?'<div class="muted">Note: '+esc(item.summary)+'</div>':'')+
      '<div class="muted">Manual report; no provider delivery verified.</div></article>'
    ).join(''):'No manually recorded activity for this contract.';
  }
  saveButton.addEventListener('click',async()=>{
    const contract=byId.get(contractSelect.value),customer=customerById.get(contract?.customer_id);
    const event_type=typeSelect.value,channel=channelSelect.value,language=langSelect.value;
    const consent_reference=trim(permissionField.value)||null,summary=trim(noteField.value)||null;
    const error=validateFollowupActivity({
      contract,customer,event_type,channel,language,consent_reference,summary
    });
    if(!storageReady){statusEl.textContent='Audit database is not available. Nothing was recorded.';return;}
    if(error||!confirmField.checked){statusEl.textContent=error||'Confirm this manually entered account.';return;}
    if(!confirm('Store an append-only administrator statement? This does not send a message or prove delivery.'))return;
    requestId??=crypto.randomUUID();
    saveButton.disabled=true;
    const payload={
      client_event_id:requestId,contract_id:contract.id,customer_id:customer.id,
      event_type,channel,language,consent_reference,summary
    };
    try{
      let {error:saveError}=await db.from('service_maintenance_followup_events').insert(payload);
      if(saveError&&saveError.code==='23505'){
        const {data:existing,error:readError}=await db.from('service_maintenance_followup_events')
          .select('id').eq('client_event_id',requestId).maybeSingle();
        if(!readError&&existing)saveError=null;
      }
      if(saveError)throw saveError;
      requestId=null;
      confirmField.checked=false;
      permissionField.value='';
      noteField.value='';
      statusEl.textContent='Administrator entry recorded. No customer message was sent or delivery verified.';
      await loadHistory();
    }catch(err){
      statusEl.textContent='Cannot save audit record: '+String(err.message||err)+
        '. No delivery or approval has been marked. Retry uses the same event ID.';
    }finally{reflect();}
  });

  return async function render({contracts,customers}){
    const previous=contractSelect.value;
    byId=new Map(contracts.map(c=>[c.id,c]));
    customerById=new Map(customers.map(c=>[c.id,c]));
    contractSelect.innerHTML='<option value="">Choose contract…</option>'+
      contracts.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.contract_number)+
        ' · '+esc(c.ends_on)+'</option>').join('');
    contractSelect.value=byId.has(previous)?previous:'';
    // Preserve input only if the chosen contract is unchanged. Reset approvals on reload.
    invalidate();
    storageReady=false;
    const {error:probeError}=await db.from('service_maintenance_followup_events')
      .select('id').limit(1);
    storageReady=!probeError;
    if(probeError){
      ++revision;
      eventsEl.textContent='Persistent history unavailable until the database migration is applied: '+
        probeError.message+'. The existing manual draft/copy facility remains available.';
      statusEl.textContent='Audit log is disabled. No events can be recorded.';
      reflect();
      return;
    }
    reflect();
    await loadHistory();
  };
}
