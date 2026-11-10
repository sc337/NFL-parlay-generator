const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const general=path.join(root,'data/forecast-audit.json');
const nfl=path.join(root,'data/forecast-audit-nfl.json');
const files=[general,nfl];
function read(file){return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{records:[]}}
function load(dataDir=path.join(root,'data')){
  const a=read(path.join(dataDir,'forecast-audit.json')),b=read(path.join(dataDir,'forecast-audit-nfl.json'));
  return {updated_at:a.updated_at,records:[...(a.records||[]),...(b.records||[])]};
}
function save(payload){
  const records=payload.records||[];
  for(const [file,selected] of [[general,records.filter(r=>r.sport!=='nfl')],[nfl,records.filter(r=>r.sport==='nfl')]])
    fs.writeFileSync(file,JSON.stringify({updated_at:payload.updated_at,records:selected})+'\n');
}
module.exports={files,load,save};
