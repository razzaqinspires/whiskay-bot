import { createServer } from 'node:http';
import { createAdzanEngine } from './engine.mjs';
import { ValidationError } from './errors.mjs';
export function createAdzanApi({ engine, engineOptions, authorize = null } = {}) {
  const instance=engine??createAdzanEngine(engineOptions??{});
  return createServer(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
    try{
      if(authorize && !(await authorize(req))) return send(401,{error:'UNAUTHORIZED'});
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&url.pathname==='/health')return send(200,{status:'ok',service:'razzaq-adzan-engine',version:'1.3.0'});
      if(req.method==='GET'&&url.pathname==='/v1/prayer-times') {const date=url.searchParams.get('date');if(!date)return send(400,{error:'date query parameter is required'});return send(200,instance.getSchedule({date}));}
      if(req.method==='GET'&&url.pathname==='/v1/qibla')return send(200,instance.getQibla());
      return send(404,{error:'NOT_FOUND'});
    }catch(error){return send(error instanceof ValidationError?400:500,{error:error.code??'INTERNAL_ERROR',message:error.message});}
  });
}
