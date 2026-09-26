// Fit on older independent model picks. Later outcomes are a fixed, untouched
// validation window. Only retest after 20 more settled picks for a sport.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),history=path.join(root,'data/pick-history.json');
const output=path.join(root,'data/model-calibration.js');
const brier=(rows,fn)=>rows.reduce((s,r)=>s+(fn(r)-(r.result==='win'?1:0))**2,0)/rows.length;
const clamp=p=>Math.min(.97,Math.max(.03,p));
const calibrated=(r,alpha,bias)=>clamp(r.marketP+alpha*(r.rawModelP-r.marketP)+bias);
const candidates=[];
for(const alpha of [.25,.5,.75,1])for(const bias of [-.04,-.02,0,.02,.04])candidates.push({alpha,bias});
function fit(rows,previous={}){
  const all=rows.filter(r=>r.forecastType==='model'&&['win','loss'].includes(r.result)&&Number.isFinite(+r.modelP)&&Number.isFinite(+r.marketP))
    .map(r=>({...r,rawModelP:Number(r.rawModelP??r.modelP),marketP:Number(r.marketP)}))
    .filter(r=>r.rawModelP>0&&r.rawModelP<1&&r.marketP>0&&r.marketP<1)
    .sort((a,b)=>Date.parse(a.recordedAt)-Date.parse(b.recordedAt)||a.id.localeCompare(b.id));
  const seen=new Set(),clean=all.filter(r=>{const event=(r.event||r.ticker)+'|'+(r.eventTime||'');if(seen.has(event))return false;seen.add(event);return true});
  if(clean.length<50)return {...previous,active:false,settled:all.length,distinctEvents:clean.length,reason:'Need 30 training and 20 later validation events'};
  if(previous.evaluatedCount&&clean.length<previous.evaluatedCount+20)return {...previous,settled:all.length,distinctEvents:clean.length};
  const train=clean.slice(0,-20),validation=clean.slice(-20);
  const best=candidates.map(c=>({...c,trainBrier:brier(train,r=>calibrated(r,c.alpha,c.bias))}))
    .sort((a,b)=>a.trainBrier-b.trainBrier||Math.abs(a.bias)-Math.abs(b.bias))[0];
  const raw=brier(validation,r=>r.rawModelP),market=brier(validation,r=>r.marketP);
  const adjusted=brier(validation,r=>calibrated(r,best.alpha,best.bias));
  const active=adjusted<=raw-.002&&adjusted<=market+.001;
  return {active,alpha:best.alpha,bias:best.bias,settled:all.length,distinctEvents:clean.length,trainingCount:train.length,validationCount:20,
    evaluatedCount:clean.length,rawBrier:+raw.toFixed(4),marketBrier:+market.toFixed(4),adjustedBrier:+adjusted.toFixed(4),
    reason:active?'Improved later outcomes':'Validation did not improve enough'};
}
function build(payload,previous={sports:{}}){const sports={};for(const sport of ['nfl','mlb','ncaaf','ufc']){
  sports[sport]={};const rows=(payload.records||[]).filter(r=>r.sport===sport);
  for(const group of new Set(rows.map(r=>r.marketGroup||r.market).filter(Boolean)))
    sports[sport][group]=fit(rows.filter(r=>(r.marketGroup||r.market)===group),previous.sports?.[sport]?.[group]);
}return {updated_at:new Date().toISOString(),sports}}
function main(){const payload=JSON.parse(fs.readFileSync(history,'utf8'));let previous={sports:{}};
  if(fs.existsSync(output)){try{previous=JSON.parse(fs.readFileSync(output,'utf8').replace(/^window\.MODEL_CALIBRATION_DATA=/,'').replace(/;\s*$/,''))}catch{}}
  const data=build(payload,previous);fs.writeFileSync(output,'window.MODEL_CALIBRATION_DATA='+JSON.stringify(data)+';\n');
  console.log('Calibration',Object.entries(data.sports).map(([s,groups])=>s+': '+Object.entries(groups).map(([g,r])=>g+' '+(r.active?'active':'off')+' ('+r.distinctEvents+' events)').join(', ')).join('; '));
}
if(require.main===module)main();
module.exports={fit,build,calibrated};
