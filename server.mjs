import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {planDay,menuUrl} from './planner.mjs';
import {calendarRoute} from './calendar.mjs';
const port=Number(process.env.PORT||3210);
const publicFiles={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
export const server=http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return send(403,{error:'Local access only.'});
    const url=new URL(req.url,`http://127.0.0.1:${port}`);
    if(await calendarRoute(req,res,url,send,port))return;
    if(req.method==='GET' && url.pathname==='/api/menu') {
      const source=menuUrl(url.searchParams.get('date'));
      try {
        const upstream=await fetch(source,{signal:AbortSignal.timeout(12000),redirect:'error'});
        const html=await upstream.text();
        const failed=!upstream.ok || /Server Error|Runtime Error/i.test(html);
        return send(200,{status:failed?'unavailable':'needs-verification',source,checkedAt:new Date().toISOString(),items:[],message:failed?'UCSC returned an error. No menu items were imported.':'Menu page reached. Automatic nutrient extraction is not yet verified; open the official menu and add confirmed entries below.'});
      }catch {return send(200,{status:'unavailable',source,items:[],checkedAt:new Date().toISOString(),message:'Unable to reach UCSC. No menu items were imported. Use the official menu or enter verified foods.'});}
    }
    if(req.method==='POST' && url.pathname==='/api/plan') {
      if(req.headers.origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin)) return send(403,{error:'Local requests only.'});
      let body=''; for await(const chunk of req){body+=chunk;if(body.length>250000)return send(413,{error:'Plan too large.'});}
      return send(200,planDay(JSON.parse(body)));
    }
    if(req.method==='GET' && publicFiles[url.pathname]) {
      const [file,type]=publicFiles[url.pathname];
      res.writeHead(200,{'Content-Type':type,'Content-Security-Policy':"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});
      return res.end(await readFile(new URL(`./${file}`,import.meta.url)));
    }
    send(404,{error:'Not found.'});
  }catch(e){send(400,{error:e.message});}
});
if(process.argv[1]===fileURLToPath(import.meta.url)) server.listen(port,'127.0.0.1',()=>console.log(`College Bulk Planner: http://127.0.0.1:${port}`));

