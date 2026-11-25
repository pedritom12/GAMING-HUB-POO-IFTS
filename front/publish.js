const token=sessionStorage.getItem('gaminghub_token');if(!token)location.replace('index.html');
const form=document.getElementById('form-upload-game');
form.addEventListener('submit',async e=>{e.preventDefault();try{
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const res=await fetch('/api/libraries',{headers});if(!res.ok)throw new Error('Iniciá sesión nuevamente');
 const {libraries}=await res.json();if(!libraries.length)throw new Error('Primero creá una biblioteca desde el panel');
 const game={titulo:document.getElementById('game-title').value,genero:document.getElementById('game-genre').value,portada:document.getElementById('game-cover').value,ejecutable:document.getElementById('game-file').value};
 const r=await fetch('/api/games',{method:'POST',headers,body:JSON.stringify({libraryId:libraries[0].id,games:[game]})});const data=await r.json();if(!r.ok)throw new Error(data.error);location.href='dashboard.html';
}catch(err){alert(err.message);}});
