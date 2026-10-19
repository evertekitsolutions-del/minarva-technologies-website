import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {computeServiceOperations} from '../assets/service-operations-metrics.mjs';
import {
  exportedJobRows,makeServiceOperationsCsv,makeServiceVisitIcs
} from '../assets/service-operations-export.mjs';

const id='64f9bb92-4421-4312-a07f-1a1fc948bd35';
const id2='c24ffbc2-ea65-4dd7-9080-e07fdb8ff135';
const job={
  id,job_number:'JOB-001',service_category:'CCTV, "Pro"',
  complaint:'PRIVATE fault details',site_address:'PRIVATE ADDRESS',
  priority:'urgent',status:'open',created_at:'2026-10-18T08:00:00Z',
  assigned_technician_id:'tech1',customers:{name:'=HYPERLINK("bad")'},
  technicians:{name:'Engineer A'},
  scheduled_at:'2026-10-19T08:00:00Z',follow_up_at:null,next_visit_at:null,
  sla_response_due_at:null,sla_resolution_due_at:null
};
const cancelled={...job,id:id2,job_number:'JOB-002',
  customers:{name:'Alice'},status:'cancelled',scheduled_at:'2026-10-20T08:00:00Z'};
const board=computeServiceOperations([job,cancelled],[{id:'tech1',name:'Engineer A',active:true}],[],{
  now:Date.parse('2026-10-18T00:00:00Z')
});
assert.equal(exportedJobRows(board).length,2);
assert.equal(exportedJobRows(board,'priority_urgent').length,1);
assert.equal(exportedJobRows(board,'all','JOB-001').length,1);
assert.equal(exportedJobRows(board,'all','PRIVATE ADDRESS').length,2);
assert.equal(exportedJobRows(board,'all','no-match').length,0);
assert.throws(()=>exportedJobRows(null),/Authorized live/);
const csv=makeServiceOperationsCsv(exportedJobRows(board,'priority_urgent'));
assert.ok(csv.startsWith('\uFEFF'));
assert.match(csv,/Job Number/);
assert.match(csv,/'=HYPERLINK/,'Formula-like customer names neutralized');
assert.match(csv,/CCTV, ""Pro""/,'Quoted CSV contents are escaped');
assert.match(csv,/13:30/,'Record instant displayed in India timezone');
assert.doesNotMatch(csv,/PRIVATE ADDRESS|PRIVATE fault details/);
assert.doesNotMatch(csv,/phone|email|gps/i);
assert.equal(csv.trimEnd().split('\r\n').length,2);
assert.throws(()=>makeServiceOperationsCsv(null),/Filtered real jobs/);
const second={...job,id:id2,job_number:'JOB-002',status:'completed'};
const {content:ics,eventCount}=makeServiceVisitIcs([job,second],{
  generatedAt:new Date('2026-10-19T11:00:00Z')
});
assert.equal(eventCount,1,'Only active recorded appointments are exported');
assert.match(ics,/BEGIN:VCALENDAR\r\nVERSION:2\.0/);
assert.match(ics,/DTSTART:20261019T080000Z/);
assert.match(ics,/DTSTAMP:20261019T110000Z/);
assert.match(ics,/STATUS:TENTATIVE/);
assert.match(ics,/TRANSP:TRANSPARENT/);
assert.match(ics.replace(/\r\n /g,''),/UID:service-job-64f9bb92-4421-4312-a07f-1a1fc948bd35@minarvatechnologies.com/);
assert.doesNotMatch(ics,/PRIVATE ADDRESS|PRIVATE fault details|HYPERLINK|ATTENDEE|ORGANIZER|BEGIN:VALARM/);
assert.equal(ics.match(/BEGIN:VEVENT/g)?.length,1);
assert.equal(makeServiceVisitIcs([{...job,scheduled_at:null}],{
 generatedAt:new Date('2026-10-19T11:00:00Z')}).eventCount,0);
assert.equal(makeServiceVisitIcs([{...job,id:'bad-uuid'}],{
 generatedAt:new Date('2026-10-19T11:00:00Z')}).eventCount,0);
assert.equal(makeServiceVisitIcs([cancelled],{
 generatedAt:new Date('2026-10-19T11:00:00Z')}).eventCount,0);
const long={...job,service_category:'മലയാളം CCTV testing with a long description '.repeat(10)};
const calendar=makeServiceVisitIcs([long],{generatedAt:new Date('2026-10-19T11:00:00Z')});
assert.ok(calendar.content.split('\r\n').every(line=>Buffer.byteLength(line,'utf8')<=75),
  'ICS text must be folded at 75 UTF-8 bytes');

const html=readFileSync('service-operations.html','utf8');
const client=readFileSync('assets/service-operations.js','utf8');
const exporter=readFileSync('assets/service-operations-export.mjs','utf8');
const checks=[
 ['admin gate preserved',client.includes("if(granted)await refresh()")],
 ['CSV action disabled before read',html.includes('id="exportCsv"')&&html.includes('id="exportCsv" class="button" type="button" disabled')],
 ['ICS action disabled before read',html.includes('id="exportCalendar"')&&html.includes('id="exportCalendar" class="button" type="button" disabled')],
 ['CSV explicit customer name consent',client.includes('including customer names')],
 ['only loaded filtered jobs',client.includes('exportedJobRows(board,filter')],
 ['truncated snapshot warnings',client.includes('truncatedSnapshot')&&client.includes('partial (10,000-row cap)')],
 ['no provider messaging',!/functions\.invoke|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(client)],
 ['no confidential data columns in export',!/site_address|complaint|\.phone\b|\.email\b/.test(exporter.slice(exporter.indexOf('export function makeServiceOperationsCsv'),exporter.indexOf('function validUuid')))],
 ['ICS has no alarm',!exporter.includes('BEGIN:VALARM')],
 ['ICS UTC timestamp',exporter.includes('new Date(ms).toISOString()')],
 ['CSV formula guard',exporter.includes("valueText=\"'\"+valueText")],
 ['no fabricated appointment durations',!exporter.includes('DTEND:')&&!exporter.includes('DURATION:')],
 ['export is client-side only',!exporter.includes('fetch(')&&!exporter.includes('navigator.sendBeacon')],
 ['CSV and calendar status accessible',html.includes('id="exportStatus"')&&html.includes('aria-live="polite"')],
 ['filter semantics match UI',client.includes('const rows=currentRows()')]
];
for(const [name,ok] of checks)assert.ok(ok,name);
for(const f of ['assets/service-operations.js','assets/service-operations-export.mjs']){
 const result=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
}
console.log(JSON.stringify({ok:true,checks:checks.length,safeCSV:true,
  calendarEvents:1,realBackendRecordsCreated:0,providerCalls:0}));
