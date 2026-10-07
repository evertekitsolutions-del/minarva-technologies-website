const DEFAULT_IDLE_MS=30*60*1000
const DEFAULT_RECHECK_MS=5*60*1000
const ACTIVITY_KEY='minarva_admin_last_activity'

export function installAdminSessionGuard(supabase,{idleMs=DEFAULT_IDLE_MS,recheckMs=DEFAULT_RECHECK_MS,redirect='/admin'}={}){
  let stopped=false
  let checking=false
  const now=()=>Date.now()
  const readLast=()=>Number(sessionStorage.getItem(ACTIVITY_KEY)||0)
  const touch=()=>sessionStorage.setItem(ACTIVITY_KEY,String(now()))
  const redirectOut=async()=>{
    if(stopped)return
    stopped=true
    try{await supabase.auth.signOut({scope:'local'})}catch{}
    location.replace(redirect)
  }
  const validate=async()=>{
    if(stopped||checking)return
    checking=true
    try{
      const last=readLast()
      if(last&&now()-last>idleMs){await redirectOut();return}
      const {data:{user},error:userError}=await supabase.auth.getUser()
      if(userError||!user){await redirectOut();return}
      const {data,error}=await supabase.from('admin_users').select('active').eq('user_id',user.id).maybeSingle()
      if(error||!data||data.active!==true){await redirectOut()}
    }finally{checking=false}
  }
  if(!readLast())touch()
  ;['pointerdown','keydown','touchstart'].forEach(event=>window.addEventListener(event,touch,{passive:true}))
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')validate()})
  const timer=setInterval(validate,recheckMs)
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true})
  supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')location.replace(redirect)})
  validate()
  return {validate,stop(){stopped=true;clearInterval(timer)}}
}
