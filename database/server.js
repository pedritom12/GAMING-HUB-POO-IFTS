// Servidor sin dependencias externas; Node.js 20 o superior.
// Datos privados guardados localmente en database/data (no subir a Git).
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const FRONT = path.resolve(__dirname, '../front');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'gaminghub.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const sessions = new Map(); // sesiones en memoria: se invalidan si se reinicia el servidor
const MAX_BODY = 1024 * 1024;
const loginAttempts = new Map();
const COOKIE_NAME = 'gaminghub_session';
fs.mkdirSync(DATA_DIR, {recursive:true});
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({users:[],libraries:[],games:[]}, null, 2));
function readDb(){const db=JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); return db;}
function saveDb(db){const tmp=DATA_FILE+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(db,null,2)); fs.renameSync(tmp,DATA_FILE);}
function send(res, code, payload){res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));}
function error(res, status, message){send(res,status,{error:message});}
async function body(req){return new Promise((resolve,reject)=>{let str='';req.on('data',c=>{str+=c;if(str.length>MAX_BODY){reject(Object.assign(new Error('Solicitud demasiado grande'),{status:413}));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(str||'{}'));}catch{reject(Object.assign(new Error('JSON inválido'),{status:400}));}});req.on('error',reject);});}
function hashPassword(password, salt=crypto.randomBytes(16).toString('hex')) {return {salt, hash:crypto.scryptSync(password,salt,64).toString('hex')};}
function safeCompare(password,user){const result=hashPassword(password,user.salt);return crypto.timingSafeEqual(Buffer.from(result.hash,'hex'),Buffer.from(user.hash,'hex'));}
function sessionToken(req){const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE_NAME+'='));return cookie?cookie.slice(COOKIE_NAME.length+1):'';}
function tokenUser(req,db){const token=sessionToken(req);const session=sessions.get(token);if(!session || session.expires<Date.now()){sessions.delete(token);return null;}return db.users.find(u=>u.id===session.userId)||null;}
function publicUser(u){return {id:u.id,username:u.username,email:u.email};}
function cookieHeader(token,req,age=28800){const secure=req.socket.encrypted?' Secure;':'';return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age};${secure}`;}
function login(req,res,user){const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{userId:user.id,expires:Date.now()+8*60*60*1000});res.setHeader('Set-Cookie',cookieHeader(token,req));send(res,200,{user:publicUser(user)});}
function string(v,max=120){return typeof v==='string'?v.trim().slice(0,max):'';}
function validUrl(v){if(!v)return '';try{const u=new URL(v);return (u.protocol==='https:'||u.protocol==='http:')?u.href:'';}catch{return '';}}
function requireAuth(req,res,db){const user=tokenUser(req,db);if(!user)error(res,401,'Necesitás iniciar sesión');return user;}
async function api(req,res,url){
 const db=readDb(),route=url.pathname,method=req.method;
 if(route==='/api/health' && method==='GET')return send(res,200,{ok:true,service:'GamingHub'});
 if(route==='/api/register' && method==='POST'){
  const data=await body(req),username=string(data.username,30),email=string(data.email,120).toLowerCase(),password=data.password;
  if(!/^[a-zA-Z0-9_.-]{3,30}$/.test(username))return error(res,400,'Usuario: entre 3 y 30 caracteres, letras, números, punto, guion o guion bajo');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return error(res,400,'Email inválido');
  if(typeof password!=='string'||password.length<8||password.length>128)return error(res,400,'La contraseña debe tener entre 8 y 128 caracteres');
  if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase()||u.email===email))return error(res,409,'El usuario o email ya está registrado');
  const u={id:crypto.randomUUID(),username,email,...hashPassword(password)};db.users.push(u);saveDb(db);return login(req,res,u);
 }
 if(route==='/api/login'&&method==='POST'){
  const data=await body(req),id=string(data.username,120).toLowerCase(),pw=data.password;
  const u=db.users.find(x=>x.username.toLowerCase()===id||x.email===id);
  const key=String(req.socket.remoteAddress||'local')+':'+id;const attempt=loginAttempts.get(key);
  if(attempt&&attempt.count>=8&&Date.now()-attempt.since<15*60*1000)return error(res,429,'Demasiados intentos. Intentá nuevamente en 15 minutos.');
  if(!u||typeof pw!=='string'||!safeCompare(pw,u)){const fresh=attempt&&Date.now()-attempt.since<15*60*1000?attempt:{count:0,since:Date.now()};fresh.count++;loginAttempts.set(key,fresh);return error(res,401,'Usuario o contraseña incorrectos');}
  loginAttempts.delete(key);return login(req,res,u);
 }
 if(route==='/api/logout'&&method==='POST'){
  sessions.delete(sessionToken(req));res.setHeader('Set-Cookie',cookieHeader('',req,0));return send(res,200,{ok:true});
 }
 const u=requireAuth(req,res,db);if(!u)return;
 if(route==='/api/me'&&method==='GET')return send(res,200,{user:publicUser(u)});
 if(route==='/api/me'&&method==='PATCH'){
  const data=await body(req),username=string(data.username,30),email=string(data.email,120).toLowerCase();
  if(!/^[a-zA-Z0-9_.-]{3,30}$/.test(username))return error(res,400,'El usuario debe tener de 3 a 30 caracteres válidos');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return error(res,400,'Email inválido');
  if(db.users.some(x=>x.id!==u.id&&(x.username.toLowerCase()===username.toLowerCase()||x.email===email)))return error(res,409,'Nombre de usuario o correo ya registrado');
  u.username=username;u.email=email;saveDb(db);return send(res,200,{user:publicUser(u)});
 }
 if(route==='/api/me/password'&&method==='POST'){
  const data=await body(req);
  if(typeof data.currentPassword!=='string'||!safeCompare(data.currentPassword,u))return error(res,403,'La contraseña actual no es correcta');
  if(typeof data.newPassword!=='string'||data.newPassword.length<8||data.newPassword.length>128)return error(res,400,'La nueva contraseña debe tener entre 8 y 128 caracteres');
  Object.assign(u,hashPassword(data.newPassword));saveDb(db);
  for(const [t,session] of sessions)if(session.userId===u.id)sessions.delete(t);
  res.setHeader('Set-Cookie',cookieHeader('',req,0));return send(res,200,{ok:true});
 }
 if(route==='/api/summary'&&method==='GET'){const libs=db.libraries.filter(l=>l.userId===u.id);const ids=new Set(libs.map(l=>l.id));const games=db.games.filter(g=>ids.has(g.libraryId));return send(res,200,{libraries:libs.length,games:games.length,genres:new Set(games.map(g=>g.genre).filter(Boolean)).size,recent:games.slice(-4).reverse()});}
 if(route==='/api/libraries'&&method==='GET')return send(res,200,{libraries:db.libraries.filter(l=>l.userId===u.id).map(l=>({...l,games:db.games.filter(g=>g.libraryId===l.id)}))});
 if(route==='/api/libraries'&&method==='POST'){
  const data=await body(req),name=string(data.name,50);if(!name)return error(res,400,'Ingresá un nombre para la biblioteca');
  if(db.libraries.some(l=>l.userId===u.id && l.name.toLowerCase()===name.toLowerCase()))return error(res,409,'Ya tenés una biblioteca con ese nombre');
  const l={id:crypto.randomUUID(),userId:u.id,name};db.libraries.push(l);saveDb(db);return send(res,201,{library:l});
 }
 const lid=route.match(/^\/api\/libraries\/([a-f0-9-]+)$/);
 if(lid&&method==='DELETE'){
  const idx=db.libraries.findIndex(l=>l.id===lid[1]&&l.userId===u.id);if(idx<0)return error(res,404,'Biblioteca no encontrada');
  db.libraries.splice(idx,1);db.games=db.games.filter(g=>g.libraryId!==lid[1]);saveDb(db);return send(res,200,{ok:true});
 }
 if(route==='/api/games'&&method==='POST'){
  const data=await body(req),library=db.libraries.find(l=>l.id===data.libraryId&&l.userId===u.id);
  if(!library)return error(res,404,'Biblioteca no encontrada');
  const raw=Array.isArray(data.games)?data.games:[data.games];if(!raw.length||raw.length>100)return error(res,400,'Importá entre 1 y 100 juegos');
  const games=[];
  for(const item of raw){
   if(!item||typeof item!=='object')return error(res,400,'Formato de juego inválido');
   const title=string(item.titulo||item.nombre,100),genre=string(item.genero||item.categoria,60),year=string(item.anio,10),cover=validUrl(item.portada),link=validUrl(item.ejecutable||item.link);
   if(!title)return error(res,400,'Cada juego necesita un título');
   if((item.portada&&!cover)||(item.ejecutable&&!link)||(item.link&&!link))return error(res,400,'Los enlaces deben comenzar con http:// o https://');
   games.push({id:crypto.randomUUID(),libraryId:library.id,title,genre,year,cover,link});
  }
  db.games.push(...games);saveDb(db);return send(res,201,{games});
 }
 const gid=route.match(/^\/api\/games\/([a-f0-9-]+)$/);
 if(gid&&method==='DELETE'){
  const idx=db.games.findIndex(g=>g.id===gid[1]&&db.libraries.some(l=>l.id===g.libraryId&&l.userId===u.id));
  if(idx<0)return error(res,404,'Juego no encontrado');db.games.splice(idx,1);saveDb(db);return send(res,200,{ok:true});
 }
 return error(res,404,'Ruta de API no encontrada');
}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
 res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
 if(['POST','PATCH','PUT','DELETE'].includes(req.method)){const origin=req.headers.origin;if(origin){let check;try{check=new URL(origin);}catch{return error(res,403,'Origen inválido');}const host=req.headers.host;if(check.host!==host)return error(res,403,'Solicitud de origen externo bloqueada');}}
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/'))return api(req,res,url).catch(err=>{console.error(err);if(!res.headersSent)error(res,err.status||500,err.status?err.message:'Error interno del servidor');});
 if(req.method!=='GET')return error(res,405,'Método no permitido');
 const route=url.pathname==='/'?'/index.html':url.pathname;
 let filename;try{filename=decodeURIComponent(route);}catch{return error(res,400,'Ruta inválida');}
 const file=path.resolve(FRONT,'.'+filename);
 if(!file.startsWith(FRONT+path.sep))return error(res,403,'Acceso denegado');
 fs.stat(file,(err,st)=>{
  if(err||!st.isFile())return error(res,404,'Página no encontrada');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);
 });
});
if(require.main===module)server.listen(PORT,HOST,()=>console.log(`GamingHub disponible en http://${HOST}:${PORT}`));
module.exports=server;
