import { createClient } from '@supabase/supabase-js';
const nativeFetch=window.fetch.bind(window);
const client=createClient(window.HAVA_CLOUD.url,window.HAVA_CLOUD.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'hava-cloud-session'}});
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const publicUser=user=>({id:user.id,name:user.user_metadata?.name||'Hava kullanıcısı',email:user.email});
const messages={invalid_credentials:'E-posta veya şifre hatalı.',email_not_confirmed:'Önce e-posta adresini doğrula.',otp_expired:'Kod geçersiz veya süresi dolmuş.',over_email_send_rate_limit:'Çok fazla e-posta isteği. Biraz sonra tekrar dene.',user_already_exists:'Bu e-posta ile bir hesap zaten var.',email_address_invalid:'Geçerli bir e-posta adresi gir.'};
window.fetch=async(input,options={})=>{
 const raw=typeof input==='string'?input:input.url;const url=new URL(raw,location.href);
 if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
 try{
 const route=url.pathname.slice(4),method=options.method||'GET',body=options.body?JSON.parse(options.body):{};
 let result;
 if(route==='/signup'){
  if(!body.name?.trim()||body.name.length>60||!body.email||body.password?.length<8||body.password?.length>72)return respond({error:'İsim, e-posta ve en az 8 karakterlik şifre gir.'},400);
  const {data,error}=await client.auth.signUp({email:body.email,password:body.password,options:{data:{name:body.name.trim()},emailRedirectTo:location.origin+window.HAVA_CLOUD.base+'verify.html'}});
  if(error)throw error;
  if(data.session)return respond({user:publicUser(data.user)});
  return respond({verificationRequired:true,email:body.email},201);
 }
 if(route==='/login'){
  const {data,error}=await client.auth.signInWithPassword({email:body.email,password:body.password});
  if(error){if(error.code==='email_not_confirmed')return respond({error:messages.email_not_confirmed,verificationRequired:true,email:body.email},403);throw error;}
  return respond({user:publicUser(data.user)});
 }
 if(route==='/verify-email'){
  const {data,error}=await client.auth.verifyOtp({email:body.email,token:body.code,type:'email'});if(error)throw error;return respond({user:publicUser(data.user)});
 }
 if(route==='/resend-code'){const {error}=await client.auth.resend({type:'signup',email:body.email});if(error)throw error;return respond({message:'Hesabın doğrulanmamışsa yeni kod gönderildi.'});}
 if(route==='/logout'){const {error}=await client.auth.signOut();if(error)throw error;return respond({ok:true});}
 const {data:{user},error}=await client.auth.getUser();if(error||!user||!user.email_confirmed_at)return respond({error:'Giriş yap ve e-postanı doğrula.'},401);
 if(route==='/me')return respond({user:publicUser(user)});
 if(route==='/favorites'&&method==='GET'){result=await client.from('favorites').select('id,name,country,lat,lon').order('id',{ascending:false});if(result.error)throw result.error;return respond({favorites:result.data});}
 if(route==='/favorites'&&method==='POST'){
  if(!body.name||body.name.length>80||!Number.isFinite(body.lat)||Math.abs(body.lat)>90||!Number.isFinite(body.lon)||Math.abs(body.lon)>180)return respond({error:'Şehir bilgileri geçersiz.'},400);
  result=await client.from('favorites').insert({user_id:user.id,name:body.name,country:body.country||'',lat:body.lat,lon:body.lon}).select('id,name,country,lat,lon').single();
  if(result.error?.code==='23505')return respond({ok:true});if(result.error)throw result.error;return respond({favorite:result.data},201);
 }
 if(route.startsWith('/favorites/')&&method==='DELETE'){result=await client.from('favorites').delete().eq('id',route.split('/').pop()).eq('user_id',user.id);if(result.error)throw result.error;return respond({ok:true});}
 if(route.startsWith('/owm/')||route==='/scoreboard'){
  const {data:{session}}=await client.auth.getSession();
  return nativeFetch(window.HAVA_CLOUD.url+'/functions/v1/hava-api?'+new URLSearchParams({path:route.slice(1),...Object.fromEntries(url.searchParams)}),{headers:{apikey:window.HAVA_CLOUD.publishableKey,Authorization:'Bearer '+session.access_token}});
 }
 return respond({error:'Bulunamadı.'},404);
 }catch(error){return respond({error:messages[error.code]||'İşlem tamamlanamadı. Bilgilerini kontrol edip daha sonra tekrar dene.'},error.status||400);}
};
window.addEventListener('storage',event=>{if(event.key==='hava-cloud-session'&&!event.newValue&&location.pathname.endsWith('dashboard.html'))location.replace(window.HAVA_CLOUD.base+'login.html')});
