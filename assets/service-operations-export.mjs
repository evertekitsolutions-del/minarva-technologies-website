import {boardMatches,FIELD_FILTERS} from './service-operations-metrics.mjs';

// All exports are made on a deliberate active-admin click from an already
// loaded, bounded read-only snapshot. No sensitive phone/address/complaint
// fields, network requests, calendar subscriptions or database writes.
const terminal=new Set(['completed','cancelled']);
const filters=new Set(FIELD_FILTERS.map(([key])=>key));
const raw=value=>String(value??'');
export function exportSearchMatches(job,filter='all',query=''){
  if(filter!=='all'&&!filters.has(filter)&&!filter.startsWith('engineer:'))return false;
  if(!boardMatches(job,filter))return false;
  const terms=[job.job_number,job.service_category,job.complaint,
    customerName(job),engineerName(job),job.site_address].join(' ').toLocaleLowerCase();
  return !query||terms.includes(String(query).trim().toLocaleLowerCase());
}
export function exportedJobRows(board,filter='all',query=''){
  if(!Array.isArray(board?.jobs))throw new TypeError('Authorized live service snapshot required');
  return board.jobs.filter(job=>exportSearchMatches(job,filter,query));
}
export function customerName(job){
  const value=Array.isArray(job?.customers)?job.customers[0]:job?.customers;
  return value?.name||'Customer';
}
export function engineerName(job){
  const value=Array.isArray(job?.technicians)?job.technicians[0]:job?.technicians;
  return value?.name||'Unassigned';
}
function dateIST(value){
  if(!value)return '';
  const parsed=Date.parse(value);
  if(!Number.isFinite(parsed))return '';
  return new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hour12:false
  }).format(new Date(parsed))+' IST';
}
function cell(value){
  let valueText=raw(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
  // Spreadsheet importers may trim leading whitespace before interpreting a
  // formula. Prefix potentially executable strings with a literal apostrophe.
  if(/^[\s]*[=+@-]/.test(valueText)||/^[\s]*[\t\r\n]/.test(valueText))valueText="'"+valueText;
  return '"'+valueText.replace(/"/g,'""')+'"';
}
const headers=['Job Number','Customer','Engineer','Service Category','Status','Priority',
  'Appointment (IST)','Follow-up (IST)','Return Visit (IST)',
  'Arrival SLA (IST)','Resolution SLA (IST)','Attention Flags'];
export function makeServiceOperationsCsv(jobs){
  if(!Array.isArray(jobs))throw new TypeError('Filtered real jobs are required');
  const records=jobs.map(job=>[
    job.job_number,customerName(job),engineerName(job),job.service_category,
    job.status,job.priority,dateIST(job.scheduled_at),dateIST(job.follow_up_at),
    dateIST(job.next_visit_at),dateIST(job.sla_response_due_at),
    dateIST(job.sla_resolution_due_at),
    FIELD_FILTERS.filter(([key])=>key!=='all'&&job.operations?.[key]).map(([,label])=>label).join('; ')
  ]);
  return '\uFEFF'+[headers.map(cell),...records.map(x=>x.map(cell))].map(x=>x.join(',')).join('\r\n')+'\r\n';
}
function validUuid(value){
  return /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(raw(value));
}
function eventUtc(value){
  if(typeof value!=='string'||!/[zZ]|[+-]\d\d:\d\d$/.test(value))return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms)?new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''):null;
}
function icsEscape(value){
  return raw(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n')
    .replace(/;/g,'\\;').replace(/,/g,'\\,');
}
function icsLine(text){
  // RFC 5545 folds physical lines at 75 UTF-8 octets (continuation prefix).
  const chunks=[];let current='',bytes=0;
  for(const char of String(text)){
    const size=new TextEncoder().encode(char).length;
    if(bytes+size>75&&current){chunks.push(current);current=' ';bytes=1;}
    current+=char;bytes+=size;
  }
  chunks.push(current);
  return chunks.join('\r\n');
}
export function makeServiceVisitIcs(jobs,{generatedAt=new Date()}={}){
  if(!Array.isArray(jobs))throw new TypeError('Filtered real jobs are required');
  const stamp=eventUtc(generatedAt.toISOString());
  if(!stamp)throw new TypeError('Invalid export timestamp');
  const items=jobs.filter(j=>!terminal.has(j.status)&&validUuid(j.id)&&eventUtc(j.scheduled_at));
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Minarva Technologies//Internal Field Service//EN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Minarva Planned Field Visits'];
  for(const job of items){
    lines.push('BEGIN:VEVENT',
      'UID:service-job-'+job.id.toLowerCase()+'@minarvatechnologies.com',
      'DTSTAMP:'+stamp,
      'DTSTART:'+eventUtc(job.scheduled_at),
      'STATUS:TENTATIVE',
      'TRANSP:TRANSPARENT',
      'SUMMARY:'+icsEscape('Planned visit '+raw(job.job_number||'Service Job')+' — '+raw(job.service_category||'Service')),
      'DESCRIPTION:'+icsEscape('Internal planning only; confirm appointment with customer before travel. No customer contact or reminder is triggered.'),
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return {content:lines.map(icsLine).join('\r\n')+'\r\n',eventCount:items.length};
}
