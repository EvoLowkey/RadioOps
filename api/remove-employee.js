function json(res,status,body){
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  return res.end(JSON.stringify(body));
}

async function readJson(response){
  const text=await response.text();
  if(!text)return null;
  try{return JSON.parse(text);}catch{return {message:text};}
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});

  const url=process.env.SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization=req.headers.authorization || req.headers.Authorization;
  if(!url || !serviceKey)return json(res,500,{error:'Employee removal is not configured on the server'});
  if(!authorization || !/^Bearer\s+\S+/i.test(authorization))return json(res,401,{error:'Authentication required'});

  const targetId=String(req.body?.profileId || '').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(targetId))return json(res,400,{error:'Valid employee profile ID required'});

  const commonHeaders={apikey:serviceKey,Authorization:authorization};
  const authUserResponse=await fetch(`${url}/auth/v1/user`,{headers:commonHeaders});
  const authUser=await readJson(authUserResponse);
  if(!authUserResponse.ok || !authUser?.id)return json(res,401,{error:'Manager session is no longer valid'});

  const callerResponse=await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,role,is_active,approval_status`,{headers:{...commonHeaders,Accept:'application/json'}});
  const callerRows=await readJson(callerResponse);
  const caller=Array.isArray(callerRows)?callerRows[0]:null;
  if(!callerResponse.ok || !caller || caller.role!=='MANAGER' || !caller.is_active || caller.approval_status!=='ACTIVE'){
    return json(res,403,{error:'Permission denied: active Manager required'});
  }

  const targetResponse=await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(targetId)}&select=id,role,approval_status`,{headers:{...commonHeaders,Accept:'application/json'}});
  const targetRows=await readJson(targetResponse);
  const target=Array.isArray(targetRows)?targetRows[0]:null;
  if(!targetResponse.ok || !target)return json(res,404,{error:'Employee profile not found'});
  if(target.role==='MANAGER')return json(res,400,{error:'Managers cannot be removed from employee administration'});

  // The RPC performs the authoritative open-assignment check, archives the
  // employee profile, and writes the audit event before the Auth login is deleted.
  const archiveResponse=await fetch(`${url}/rest/v1/rpc/archive_employee_for_removal`,{
    method:'POST',
    headers:{...commonHeaders,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({p_profile_id:targetId})
  });
  const archived=await readJson(archiveResponse);
  if(!archiveResponse.ok){
    const message=archived?.message || archived?.error || 'Employee could not be removed';
    const status=/open assignment|assigned radio|return/i.test(message)?409:400;
    return json(res,status,{error:message});
  }

  const deleteResponse=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(targetId)}`,{
    method:'DELETE',
    headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,Accept:'application/json'}
  });
  if(!deleteResponse.ok){
    const details=await readJson(deleteResponse);
    return json(res,502,{error:'Employee access was revoked, but Supabase Auth cleanup failed. Contact an administrator.',details:details?.message||null});
  }

  return json(res,200,{ok:true,profile:archived});
}
