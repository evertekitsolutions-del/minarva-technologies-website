const services=[{"value":"cctv","label":"CCTV / Security","ml":"സിസിടിവി / സുരക്ഷ","link":"/services/cctv-security","desc":"Plan camera coverage and recording around your property.","mlDesc":"വീട്, കട, ഓഫീസ് എന്നിവയ്ക്കുള്ള ക്യാമറ കവറേജും റെക്കോർഡിംഗും പരിശോധിക്കാം.","keys":["cctv","camera","cameras","recording","surveillance","security","dvr","nvr","hikvision"],"mlKeys":["സിസിടിവി","ക്യാമറ","സുരക്ഷ","റെക്കോർഡിങ്","റെക്കോർഡിംഗ്"]},{"value":"computer","label":"Computers / Laptops","ml":"കമ്പ്യൂട്ടർ / ലാപ്‌ടോപ്പ്","link":"/services/computer-laptop","desc":"Discuss repair, diagnostics, upgrades or support.","mlDesc":"കമ്പ്യൂട്ടർ, ലാപ്‌ടോപ്പ് റിപ്പയർ, അപ്ഗ്രേഡ്, സർവീസ് സഹായം ലഭിക്കും.","keys":["computer","computers","laptop","laptops","desktop","repair","ssd","ram","windows","pc","virus","printer","slow"],"mlKeys":["കമ്പ്യൂട്ടർ","ലാപ്ടോപ്പ്","ലാപ്‌ടോപ്പ്","റിപ്പയർ","പ്രിന്റർ","സർവീസ്"]},{"value":"network","label":"Networking / Wi-Fi","ml":"നെറ്റ്‌വർക്ക് / വൈഫൈ","link":"/services/networking-wifi","desc":"Review coverage, cabling, router and office connections.","mlDesc":"വൈഫൈ കവറേജ്, റൂട്ടർ, ലാൻ കേബിളിങ് എന്നിവ പരിശോധിക്കാം.","keys":["wifi","wi-fi","internet","router","routers","switch","network","networking","ethernet","cabling","lan","broadband"],"mlKeys":["വൈഫൈ","വൈ-ഫൈ","ഇന്റർനെറ്റ്","നെറ്റ്‌വർക്ക്","നെറ്റ്‌വർക്കിങ്","റൂട്ടർ","കേബിളിങ്"]},{"value":"solar","label":"Solar / Inverters","ml":"സോളാർ / ഇൻവെർട്ടർ","link":"/services/solar-inverter","desc":"Review power backup or solar after checking site loads.","mlDesc":"വൈദ്യുതി ബാക്കപ്പ്, സോളാർ, ഇൻവെർട്ടർ ആവശ്യങ്ങൾ പരിശോധിക്കാം.","keys":["solar","inverter","inverters","battery","batteries","backup","power","electricity","panel","panels","ups"],"mlKeys":["സോളാർ","ഇൻവെർട്ടർ","ബാറ്ററി","വൈദ്യുതി","പവർ","ബാക്കപ്പ്"]},{"value":"automation","label":"Home / Office Automation","ml":"ഹോം / ഓഫീസ് ഓട്ടോമേഷൻ","link":"/services/home-automation","desc":"Plan lighting, smart control, video door phones and access.","mlDesc":"സ്മാർട്ട് ലൈറ്റിങ്, വീഡിയോ ഡോർഫോൺ, ആക്സസ് കൺട്രോൾ എന്നിവ പ്ലാൻ ചെയ്യാം.","keys":["automation","smart home","smart switch","smart light","doorbell","video door phone","biometric","access control","iot"],"mlKeys":["ഓട്ടോമേഷൻ","സ്മാർട്ട്","ഡോർഫോൺ","ബയോമെട്രിക്","ലൈറ്റ്","ആക്സസ്"]},{"value":"software","label":"Customized Software","ml":"കസ്റ്റമൈസ്ഡ് സോഫ്റ്റ്‌വെയർ","link":"/services/custom-software","desc":"Map your business workflow for a tailored software discussion.","mlDesc":"ബിസിനസിന്റെ ആവശ്യങ്ങൾക്ക് അനുയോജ്യമായ സോഫ്റ്റ്‌വെയർ പരിഹാരങ്ങൾ ആലോചിക്കാം.","keys":["software","billing","inventory","crm","erp","reports","reporting","application","business app","pos"],"mlKeys":["സോഫ്റ്റ്‌വെയർ","ബില്ലിംഗ്","ഇൻവെന്ററി","ആപ്പ്","ബിസിനസ്"]},{"value":"web","label":"Website Development","ml":"വെബ്സൈറ്റ് ഡെവലപ്മെന്റ്","link":"/services/website-development","desc":"Discuss websites, mobile usability and online enquiries.","mlDesc":"ബിസിനസ് വെബ്സൈറ്റ്, മൊബൈൽ ഡിസൈൻ, ഓൺലൈൻ enquiry എന്നിവയ്ക്കുള്ള സഹായം ലഭിക്കും.","keys":["website","web design","webpage","site design","online store","seo","ecommerce","e-commerce","domain"],"mlKeys":["വെബ്സൈറ്റ്","വെബ്‌സൈറ്റ്","ഡൊമെയ്ൻ","ഓൺലൈൻ സ്റ്റോർ","എസ്ഇഒ"]}];
const labels={"en":{"service":"What type of service do you need?","query":"Describe your issue or goal (optional)","placeholder":"Example: Wi-Fi camera needs recording","go":"Find a solution","reset":"Reset","privacy":"No passwords, account records or private job status are requested or displayed here.","blank":"Select a service or enter a few words to see a suggested next step.","none":"We could not confidently match this request. Please contact our team for guidance.","one":"Suggested next step: ","many":"These services may be relevant:","caveat":"This is a rule-based suggestion, not a diagnosis or final quotation.","open":"View service & request consultation","contact":"Ask our team","choose":"I am not sure yet"},"ml":{"service":"ഏത് സേവനമാണ് വേണ്ടത്?","query":"പ്രശ്നം അല്ലെങ്കിൽ ആവശ്യം വിവരിക്കുക (നിർബന്ധമില്ല)","placeholder":"ഉദാഹരണം: വൈഫൈ ക്യാമറ റെക്കോർഡിംഗ്","go":"സേവനം കണ്ടെത്തുക","reset":"പുനഃക്രമീകരിക്കുക","privacy":"പാസ്‌വേഡ്, അക്കൗണ്ട് രേഖകൾ, സ്വകാര്യ ജോബ് വിവരങ്ങൾ ഇവിടെ ആവശ്യപ്പെടുകയോ കാണിക്കുകയോ ചെയ്യുന്നില്ല.","blank":"സേവനം തിരഞ്ഞെടുക്കുക അല്ലെങ്കിൽ ആവശ്യം വിവരിക്കുക.","none":"അനുയോജ്യമായ സേവനം ഉറപ്പിക്കാൻ കഴിഞ്ഞില്ല. ഞങ്ങളുടെ ടീമുമായി ബന്ധപ്പെടുക.","one":"നിർദേശിക്കുന്ന സേവനം: ","many":"ഈ സേവനങ്ങൾ അനുയോജ്യമായേക്കാം:","caveat":"ഇത് നിയമാധിഷ്ഠിത നിർദേശമാണ്; അന്തിമ പരിശോധനയോ ക്വട്ടേഷനോ അല്ല.","open":"സേവനം കാണുക / enquiry നൽകുക","contact":"ടീമിനെ ബന്ധപ്പെടുക","choose":"ഉറപ്പില്ല"}};
const contentCopy={
 en:{hero:'Find a solution for your requirement.',intro:'Answer a simple question to find a relevant service. This is a rule-based guide, not a live AI model, and your search stays on your device. For technical advice or an exact quotation, contact the team.',contactTitle:'Need personal assistance?',contactBody:'For a genuine enquiry, site visit request, quotation or existing service follow-up, use our secure contact options.'},
 ml:{hero:'നിങ്ങളുടെ ആവശ്യത്തിനുള്ള സേവനം കണ്ടെത്തൂ.',intro:'നിങ്ങളുടെ ആവശ്യം ലളിതമായി രേഖപ്പെടുത്തൂ. ഇത് നിയമാധിഷ്ഠിത മാർഗനിർദേശമാണ്; യഥാർത്ഥ AI മോഡലല്ല. ഇവിടെ ടൈപ്പ് ചെയ്യുന്ന വിവരങ്ങൾ നിങ്ങളുടെ ഉപകരണത്തിൽ തന്നെയാണ് തുടരുന്നത്. കൃത്യമായ ക്വട്ടേഷനായി ഞങ്ങളുടെ ടീമിനെ ബന്ധപ്പെടുക.',contactTitle:'ഞങ്ങളുടെ സഹായം വേണോ?',contactBody:'യഥാർത്ഥ enquiry, സൈറ്റ് സന്ദർശനം, ക്വട്ടേഷൻ, സർവീസ് ഫോളോ-അപ്പ് എന്നിവയ്ക്കായി ഞങ്ങളുടെ സുരക്ഷിത contact options ഉപയോഗിക്കൂ.'}
};
const selected=document.querySelector('#assistService');
const result=document.querySelector('#assistResult');
const query=document.querySelector('#assistQuery');
const go=document.querySelector('#assistGo');
const reset=document.querySelector('#assistReset');
const language=document.querySelector('#assistLanguage');
const serviceLabel=document.querySelector('#serviceLabel');
const queryLabel=document.querySelector('#queryLabel');
const privacyNote=document.querySelector('#privacyNote');
const normalize=text=>String(text||'').normalize('NFKC').toLocaleLowerCase('en').trim();
const tokenize=text=>normalize(text).match(/[\p{L}\p{M}\p{N}]+/gu)||[];
const matchTerm=(text,tokens,term)=>{
 const key=normalize(term);
 if(/[\u0D00-\u0D7F]/u.test(key))return text.includes(key);
 if(key.includes('-'))return text.includes(key);
 if(key.includes(' '))return (' '+text+' ').includes(' '+key+' ');
 return tokens.includes(key);
};
function findMatches(text,pick){
 if(pick)return services.filter(s=>s.value===pick);
 const normalized=normalize(text);if(!normalized)return [];
 const words=tokenize(normalized);
 const ranked=services.map(s=>({
   service:s,
   score:s.keys.reduce((total,k)=>total+(matchTerm(normalized,words,k)?2:0),0)+
     s.mlKeys.reduce((total,k)=>total+(matchTerm(normalized,words,k)?2:0),0)
 })).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
 if(!ranked.length)return [];
 const max=ranked[0].score;
 return ranked.filter(x=>x.score>=max-1).slice(0,3).map(x=>x.service);
}
function linkToTeam(copy){
 const a=document.createElement('a');
 a.href='/support#enquire';a.className='btn btn-outline';a.textContent=copy.contact;
 return a;
}
function render(){
 const locale=language.value==='ml'?'ml':'en',copy=labels[locale],found=findMatches(query.value,selected.value);
 result.replaceChildren();
 if(!found.length){
   const p=document.createElement('p');p.textContent=query.value.trim()?copy.none:copy.blank;
   result.append(p,linkToTeam(copy));return;
 }
 const title=document.createElement('h2');
 title.textContent=found.length===1?copy.one+(locale==='ml'?found[0].ml:found[0].label):copy.many;
 result.append(title);
 const wrapper=document.createElement('div');wrapper.className='option-grid';
 found.forEach(s=>{
   const article=document.createElement('div');article.className='option';
   const h3=document.createElement('h3');h3.textContent=locale==='ml'?s.ml:s.label;
   const p=document.createElement('p');p.textContent=locale==='ml'?s.mlDesc:s.desc;
   const a=document.createElement('a');a.className='btn btn-primary';a.href=s.link;a.textContent=copy.open;
   article.append(h3,p,a);wrapper.append(article);
 });
 result.append(wrapper);
 const caveat=document.createElement('p');caveat.className='subtle';caveat.textContent=copy.caveat;
 result.append(caveat,linkToTeam(copy));
}
function applyLanguage(){
 const locale=language.value==='ml'?'ml':'en',copy=labels[locale],prior=selected.value;
 document.documentElement.lang=locale;
 document.querySelector('#assistHero').textContent=contentCopy[locale].hero;
 document.querySelector('#assistIntroduction').textContent=contentCopy[locale].intro;
 document.querySelector('#assistContactHeading').textContent=contentCopy[locale].contactTitle;
 document.querySelector('#assistContactBody').textContent=contentCopy[locale].contactBody;
 serviceLabel.textContent=copy.service;
 queryLabel.textContent=copy.query;
 query.placeholder=copy.placeholder;
 go.textContent=copy.go;reset.textContent=copy.reset;privacyNote.textContent=copy.privacy;
 selected.replaceChildren();
 const empty=document.createElement('option');empty.value='';empty.textContent=copy.choose;selected.append(empty);
 services.forEach(s=>{
  const option=document.createElement('option');option.value=s.value;option.textContent=locale==='ml'?s.ml:s.label;selected.append(option)
 });
 selected.value=prior;
 render();
}
go.addEventListener('click',render);
query.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();render()}});
selected.addEventListener('change',render);
language.addEventListener('change',applyLanguage);
reset.addEventListener('click',()=>{selected.value='';query.value='';render();query.focus()});
applyLanguage();