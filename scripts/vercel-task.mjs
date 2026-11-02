// Uses the user's existing Vercel CLI login; never prints credentials.
import {readFile} from 'node:fs/promises';
const auth=JSON.parse(await readFile(process.env.HOME+'/Library/Application Support/com.vercel.cli/auth.json','utf8'));
const [method='GET',path='/v9/projects',bodyFile]=process.argv.slice(2);
const response=await fetch('https://api.vercel.com'+path,{method,headers:{Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'},...(bodyFile?{body:await readFile(bodyFile,'utf8')}:{})});
const data=await response.json();if(!response.ok){console.error(JSON.stringify(data));process.exit(1)}
if(path.startsWith('/v9/projects')&&method==='GET')console.log(JSON.stringify(data.projects?.map(p=>({id:p.id,name:p.name,accountId:p.accountId,link:p.link,latestDeployments:p.latestDeployments?.map(d=>({id:d.id,url:d.url,readyState:d.readyState,meta:d.meta}))}))??{id:data.id,name:data.name,accountId:data.accountId,link:data.link,ssoProtection:data.ssoProtection,passwordProtection:data.passwordProtection},null,2));else console.log(JSON.stringify(data,null,2));
