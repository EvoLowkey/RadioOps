import { createConfiguredSupabaseClient } from './supabase-client.js';

const $=selector=>document.querySelector(selector);
function show(id){['#callbackLoading','#callbackSuccess','#callbackError'].forEach(sel=>{const el=$(sel);if(el)el.hidden=sel!==id;});}
function stripSensitiveUrl(){try{history.replaceState({},document.title,'/auth/callback');}catch{}}

async function finishVerification(){
  try{
    const client=createConfiguredSupabaseClient(globalThis);
    const params=new URLSearchParams(location.search);
    const error=params.get('error') || params.get('error_code');
    if(error){stripSensitiveUrl();show('#callbackError');return;}
    const code=params.get('code');
    if(code){
      const {error:exchangeError}=await client.auth.exchangeCodeForSession(code);
      if(exchangeError) throw exchangeError;
    }
    const {data,error:sessionError}=await client.auth.getSession();
    if(sessionError) throw sessionError;
    stripSensitiveUrl();
    if(data?.session?.user?.email_confirmed_at || data?.session?.user?.confirmed_at || data?.session) show('#callbackSuccess');
    else show('#callbackError');
  }catch{stripSensitiveUrl();show('#callbackError');}
}
finishVerification();
