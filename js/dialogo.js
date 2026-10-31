/* Nació de _Dialogo.html (Apps Script). Desde 30/10/2026 la única versión es ésta, la del repo. */
(function(){var d=document.createElement("div");d.innerHTML="<div id=\"dlg-back\" style=\"display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;align-items:center;justify-content:center;padding:16px\">\n  <div style=\"background:var(--card);border:1px solid var(--b);border-radius:var(--r);max-width:460px;width:100%;box-shadow:0 18px 50px rgba(0,0,0,.5);overflow:hidden\">\n    <div style=\"padding:13px 16px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:8px\">\n      <span id=\"dlg-ico\" style=\"font-size:16px\"></span>\n      <span id=\"dlg-tit\" style=\"font-size:13px;font-weight:600;color:var(--tx)\">Confirmar</span>\n    </div>\n    <div id=\"dlg-msg\" style=\"padding:14px 16px;font-size:12.5px;line-height:1.5;color:var(--tx);white-space:pre-wrap;max-height:52vh;overflow-y:auto\"></div>\n    <div id=\"dlg-input-box\" style=\"display:none;padding:0 16px 12px\">\n      <input id=\"dlg-input\" style=\"width:100%;box-sizing:border-box;background:var(--bg2);border:1px solid var(--b);border-radius:var(--r);padding:8px 10px;font-size:12.5px;color:var(--tx);font-family:inherit\">\n    </div>\n    <div style=\"padding:11px 16px;border-top:1px solid var(--b);display:flex;gap:8px;justify-content:flex-end;background:var(--bg2)\">\n      <button id=\"dlg-no\" style=\"background:none;border:1px solid var(--b);color:var(--mt);border-radius:var(--r);padding:6px 13px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit\">Cancelar</button>\n      <button id=\"dlg-si\" style=\"background:var(--blue);border:1px solid var(--blue);color:var(--blanco);border-radius:var(--r);padding:6px 15px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit\">Aceptar</button>\n    </div>\n  </div>\n</div>";while(d.firstChild)document.body.appendChild(d.firstChild);})();


/* Todos devuelven Promise. Uso:
     await say('Listo')                        → aviso
     if (await ask('¿Borro?')) { ... }         → confirmación
     const v = await pedir('Fecha', '2026-09') → texto (null si cancela)   */
(function(){
  var _res=null;
  function cerrarDlg(v){
    var b=document.getElementById('dlg-back'); if(b) b.style.display='none';
    document.removeEventListener('keydown', onKey);
    var r=_res; _res=null; if(r) r(v);
  }
  function onKey(e){
    if(e.key==='Escape'){ e.preventDefault(); cerrarDlg(document.getElementById('dlg-input-box').style.display==='none'?false:null); }
    if(e.key==='Enter' && document.activeElement && document.activeElement.id==='dlg-input'){
      e.preventDefault(); cerrarDlg(document.getElementById('dlg-input').value);
    }
  }
  function abrirDlg(op){
    return new Promise(function(resolve){
      _res=resolve;
      var $=function(id){return document.getElementById(id);};
      $('dlg-ico').textContent = op.icono||'';
      $('dlg-tit').textContent = op.titulo||'Confirmar';
      $('dlg-msg').textContent = op.mensaje||'';
      var box=$('dlg-input-box');
      box.style.display = op.input?'':'none';
      if(op.input){ $('dlg-input').value = op.valor||''; }
      $('dlg-no').style.display = op.soloAviso?'none':'';
      $('dlg-si').textContent = op.ok||'Aceptar';
      $('dlg-si').style.background = op.peligro?'var(--rd)':'var(--blue)';
      $('dlg-si').style.borderColor = op.peligro?'var(--rd)':'var(--blue)';
      $('dlg-back').style.display='flex';
      $('dlg-si').onclick = function(){ cerrarDlg(op.input?$('dlg-input').value:true); };
      $('dlg-no').onclick = function(){ cerrarDlg(op.input?null:false); };
      document.addEventListener('keydown', onKey);
      setTimeout(function(){ (op.input?$('dlg-input'):$('dlg-si')).focus(); },40);
    });
  }
  window.say   = function(msg,tit){ return abrirDlg({mensaje:msg,titulo:tit||'Listo',icono:'✅',soloAviso:true}); };
  window.aviso = function(msg,tit){ return abrirDlg({mensaje:msg,titulo:tit||'Atención',icono:'⚠️',soloAviso:true}); };
  window.ask   = function(msg,tit,op){ op=op||{}; return abrirDlg({mensaje:msg,titulo:tit||'¿Confirmás?',icono:op.peligro?'🗑':'❓',ok:op.ok,peligro:op.peligro}); };
  window.pedir = function(msg,valor,tit){ return abrirDlg({mensaje:msg,titulo:tit||'Dato',icono:'✏️',input:true,valor:valor}); };
})();
