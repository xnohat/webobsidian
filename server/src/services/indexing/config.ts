export function indexingConfig(env: NodeJS.ProcessEnv = process.env) {
  function positive(name:string, fallback:number) {
    const n=env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isSafeInteger(n) || n<=0 || n>2147483647) throw new Error(`${name} must be a positive integer`);
    return n;
  }
  const mode=env.WEBOBSIDIAN_WATCH?.toLowerCase() ?? 'auto';
  if (!['auto','polling'].includes(mode)) throw new Error('WEBOBSIDIAN_WATCH must be auto or polling');
  return {polling:mode==='polling', reconcileMs:positive('WEBOBSIDIAN_RECONCILE_INTERVAL_MS',60000),auditMs:positive('WEBOBSIDIAN_HASH_AUDIT_INTERVAL_MS',1800000)};
}
