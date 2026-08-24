import { getRuntimeConfig } from './config.js';

export function createConfiguredSupabaseClient(source=globalThis){
  const config=getRuntimeConfig(source);
  if(!config.ok) throw Object.assign(new Error('RadioOps is not connected to Supabase yet.'),{code:'CONFIG_MISSING'});
  const factory=source?.supabase?.createClient ?? source?.window?.supabase?.createClient;
  if(typeof factory!=='function') throw Object.assign(new Error('Supabase client library did not load.'),{code:'CLIENT_MISSING'});
  return factory(config.SUPABASE_URL,config.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
}
