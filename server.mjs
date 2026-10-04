import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {planDay} from './planner.mjs';
import {calendarRoute} from './calendar.mjs';
import {getMenu,getDashboard,getLocations} from './menus.mjs';
import {getDaySchedule,getServingStatus} from './dining-hours.mjs';
const port=Number(process.env.PORT||3210);
const publicFiles={'/menus-ui.js':['menus-ui.js','text/javascript'],'/':['local/index.html','text/html'],'/app.js':['local/app.js','text/javascript'],'/style.css':['local/style.css','text/css']};
export const server=http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return send(403,{error:'Local access only.'});
    const url=new URL(req.url,`http://127.0.0.1:${port}`);
    if(await calendarRoute(req,res,url,send,port))return;
    if(req.method==='GET' && url.pathname==='/api/halls')return send(200,await getLocations());
    if(req.method==='GET' && url.pathname==='/api/dashboard'){
      try{
        const date=url.searchParams.get('date');
        const data=await getDashboard(date);
        data.locations=data.locations.map(location=>({...location,schedule:getDaySchedule(date,location.id),serving:getServingStatus(date,location.id)}));
        return send(200,data);
      }catch(e){return send(502,{status:'unavailable',locations:[],availableDates:[],message:e.message});}
    }
    if(req.method==='GET' && url.pathname==='/api/menu') {
      try { return send(200,await getMenu(url.searchParams.get('date'),url.searchParams.get('hall')||'40',url.searchParams.get('meal'))); }
      catch(e){return send(502,{status:'unavailable',items:[],message:e.message});}
    }
    if(req.method==='POST' && url.pathname==='/api/plan') {
      if(req.headers.origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin)) return send(403,{error:'Local requests only.'});
      let body=''; for await(const chunk of req){body+=chunk;if(body.length>250000)return send(413,{error:'Plan too large.'});}
      return send(200,planDay(JSON.parse(body)));
    }
    if(req.method==='GET' && publicFiles[url.pathname]) {
      const [file,type]=publicFiles[url.pathname];
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});
      return res.end(await readFile(new URL(`./${file}`,import.meta.url)));
    }
    send(404,{error:'Not found.'});
  }catch(e){send(400,{error:e.message});}
});
if(process.argv[1]===fileURLToPath(import.meta.url)) server.listen(port,'127.0.0.1',()=>console.log(`College Bulk Planner: http://127.0.0.1:${port}`));
