// Explain release eligibility in admin UI. The database, not this module,
// authorizes release; administrators must review actual backup restore evidence.
const TYPES=new Set(['database_restore','full_recovery'])
const ENVIRONMENTS=new Set(['non-production','staging','uat','isolated-restore'])
const trim=v=>typeof v==='string'?v.trim():''
export function qualifiesDatabaseRecovery(d){
  if(!d||d.status!=='passed'||!TYPES.has(d.drill_type)||
    !ENVIRONMENTS.has(trim(d.environment).toLowerCase())||
    !trim(d.recovery_point)||!trim(d.evidence_reference))return false
  const from=Date.parse(d.started_at),to=Date.parse(d.completed_at)
  return Number.isFinite(from)&&Number.isFinite(to)&&to>from
}
export function validateRecoveryDrillInput(d){
  if(!d||!ENVIRONMENTS.has(trim(d.environment).toLowerCase()))
    return {ok:false,reason:'A dedicated non-production environment is required.'}
  if(!Number.isFinite(Date.parse(d.started_at)))
    return {ok:false,reason:'Actual or planned start time is required.'}
  if(d.completed_at&&!Number.isFinite(Date.parse(d.completed_at)))
    return {ok:false,reason:'Invalid completion time.'}
  if(d.status==='passed'){
    if(!Number.isFinite(Date.parse(d.completed_at))||
       Date.parse(d.completed_at)<=Date.parse(d.started_at))
      return {ok:false,reason:'Passed drills require an end time later than their start.'}
    if(!trim(d.evidence_reference))
      return {ok:false,reason:'Passed drills require an actual evidence reference.'}
    if(TYPES.has(d.drill_type)&&!trim(d.recovery_point))
      return {ok:false,reason:'A passed database/full restore must identify its actual backup point.'}
  }
  return {ok:true}
}
