// Conecta los formularios existentes sin cambiar el diseño.
const login=document.getElementById('form-login');
const register=document.getElementById('form-register');
const feedback=document.getElementById('mensaje')||document.createElement('p');
if(!feedback.parentNode){(register||login)?.appendChild(feedback);}
feedback.style.marginTop='12px';
feedback.style.color='#fda4af';
async function request(url,payload){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Error de conexión');return data;}
function saveSession(result){sessionStorage.setItem('gaminghub_token',result.token);sessionStorage.setItem('gaminghub_user',result.user.username);location.href='dashboard.html';}
login?.addEventListener('submit',async e=>{e.preventDefault();feedback.textContent='';try{saveSession(await request('/api/login',{username:document.getElementById('login-usuario').value,password:document.getElementById('login-password').value}));}catch(err){feedback.textContent=err.message;}});
register?.addEventListener('submit',async e=>{e.preventDefault();feedback.textContent='';try{saveSession(await request('/api/register',{username:document.getElementById('reg-usuario').value,email:document.getElementById('reg-email').value,password:document.getElementById('reg-password').value}));}catch(err){feedback.textContent=err.message;}});
