(() => {
  let scheduled=false;

  function clean(){
    scheduled=false;

    document.querySelectorAll('#qolV3 .qhead p').forEach(el=>el.remove());

    document.querySelectorAll('#qolV3 .qmetrics span').forEach(el=>{
      if(/^Verified\b/i.test(el.textContent.trim())) el.remove();
    });

    document.querySelectorAll('#qolV3 .qcard.pass p').forEach(el=>{
      if(el.textContent!=='No qualifying pick.') el.textContent='No qualifying pick.';
    });

    const slate=document.getElementById('slateLabel');
    if(slate && !slate.hidden) slate.hidden=true;

    const title=document.getElementById('resultsTitle');
    if(title){
      const txt=title.textContent||'';
      if((/SGP|props|recommend/i.test(txt)) && txt!=='Recommendations') title.textContent='Recommendations';
    }

    document.querySelectorAll('.qdetails summary small').forEach(el=>{
      if(el.textContent!=='Settings & diagnostics') el.textContent='Settings & diagnostics';
    });

    const footer=document.querySelector('.dashboard-footer');
    if(footer && !footer.querySelector('.footer-minimal')){
      footer.innerHTML='<div class="footer-minimal">Bet responsibly.</div>';
    }
  }

  function schedule(){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(clean);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    clean();
    const obs=new MutationObserver(schedule);
    obs.observe(document.body,{childList:true,subtree:true});
  });

  window.addEventListener('nfl-qol-rendered',schedule);
})();