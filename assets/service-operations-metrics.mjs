// Shared, deterministic field-operations rules. Dates are UTC instants; no
// invented SLA targets. Only real appointments and follow-up fields count.
export const FIELD_FILTERS=Object.freeze([
  ['all','All jobs'],
  ['unassigned','Needs engineer'],
  ['missed_visit','Visit overdue'],
  ['followup_due','Follow-up due'],
  ['revisit_due','Return visit due'],
  ['callback_due','Customer callback'],
  ['awaiting_parts','Waiting for parts'],
  ['feedback_pending','Awaiting feedback'],
  ['priority_urgent','Urgent open jobs']
])
const TERMINAL=new Set(['completed','cancelled'])
const due=(value,now)=>value!=null&&value!==''&&Number.isFinite(Date.parse(value))&&Date.parse(value)<now
const text=value=>typeof value==='string'?value:''
export function computeServiceOperations(jobs,technicians,feedback,{now=Date.now()}={}){
  if(!Array.isArray(jobs)||!Array.isArray(technicians)||!Array.isArray(feedback))throw Error('Expected live service lists')
  if(!Number.isFinite(now))throw Error('Clock is invalid')
  const feedbackIds=new Set(feedback.map(x=>x.service_job_id))
  const flagsByJob={}
  const counters=Object.fromEntries(FIELD_FILTERS.map(([key])=>[key,0]))
  const workByTechnician=new Map(technicians.map(t=>[t.id,{
    id:t.id,name:text(t.name)||'Unnamed technician',active:t.active!==false,
    open:0,attention:0,scheduled:0,completed:0
  }]))
  const enriched=jobs.map(job=>{
    const id=text(job.id)
    const active=!TERMINAL.has(job.status)
    const assigned=Boolean(job.assigned_technician_id)
    const flags={
      unassigned:active&&!assigned,
      missed_visit:active&&due(job.scheduled_at,now)&&!job.visit_started_at,
      followup_due:active&&due(job.follow_up_at,now),
      revisit_due:job.status!=='cancelled'&&job.resolution_status==='return_visit_required'&&due(job.next_visit_at,now),
      callback_due:job.callback_required===true&&(!job.callback_at||due(job.callback_at,now)),
      awaiting_parts:active&&(job.resolution_status==='awaiting_parts'||job.status==='on_hold'),
      feedback_pending:job.status==='completed'&&!feedbackIds.has(id),
      priority_urgent:active&&job.priority==='urgent'
    }
    flags.attention=Object.values(flags).some(Boolean)
    flagsByJob[id]=flags
    counters.all++
    for(const key of Object.keys(flags))if(key in counters&&flags[key])counters[key]++
    if(assigned){
      const bucket=workByTechnician.get(job.assigned_technician_id)||{
        id:job.assigned_technician_id,name:'Unlisted technician',active:false,
        open:0,attention:0,scheduled:0,completed:0
      }
      if(active)bucket.open++
      if(active&&flags.attention)bucket.attention++
      if(active&&job.scheduled_at)bucket.scheduled++
      if(job.status==='completed')bucket.completed++
      workByTechnician.set(bucket.id,bucket)
    }
    return {...job,operations:flags}
  })
  const order=['missed_visit','callback_due','revisit_due','unassigned','followup_due','awaiting_parts','priority_urgent','feedback_pending']
  enriched.sort((a,b)=>{
    const ai=order.findIndex(k=>a.operations[k])
    const bi=order.findIndex(k=>b.operations[k])
    if(ai!==bi)return (ai===-1?99:ai)-(bi===-1?99:bi)
    const priority={urgent:0,high:1,normal:2,low:3}
    if((priority[a.priority]??9)!==(priority[b.priority]??9))
      return (priority[a.priority]??9)-(priority[b.priority]??9)
    return (Date.parse(a.scheduled_at||a.created_at)||0)-(Date.parse(b.scheduled_at||b.created_at)||0)
  })
  const engineers=[...workByTechnician.values()].sort((a,b)=>
    b.attention-a.attention||b.open-a.open||a.name.localeCompare(b.name))
  return {jobs:enriched,flagsByJob,counters,engineers,
    activeCount:jobs.filter(j=>!TERMINAL.has(j.status)).length,
    completedCount:jobs.filter(j=>j.status==='completed').length,
    attentionCount:enriched.filter(j=>j.operations.attention).length}
}
export function boardMatches(job,filter){
  if(filter==='all')return true
  if(filter.startsWith('engineer:'))return job.assigned_technician_id===filter.slice(9)
  return job.operations?.[filter]===true
}
