import { createConfiguredSupabaseClient } from './supabase-client.js';

const $=selector=>document.querySelector(selector);
let client=null;
function show(id){['#resetLoading','#resetFormState','#resetSuccess','#resetError'].forEach(sel=>{const el=$(sel);if(el)el.hidden=sel!==id;});}
function message(text,type='error'){const el=$('#resetMessage');if(!el)return;el.textContent=text;el.className=`form-message ${type}`;}
function stripSensitiveUrl(){try{history.replaceState({},document.title,'/auth/reset-password');}catch{}}

async function prepareRecovery(){
  try{
    client=createConfiguredSupabaseClient(globalThis);
    const params=new URLSearchParams(location.search);
    if(params.get('error')||params.get('error_code')){stripSensitiveUrl();show('#resetError');return;}
    const code=params.get('code');
    if(code){const {error}=await client.auth.exchangeCodeForSession(code);if(error)throw error;}
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    stripSensitiveUrl();
    if(!data?.session){show('#resetError');return;}
    show('#resetFormState');
  }catch{stripSensitiveUrl();show('#resetError');}
}

$('#resetPasswordForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const password=$('#newPassword').value,confirmPassword=$('#confirmNewPassword').value;
  if(password.length<8){message('Use at least 8 characters for your new password.');return;}
  if(password!==confirmPassword){message('Passwords do not match.');return;}
  message('Updating password…','success');
  try{
    const {error}=await client.auth.updateUser({password});
    if(error)throw error;
    await client.auth.signOut();
    show('#resetSuccess');
  }catch(error){message(error?.message||'Password could not be updated. Request a new reset link and try again.');}
});

prepareRecovery();
