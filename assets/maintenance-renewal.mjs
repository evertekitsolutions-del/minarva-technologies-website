const DAY_MS=86_400_000;
function isoDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [year,month,day]=value.split('-').map(Number);
  const milliseconds=Date.UTC(year,month-1,day);
  const parsed=new Date(milliseconds);
  return parsed.getUTCFullYear()===year&&parsed.getUTCMonth()===month-1&&parsed.getUTCDate()===day
    ?milliseconds:null;
}
export function nextRenewalStart(endDate){
  const date=isoDay(endDate);
  if(date===null)throw new RangeError('Invalid contract end date');
  return new Date(date+DAY_MS).toISOString().slice(0,10);
}
export function renewalAttention(contract,today,successorExists=false,windowDays=60){
  const end=isoDay(contract?.ends_on),now=isoDay(today);
  if(end===null||now===null||!Number.isInteger(windowDays)||windowDays<0){
    return {code:'invalid',label:'Coverage date unavailable',daysRemaining:null,needsAttention:false};
  }
  const daysRemaining=Math.round((end-now)/DAY_MS);
  if(successorExists)return {code:'renewed',label:'Renewal successor recorded',daysRemaining,needsAttention:false};
  if(daysRemaining<0)return {code:'expired',label:'Coverage expired '+(-daysRemaining)+' day(s) ago',daysRemaining,needsAttention:true};
  if(daysRemaining<=windowDays)return {code:'expiring',label:daysRemaining===0?'Coverage ends today':'Coverage ends in '+daysRemaining+' day(s)',daysRemaining,needsAttention:true};
  return {code:'later',label:'Coverage ends '+contract.ends_on,daysRemaining,needsAttention:false};
}
export function renewalWatch(contracts,today,windowDays=60){
  const linked=new Set(contracts.map(c=>c.renewed_from_contract_id).filter(Boolean));
  return contracts.map(contract=>({contract,attention:renewalAttention(contract,today,linked.has(contract.id),windowDays)}))
    .filter(item=>item.attention.needsAttention)
    .sort((a,b)=>a.contract.ends_on.localeCompare(b.contract.ends_on)||a.contract.id.localeCompare(b.contract.id));
}
