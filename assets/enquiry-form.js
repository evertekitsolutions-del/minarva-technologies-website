import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';
const edge=createClient('https://kwullzwhlzziosjsejud.supabase.co','sb_publishable_qfPTbekhbQy8IcU7qCpvUA_i1sdvMuj');
const form=document.querySelector('[data-enquiry-form]');
if(form){
 const started=form.querySelector('[name="form_started_at"]');started.value=String(Date.now());
 const consent=form.querySelector('[name="consent_to_contact"]');
 const status=form.querySelector('[role="status"]'),submit=form.querySelector('button[type="submit"]'),link=form.querySelector('[data-whatsapp-fallback]');
 form.addEventListener('submit',async e=>{
   e.preventDefault();if(!form.reportValidity())return;
   const value=name=>form.elements.namedItem(name)?.value?.trim()||'';
   const name=value('name'),phone=value('phone'),email=value('email'),service=value('service');
   if(name.length<2||phone.length<7||phone.length>30||!/^[+0-9() .-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15){status.textContent='Enter a name and a valid phone number containing 7–15 digits.';status.hidden=false;return}
   if(!consent?.checked){status.textContent='Please agree to be contacted about this enquiry.';status.hidden=false;return}
   const detail=[form.dataset.enquiryKind==='support'?'Customer support request (manual review; no customer record lookup)':'',value('message'),value('urgency')?'Priority: '+value('urgency'):'',value('preferred_date')?'Preferred visit date (request only): '+value('preferred_date'):''].filter(Boolean).join(' | ');
   const message=detail.slice(0,3900),whatsapp='https://wa.me/916235353732?text='+encodeURIComponent(['Hello Minarva Technologies','Name: '+name,'Phone: '+phone,email?'Email: '+email:'','Service: '+service,'Requirement: '+(message||'Please contact me')].filter(Boolean).join('\n'));
   link.href=whatsapp;link.hidden=false;submit.disabled=true;status.hidden=false;status.textContent='Saving your enquiry…';
   try{
     const {data,error}=await edge.functions.invoke('public-enquiry-submit',{body:{name,phone,email:email||null,service,consent_to_contact:consent.checked,message:message||null,company_website:value('company_website'),form_started_at:Number(started.value)}});
     if(error||!data?.accepted)throw Error(data?.error||error?.message||'Unable to save enquiry');
     status.textContent='Enquiry saved. You can now continue on WhatsApp using the link below.';form.reset();started.value=String(Date.now());link.hidden=false;
   }catch(e){status.textContent='The enquiry could not be saved right now. Please use the WhatsApp link to contact us.';console.warn('Enquiry submission failed',e)}
   finally{submit.disabled=false}
 })
}