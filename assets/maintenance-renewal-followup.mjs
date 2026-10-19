import {renewalWatch} from '/assets/maintenance-renewal.mjs';

// This module deliberately has NO customer-care outbox, WhatsApp or call adapter.
const languages=new Set(['en','ml']);
const clean=value=>String(value??'').trim();
const escapeHtml=value=>clean(value).replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(clean(value)) &&
  !Number.isNaN(Date.parse(clean(value)+'T00:00:00Z'));

export function draftRenewalFollowup({contract,customer,today,language='en'}){
  const name=clean(customer?.name),code=clean(contract?.contract_number);
  const category=clean(contract?.service_category),end=clean(contract?.ends_on);
  if(!name||!code||!category||!validDate(end)||!validDate(today))
    throw new TypeError('An actual customer and valid contract dates are required');
  const lang=languages.has(language)?language:'en';
  const expired=end<today;
  if(lang==='ml'){
    return [
      'നമസ്കാരം '+name+',',
      '',
      'Minarva Technologies-ൽ രജിസ്റ്റർ ചെയ്തിരിക്കുന്ന '+category+
      ' സേവന കരാറിന്റെ ('+code+') കാലാവധി '+end+'-ന് '+
      (expired?'അവസാനിച്ചു.':'അവസാനിക്കും.'),
      '',
      'പുതുക്കാൻ താൽപര്യമുണ്ടെങ്കിൽ ഞങ്ങളെ അറിയിക്കാമോ? സേവന പരിധിയും നിരക്കും നിബന്ധനകളും സ്ഥിരീകരിച്ച ശേഷം മാത്രമേ പുതുക്കലിനുള്ള ക്വട്ടേഷൻ നൽകുകയുള്ളൂ.',
      '',
      'ഇത്തരം പുതുക്കൽ ഓർമ്മപ്പെടുത്തലുകൾ ഇനി വേണ്ടെങ്കിൽ അറിയിക്കാം.',
      'Minarva Technologies, Thiruvananthapuram',
      '+91 6235353732'
    ].join('\n');
  }
  return [
    'Hello '+name+',',
    '',
    'Your '+category+' service coverage with Minarva Technologies ('+
      code+') '+(expired?'expired on ':'is due to end on ')+end+'.',
    '',
    'If you would like to renew, please let us know. We will confirm scope, price and terms before preparing a quotation.',
    '',
    'You can also tell us if you prefer not to receive further renewal reminders.',
    'Minarva Technologies, Thiruvananthapuram',
    '+91 6235353732'
  ].join('\n');
}

export function renewalContactReview(customer){
  if(!customer)return 'Customer details unavailable. Do not prepare a message.';
  const preference=clean(customer.preferred_contact_channel);
  const callRestriction=customer.do_not_call===true
    ?'DO NOT CALL recorded: telephone calls must not be made. ':'';
  return callRestriction+
    'A contact preference'+(preference?' ('+preference+')':'')+
    ' and call consent are NOT proof of renewal-message/WhatsApp opt-in. Verify separate permission before using any draft.';
}

export function renewalFollowupCandidates(contracts,today){
  return renewalWatch(contracts,today,60);
}

export function installRenewalFollowupDesk(root){
  if(!root)throw new TypeError('Follow-up desk missing');
  const field=name=>root.querySelector('[data-followup="'+name+'"]');
  const select=field('contract'),lang=field('language'),message=field('message');
  const notice=field('notice'),confirmPermission=field('permission');
  const copy=field('copy'),status=field('status');
  let contractById=new Map(),customerById=new Map(),today='';

  const clear=()=>{
    confirmPermission.checked=false;
    message.value='';
    copy.disabled=true;
    status.textContent='';
  };
  const redraw=()=>{
    clear();
    const contract=contractById.get(select.value),customer=customerById.get(contract?.customer_id);
    if(!contract){
      notice.textContent='Choose an expiring or expired contract to review.';
      return;
    }
    if(!customer){
      notice.textContent='Customer information is not in the loaded page. A follow-up cannot be prepared.';
      return;
    }
    notice.textContent=renewalContactReview(customer)+
      ' This tool only prepares text; it never sends or logs customer contact.';
    try{message.value=draftRenewalFollowup({contract,customer,today,language:lang.value});}
    catch(error){notice.textContent=String(error.message||error);}
  };
  select.addEventListener('change',()=>{
    const customer=customerById.get(contractById.get(select.value)?.customer_id);
    lang.value=customer?.preferred_language==='ml'?'ml':'en';
    redraw();
  });
  lang.addEventListener('change',redraw);
  message.addEventListener('input',()=>{
    confirmPermission.checked=false;
    copy.disabled=true;
    status.textContent='Draft edited; reconfirm permission before copying.';
  });
  confirmPermission.addEventListener('change',()=>{
    copy.disabled=!confirmPermission.checked||!message.value.trim();
    status.textContent='';
  });
  copy.addEventListener('click',async()=>{
    if(copy.disabled||!confirmPermission.checked||!message.value.trim())return;
    copy.disabled=true;
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard access unavailable. Select the text to copy manually.');
      await navigator.clipboard.writeText(message.value);
      status.textContent='Draft copied. No message was sent. Confirm recipient and consent separately.';
    }catch(error){status.textContent=String(error.message||error);}
    finally{copy.disabled=!confirmPermission.checked||!message.value.trim();}
  });

  return function render({contracts,customers,asOf}){
    today=asOf;
    const candidates=renewalFollowupCandidates(contracts,asOf);
    contractById=new Map(candidates.map(x=>[x.contract.id,x.contract]));
    customerById=new Map(customers.map(x=>[x.id,x]));
    const previous=select.value;
    select.innerHTML='<option value="">Choose contract…</option>'+
      candidates.map(({contract,attention})=>'<option value="'+escapeHtml(contract.id)+'">'+
      escapeHtml(contract.contract_number)+' · '+escapeHtml(attention.label)+'</option>').join('');
    select.value=contractById.has(previous)?previous:'';
    field('count').textContent=candidates.length+' records needing attention among '+
      contracts.length+' loaded contracts'+(contracts.length===1000?' (partial list)':'')+'.';
    redraw();
  };
}
