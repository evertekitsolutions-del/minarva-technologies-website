const services=[{"value":"cctv","label":"CCTV / Security","link":"/services/cctv-security","desc":"Plan camera coverage and recording around your property.","keys":["cctv","camera","recording","surveillance","security","intruder","nvr","dvr"]},{"value":"computer","label":"Computers / Laptops","link":"/services/computer-laptop","desc":"Discuss repair, diagnostics, upgrades or support.","keys":["computer","laptop","repair","ssd","ram","windows","pc","slow","virus"]},{"value":"network","label":"Networking / Wi-Fi","link":"/services/networking-wifi","desc":"Review coverage, cabling, router and office connections.","keys":["wifi","wi-fi","internet","router","switch","network","ethernet","cabling","lan"]},{"value":"solar","label":"Solar / Inverters","link":"/services/solar-inverter","desc":"Review power backup or solar after checking site loads.","keys":["solar","inverter","battery","backup","power","electricity","panel","ups"]},{"value":"automation","label":"Home / Office Automation","link":"/services/home-automation","desc":"Plan lighting, smart control, video door phones and access.","keys":["automation","smart home","smart","lights","switch","door","biometric","access"]},{"value":"software","label":"Customized Software","link":"/services/custom-software","desc":"Map your business workflow for a tailored software discussion.","keys":["software","billing","inventory","crm","erp","report","application","app"]},{"value":"web","label":"Website Development","link":"/services/website-development","desc":"Discuss website structure, mobile usability and enquiry features.","keys":["website","web design","site","online","seo","ecommerce","e-commerce","domain"]}];
const selected=document.querySelector('#assistService');
const result=document.querySelector('#assistResult');
const query=document.querySelector('#assistQuery');
const go=document.querySelector('#assistGo');
const reset=document.querySelector('#assistReset');
for(const service of services){
 const option=document.createElement('option');option.value=service.value;option.textContent=service.label;selected.append(option)
}
const find=(term,pick)=>{
 if(pick){return services.find(s=>s.value===pick)}
 const text=term.toLowerCase().trim();
 if(!text)return null;
 const weights=services.map(s=>({...s,score:s.keys.reduce((score,k)=>score+(text.includes(k)?k.length>5?2:1:0),0)}));
 weights.sort((a,b)=>b.score-a.score);return weights[0]?.score>0?weights[0]:null
};
const show=()=>{
 const item=find(query.value,selected.value);
 if(!item){result.textContent='Choose a service or describe the issue with a few keywords. For a complex requirement, contact our team directly.';return}
 result.replaceChildren();
 const heading=document.createElement('h2');heading.textContent='Suggested next step: '+item.label;
 const paragraph=document.createElement('p');paragraph.textContent=item.desc+' This is guidance, not a diagnosis or a quotation.';
 const link=document.createElement('a');link.className='btn btn-primary';link.href=item.link;link.textContent='View service & request consultation';
 result.append(heading,paragraph,link);
};
go.addEventListener('click',show);
query.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();show()}});
reset.addEventListener('click',()=>{selected.value='';query.value='';result.textContent='Select a service or enter a few words to see a suggested next step.';query.focus()});
