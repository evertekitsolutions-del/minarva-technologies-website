// Admin-only, bounded read model. Financial values come ONLY from existing
// quotations/invoices; this module never computes, records or sends payments.
const SIZE=150;
const money=(value,currency='INR')=>{
  if(value===null||value===undefined||!Number.isFinite(Number(value)))return 'Not recorded';
  try{return new Intl.NumberFormat('en-IN',{style:'currency',currency:currency||'INR',
    minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));}
  catch{return String(value)+' '+String(currency||'INR');}
};
const batches=(items,size=SIZE)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>
  items.slice(i*size,(i+1)*size));
async function readByIds(db,table,column,ids,fields){
  if(!ids.length)return [];
  const result=[];
  for(const batch of batches([...new Set(ids)])){
    const {data,error}=await db.from(table).select(fields).in(column,batch);
    if(error)throw error;
    result.push(...(data||[]));
  }
  return result;
}
function href(path,id){return path+'?'+(path==='/quotations'?'quotation':'invoice')+'='+encodeURIComponent(id);}

function businessDate(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
export function paymentAttention(invoice,today){
  if(!invoice||invoice.status==='cancelled')return null;
  if(invoice.balance_due===null||invoice.balance_due===undefined||
      !Number.isFinite(Number(invoice.balance_due))||Number(invoice.balance_due)<=0)return null;
  const due=String(invoice.due_date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!/^\d{4}-\d{2}-\d{2}$/.test(today))return null;
  const delta=Math.round((Date.parse(due+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
  if(!Number.isFinite(delta))return null;
  if(delta<0)return 'Payment overdue by '+(-delta)+' day(s) — internal follow-up';
  if(delta<=7)return 'Payment due in '+delta+' day(s) — internal follow-up';
  return null;
}
export function invoiceFinanceState(invoice){
  if(!invoice)return {code:'missing',text:'No invoice converted yet'};
  const status=String(invoice.status||'unknown');
  if(status==='cancelled')return {code:'cancelled',text:'Invoice cancelled — no active collection'};
  return {code:'recorded',text:'Invoice '+status+' · payment '+String(invoice.payment_status||'not recorded')};
}

export async function displayMaintenanceFinance(db,contracts,esc){
  const renewals=contracts.filter(c=>Boolean(c.renewed_from_contract_id));
  if(!renewals.length)return;
  const targets=new Map(renewals.map(c=>[c.id,
    document.querySelector('[data-renewal-finance="'+c.id+'"]')]));
  const show=(id,html)=>{const target=targets.get(id);if(target)target.innerHTML=html;};
  const quoteRoute=customer=>'/quotations?customer='+encodeURIComponent(customer);
  let links,quotes,invoices;
  try{
    links=await readByIds(db,'service_maintenance_quotation_links','contract_id',
      renewals.map(c=>c.id),'contract_id,quotation_id,linked_at');
    quotes=await readByIds(db,'quotations','id',links.map(l=>l.quotation_id),
      'id,quotation_number,status,currency,total_amount');
    invoices=await readByIds(db,'invoices','source_quotation_id',links.map(l=>l.quotation_id),
      'id,invoice_number,source_quotation_id,status,payment_status,currency,total_amount,amount_paid,balance_due,due_date');
  }catch(error){
    for(const c of renewals)show(c.id,'<span class="muted">Billing data unavailable: '+esc(error.message||error)+'</span>');
    return;
  }
  const linked=new Map(links.map(l=>[l.contract_id,l]));
  const quotationById=new Map(quotes.map(q=>[q.id,q]));
  const invoicesByQuotation=new Map(invoices.map(i=>[i.source_quotation_id,i]));
  for(const c of renewals){
    const link=linked.get(c.id);
    if(!link){
      show(c.id,'<div class="muted">Renewal billing: no quotation linked. No charge exists in this renewal workflow.</div>'+
        '<div class="actions"><a href="'+quoteRoute(c.customer_id)+'">Create quotation</a>'+
        '<button type="button" class="ghost" data-finance-link="'+esc(c.id)+'">Link existing quotation</button></div>');
      const button=targets.get(c.id)?.querySelector('[data-finance-link]');
      button?.addEventListener('click',()=>selectQuotation(db,c,targets.get(c.id),esc,contracts));
      continue;
    }
    const q=quotationById.get(link.quotation_id),invoice=invoicesByQuotation.get(link.quotation_id);
    const invoiceState=invoiceFinanceState(invoice);
    show(c.id,'<div class="muted">Renewal quotation: <a href="'+href('/quotations',link.quotation_id)+'">'+
      esc(q?.quotation_number||link.quotation_id)+'</a> · '+esc(q?.status||'Status unavailable')+
      ' · '+esc(q?money(q.total_amount,q.currency):'Amount unavailable')+'</div>'+
      (invoice?
        '<div class="muted">Invoice: <a href="'+href('/invoices',invoice.id)+'">'+
        esc(invoice.invoice_number)+'</a> · '+esc(invoiceState.text)+
        ' · Total '+esc(money(invoice.total_amount,invoice.currency))+
        ' · Received '+esc(money(invoice.amount_paid,invoice.currency))+
        ' · Outstanding '+esc(money(invoice.balance_due,invoice.currency))+'</div>'+ 
        (paymentAttention(invoice,businessDate())?'<div class="tag warning">'+esc(paymentAttention(invoice,businessDate()))+'</div>':''):
        '<div class="muted">'+esc(invoiceState.text)+'. Convert only via the existing quotation workflow.</div>')+
      '<div class="muted">Quotation association is immutable; payment corrections remain in Invoice Ledger.</div>');
  }
}

async function selectQuotation(db,contract,target,esc,contracts){
  if(!target)return;
  const button=target.querySelector('[data-finance-link]');
  if(button)button.disabled=true;
  try{
    const {data,error}=await db.from('quotations')
      .select('id,quotation_number,status,total_amount,currency,created_at')
      .eq('customer_id',contract.customer_id)
      .in('status',['draft','sent','accepted','converted'])
      .order('created_at',{ascending:false}).limit(50);
    if(error)throw error;
    const rows=data||[];
    if(!rows.length){
      target.insertAdjacentHTML('beforeend','<p class="muted">No eligible quotations for this customer. Create one first.</p>');
      return;
    }
    const select=document.createElement('select');
    select.setAttribute('aria-label','Select customer quotation for AMC renewal');
    select.innerHTML='<option value="">Choose an existing quotation</option>'+rows.map(q=>
      '<option value="'+esc(q.id)+'">'+esc(q.quotation_number||q.id)+' · '+esc(q.status)+
      ' · '+esc(money(q.total_amount,q.currency))+'</option>').join('');
    const save=document.createElement('button');
    save.type='button';
    save.textContent='Confirm quotation link';
    save.disabled=true;
    select.addEventListener('change',()=>{save.disabled=!select.value});
    const note=document.createElement('p');
    note.className='muted';
    note.textContent='Choose an existing quote for this customer (latest 50 shown). Link once only. No invoice or payment will be created.';
    const panel=document.createElement('div');panel.className='actions';
    panel.append(select,save);
    target.append(note,panel);
    save.addEventListener('click',async()=>{
      if(!select.value||!confirm('Permanently link this quotation to renewal '+contract.contract_number+
        '? Check the quotation contents and amount first.'))return;
      save.disabled=true;
      const {error:insertError}=await db.from('service_maintenance_quotation_links')
        .insert({contract_id:contract.id,quotation_id:select.value});
      if(insertError){
        note.textContent='Link rejected: '+insertError.message;
        save.disabled=false;
      }else await displayMaintenanceFinance(db,contracts,esc);
    });
  }catch(error){
    target.insertAdjacentHTML('beforeend','<p class="muted">Unable to load quotations: '+esc(error.message||error)+'</p>');
  }finally{if(button)button.disabled=false;}
}
