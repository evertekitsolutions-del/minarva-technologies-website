export async function requireActiveAdmin(supabase,{redirect='/admin',userLine=null}={}){
  const {data:{user},error:userError}=await supabase.auth.getUser()
  if(userError||!user){location.replace(redirect);return null}
  const {data:admin,error}=await supabase.from('admin_users').select('email,role,active').eq('user_id',user.id).maybeSingle()
  if(error||!admin||admin.active!==true){try{await supabase.auth.signOut({scope:'local'})}catch{};location.replace(redirect);return null}
  if(userLine) userLine.textContent=(admin.email||user.email||'')+' • '+admin.role
  return {user,admin}
}