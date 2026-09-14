(() => {
  function clean(){
    document.querySelectorAll('#qolV3 .qhead p').forEach(el=>el.remove());

    document.querySelectorAll('#qolV3 .qmetrics span').forEach(el=>{
      if(/^Verified\b/i.test(el.textContent.trim())) el.remove();
    });

    document.querySelectorAll('#qolV3 .qcard.pass p').forEach(el=>{
      el.textContent='No qualifying pick.';
    });

    const slate=document.getElementById('slateLabel');
    if(slate) slate.hidden=true;

    const title=document.getElementById('resultsTitle');
    if(title){
      const txt=title.textContent||'';
      if(/SGP|props|recommend/i.test(txt)) title.textContent='Recommendations';
    }

    document.querySelectorAll('.qdetails summary small').forEach(el=>{
      el.textContent='Settings & diagnostics';
    });

    const footer=document.querySelector('.dashboard-footer');
    if(footer){
      footer.innerHTML='<div class="footer-minimal">Bet responsibly.</div>';
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    clean();
    const root=document.body;
    const obs=new MutationObserver(()=>clean());
    obs.observe(root,{childList:true,subtree:true});
  });
  window.addEventListener('nfl-qol-rendered',()=>setTimeout(clean,0));
})();