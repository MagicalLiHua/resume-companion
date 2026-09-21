/** These process settings exist only in isolated regression harnesses. Tool
 * arguments (including test_mode) cannot enable diagnostics on a real site. */
export function fixtureDiagnosticsAllowed(url:string,env:NodeJS.ProcessEnv=process.env):boolean {
  if(env.RESUME_COMPANION_TEST_DIAGNOSTICS!=='1'||env.RESUME_COMPANION_CHROME_HEADLESS!=='1'||env.RESUME_COMPANION_SUPERVISOR_EPHEMERAL!=='1')return false;
  try {const u=new URL(url);return u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.protocol==='data:'||url==='about:blank';}
  catch{return false;}
}
