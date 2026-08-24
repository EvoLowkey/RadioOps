export function validateRuntimeConfig(config={}) {
  const url=String(config.SUPABASE_URL||'').trim();
  const key=String(config.SUPABASE_ANON_KEY||'').trim();
  const urlOk=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url);
  return {ok:Boolean(urlOk&&key),SUPABASE_URL:url,SUPABASE_ANON_KEY:key};
}

export function getRuntimeConfig(source=globalThis) {
  const cfg=source?.RADIOOPS_CONFIG || source?.window?.RADIOOPS_CONFIG || {};
  return validateRuntimeConfig(cfg);
}
