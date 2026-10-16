// Supabase Edge Function: hava-api. Credentials are read only from private secrets.
const apiUrl=Deno.env.get('SUPABASE_URL');
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const weatherKey=Deno.env.get('OWM_KEY');
const origin='https://miro3169.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json','Vary':'Origin'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
async function db(path,options={}){return fetch(apiUrl+'/rest/v1/'+path,{...options,headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json',...options.headers}});}
async function budget(key,max,seconds){const r=await db('rpc/hava_take_budget',{method:'POST',body:JSON.stringify({budget_key:key,max_count:max,window_seconds:seconds})});return r.ok&&(await r.json())===true;}
async function getWeather(path,params){
 const safe=new URLSearchParams();
 for(const key of ['lat','lon']){const raw=params.get(key);if(raw!==null){const v=Number(raw);if(!Number.isFinite(v)||Math.abs(v)>(key==='lat'?90:180))throw {status:400,message:'Koordinat geçersiz.'};safe.set(key,String(Math.round(v*100)/100));}}
 if(params.has('q')){const q=params.get('q').trim().slice(0,80);if(!q)throw {status:400,message:'Şehir gir.'};safe.set('q',q);}
 safe.set('limit','1');if(path.includes('weather')||path.includes('forecast')){safe.set('units','metric');safe.set('lang','tr');}
 const cacheKey=path+'?'+safe;const cache=await db('hava_cache?key=eq.'+encodeURIComponent(cacheKey)+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=body');
 if(cache.ok){const rows=await cache.json();if(rows[0])return rows[0].body;}
 if(!await budget('upstream-minute',45,60)||!await budget('upstream-day',900,86400))throw {status:429,message:'Hava servisi istek sınırına ulaştı. Biraz sonra tekrar dene.'};
 safe.set('appid',weatherKey);const r=await fetch('https://api.openweathermap.org/'+path+'?'+safe,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw {status:503,message:'Hava verisi şu anda alınamıyor.'};const body=await r.json();
 await db('hava_cache?on_conflict=key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({key:cacheKey,body,expires_at:new Date(Date.now()+600000).toISOString()})});return body;
}
const cities=[['İstanbul','TR',41.0082,28.9784],['Ankara','TR',39.9334,32.8597],['İzmir','TR',38.4237,27.1428],['Antalya','TR',36.8969,30.7133],['Erzurum','TR',39.9043,41.2679],['Kars','TR',40.6013,43.0975],['Reykjavik','IS',64.1466,-21.9426],['Dubai','AE',25.2048,55.2708],['Singapur','SG',1.3521,103.8198],['Londra','GB',51.5072,-.1276],['New York','US',40.7128,-74.006],['Tokyo','JP',35.6762,139.6503]];
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='GET')return json({error:'Yöntem desteklenmiyor.'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return json({error:'İzin verilmeyen kaynak.'},403);
 try{
 const authorization=req.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return json({error:'Giriş yapmalısın.'},401);
 const userResponse=await fetch(apiUrl+'/auth/v1/user',{headers:{apikey:serviceKey,Authorization:authorization}});
 if(!userResponse.ok)return json({error:'Oturum geçersiz.'},401);const user=await userResponse.json();if(!user.email_confirmed_at)return json({error:'E-postanı doğrula.'},403);
 if(!await budget('user:'+user.id,40,60))return json({error:'Çok fazla istek. Bir dakika bekle.'},429);
 if(!weatherKey)return json({error:'Hava servisi yapılandırılmadı.'},503);
 const params=new URL(req.url).searchParams,path=params.get('path')||'';
 if(path==='scoreboard'){
 const results=await Promise.allSettled(cities.map(async([name,country,lat,lon])=>{const data=await getWeather('data/2.5/weather',new URLSearchParams({lat:String(lat),lon:String(lon)}));return {name,country,lat,lon,temp:data.main.temp,id:data.weather[0].id,observedAt:data.dt}}));const rows=results.filter(r=>r.status==='fulfilled').map(r=>r.value);if(!rows.length)return json({error:'Skor tablosu alınamadı.'},503);return json({cities:rows,total:cities.length,fetchedAt:Date.now()});
 }
 const allowed=new Set(['geo/1.0/direct','geo/1.0/reverse','data/2.5/weather','data/2.5/forecast','data/2.5/air_pollution']);
 const upstream=path.replace(/^owm\//,'');if(!path.startsWith('owm/')||!allowed.has(upstream))return json({error:'Bulunamadı.'},404);
 return json(await getWeather(upstream,params));
 }catch(error){return json({error:error.status?error.message:'İşlem tamamlanamadı.'},error.status||503)}
});
