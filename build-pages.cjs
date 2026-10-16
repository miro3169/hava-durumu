const fs=require('fs'),path=require('path'),esbuild=require('esbuild');const root=__dirname;const dest=path.join(root,'docs');const base='/hava-durumu/';const cloud=JSON.parse(fs.readFileSync(path.join(root,'cloud-config.json'),'utf8').replace(/^\uFEFF/,''));if(!cloud.publishableKey?.startsWith('sb_publishable_'))throw Error('A public publishable key is required');
fs.mkdirSync(dest,{recursive:true});
const routes={'/':base,'/login':base+'login.html','/signup':base+'signup.html','/verify':base+'verify.html','/dashboard':base+'dashboard.html'};
function transform(text){return text.replace(/(["'`])(\/(?!\/)[^"'`\s<>]*)\1/g,(full,quote,url)=>{if(url.startsWith('/api')||url==='/me'||url.startsWith('/favorites')||url==='/logout'||url==='/scoreboard')return full;if(url.startsWith('/icons.svg#'))return quote+base+url.slice(1)+quote;const q=url.indexOf('?');const pathname=q<0?url:url.slice(0,q);const suffix=q<0?'':url.slice(q);return quote+(routes[pathname]||base+pathname.slice(1))+suffix+quote;});}
for(const file of fs.readdirSync(path.join(root,'public'))){const source=fs.readFileSync(path.join(root,'public',file));if(file.endsWith('.html'))continue;if(/\.(js|css|svg)$/.test(file))fs.writeFileSync(path.join(dest,file),transform(source.toString()));}
fs.writeFileSync(path.join(dest,'auth.js'),transform(fs.readFileSync(path.join(root,'auth.js'),'utf8').replace('this.api("/login"','this.api("__AUTH_LOGIN__"').replace('this.api("/signup"','this.api("__AUTH_SIGNUP__"')).replace('__AUTH_LOGIN__','/login').replace('__AUTH_SIGNUP__','/signup'));
fs.writeFileSync(path.join(dest,'config.js'),`const APP_CONFIG={USE_SERVER:true,OWM_KEY:'',MODE:'free',REQUIRE_LOGIN:true,LOGIN_PAGE:'${base}login.html',SIGNUP_PAGE:'${base}signup.html',HOME_PAGE:'${base}dashboard.html'};\nwindow.HAVA_CLOUD=${JSON.stringify({...cloud,base})};`);
for(const [input,output]of [['public/home.html','index.html'],['index.html','dashboard.html'],['public/login.html','login.html'],['public/signup.html','signup.html'],['public/verify.html','verify.html'],['public/404.html','404.html']]){
let html=transform(fs.readFileSync(path.join(root,input),'utf8'));html=html.replace(/<script src="config.js"><\/script>/g,'');html=html.replace('<head>','<head><script src="'+base+'config.js"></script><script src="'+base+'cloud.js"></script>');
// Supabase OTP length is configured by the project; allow its supported 6–10 digit codes.
if(output==='verify.html')html=html.replaceAll('6 haneli','e-postandaki').replace('pattern="[0-9]{6}"','pattern="[0-9]{6,10}"').replace('maxlength="6"','maxlength="10"').replace('Kod 10 dakika geçerlidir.','Kodun süresi dolduysa yeni kod iste.');
if(output==='dashboard.html')html=html.replace('new URLSearchParams({path:', 'new URLSearchParams({path:');
fs.writeFileSync(path.join(dest,output),html);
}
esbuild.buildSync({entryPoints:[path.join(root,'cloud-browser.js')],bundle:true,minify:true,platform:'browser',target:'es2022',outfile:path.join(dest,'cloud.js'),legalComments:'none'});
fs.writeFileSync(path.join(dest,'.nojekyll'),'');console.log('Built GitHub Pages frontend in docs/');
