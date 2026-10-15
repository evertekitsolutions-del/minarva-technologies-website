import assert from 'node:assert/strict'
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
import {computeServiceOperations,boardMatches,FIELD_FILTERS} from '../assets/service-operations-metrics.mjs'

const now=Date.parse('2026-10-15T10:00:00Z')
const past='2026-10-14T10:00:00Z'
const future='2026-10-16T10:00:00Z'
const job=(id,rest={})=>({
  id,job_number:'JOB-'+id,created_at:'2026-10-13T10:00:00Z',
  priority:'normal',status:'open',assigned_technician_id:'eng-a',
  scheduled_at:null,visit_started_at:null,follow_up_at:null,
  resolution_status:null,next_visit_at:null,callback_required:false,callback_at:null,...rest
})
const technicians=[{id:'eng-a',name:'Technician A',active:true},
                   {id:'eng-b',name:'Technician B',active:true}]
const rows=[
 job('unassigned',{assigned_technician_id:null}),
 job('missed',{scheduled_at:past,priority:'urgent'}),
 job('onway',{scheduled_at:past,visit_started_at:past}),
 job('future',{scheduled_at:future,follow_up_at:future}),
 job('followup',{follow_up_at:past,assigned_technician_id:'eng-b'}),
 job('callback',{status:'completed',callback_required:true,callback_at:null}),
 job('callback-future',{callback_required:true,callback_at:future}),
 job('return',{status:'completed',resolution_status:'return_visit_required',next_visit_at:past}),
 job('parts',{status:'on_hold',resolution_status:'awaiting_parts'}),
 job('unreviewed',{status:'completed'}),
 job('reviewed',{status:'completed'}),
 job('cancelled',{status:'cancelled',scheduled_at:past,assigned_technician_id:null}),
 job('high',{priority:'high',assigned_technician_id:'eng-b'})
]
const feedback=[{service_job_id:'reviewed',rating:2}]
const report=computeServiceOperations(rows,technicians,feedback,{now})
const byId=id=>report.flagsByJob[id]
assert.equal(report.counters.all,13)
assert.equal(report.activeCount,8)
assert.equal(report.completedCount,4)
assert.equal(report.counters.unassigned,1)
assert.equal(report.counters.missed_visit,1)
assert.equal(report.counters.followup_due,1)
assert.equal(report.counters.revisit_due,1)
assert.equal(report.counters.callback_due,1)
assert.equal(report.counters.awaiting_parts,1)
assert.equal(report.counters.feedback_pending,3)
assert.equal(report.counters.priority_urgent,1)
assert.equal(byId('onway').missed_visit,false,'Travel started: not classified as missed visit')
assert.equal(byId('future').followup_due,false,'No invented overdue from future visit')
assert.equal(byId('callback-future').callback_due,false,'Scheduled future callback')
assert.equal(byId('cancelled').unassigned,false,'Cancelled not operationally active')
assert.equal(byId('cancelled').missed_visit,false)
assert.equal(byId('reviewed').feedback_pending,false,'Private feedback is respected regardless of low rating')
assert.equal(byId('return').revisit_due,true,'Completed return visit still actionable')
assert.equal(byId('reviewed').attention,false,'Satisfied status not inferred from rating')
assert.equal(boardMatches(report.jobs.find(x=>x.id==='missed'),'missed_visit'),true)
assert.equal(boardMatches(report.jobs.find(x=>x.id==='missed'),'engineer:eng-b'),false)
assert.equal(boardMatches(report.jobs.find(x=>x.id==='missed'),'engineer:eng-a'),true)
assert.equal(report.jobs[0].id,'missed','Missed visit ranks as first operational priority')
assert.ok(report.engineers.some(x=>x.id==='eng-a'&&x.open===5),'Workload counts open jobs')
assert.ok(report.engineers.some(x=>x.id==='eng-b'&&x.open===2),'Second engineer workload')
assert.equal(FIELD_FILTERS.length,9)
assert.deepEqual(computeServiceOperations([],[],[],{now}).counters,
  Object.fromEntries(FIELD_FILTERS.map(([k])=>[k,0])),'No real jobs = zero, not fabricated statistics')
assert.throws(()=>computeServiceOperations([],null,[],{now}),/Expected live service lists/)
assert.throws(()=>computeServiceOperations([],[],[],{now:NaN}),/Clock is invalid/)
const html=fs.readFileSync('service-operations.html','utf8')
const page=fs.readFileSync('assets/service-operations.js','utf8')
const jobs=fs.readFileSync('service-jobs.html','utf8')
const workflow=fs.readFileSync('.github/workflows/service-pages-integrity.yml','utf8')
for(const id of ['cards','filter','jobRows','engineerRows','status','search','refresh'])
  assert.ok(html.includes('id="'+id+'"'),'Dashboard missing control '+id)
assert.match(html,/noindex,nofollow/,'No-index private board')
assert.match(jobs,/href="\/service-operations"/,'Service Jobs links back to Control Tower')
assert.match(page,/requireActiveAdmin\(db/,'Must require active administrator')
assert.match(page,/if\(granted\)await refresh\(\)/,'No service fetch before access')
assert.match(page,/source_type|'service_feedback'/,'Only real feedback is read')
assert.match(page,/MAX_PAGES=20/,'Bound paginated data loads')
assert.match(page,/PARTIAL DATA/,'Never silently present partial stats as complete')
assert.doesNotMatch(page,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|functions\.invoke\(/,'Board cannot mutate production business data')
assert.match(workflow,/tools\/field-service-operations-contract\.mjs/,'Regression wired into CI')
for(const name of ['assets/service-operations.js','assets/service-operations-metrics.mjs']){
  const result=spawnSync(process.execPath,['--check',name],{encoding:'utf8'})
  assert.equal(result.status,0,name+' syntax: '+result.stderr)
}
console.log(JSON.stringify({ok:true,fixtureJobs:rows.length,metricFilters:FIELD_FILTERS.length,
  noFakeSLA:true,readOnly:true,adminGate:true,jsSyntax:true,productionWrites:0}))
