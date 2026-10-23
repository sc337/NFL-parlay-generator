const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('college abbreviations resolve to scheduled team IDs and unknown teams keep a mark',async()=>{
 const window={},fetch=async()=>({ok:true,json:async()=>({ncaaf:{pennstate:'https://a.espncdn.com/i/teamlogos/ncaa/500/213.png'}})});
 vm.runInNewContext(fs.readFileSync('sports-media.js','utf8'),{window,fetch});
 await window.SPORT_MEDIA.load();
 const ohio=window.SPORT_MEDIA.ncaaf({kind:'spread',label:'Ohio St. wins by over 13.5 points',college_teams:[
  {id:'2294',name:'Iowa Hawkeyes',aliases:['Iowa']},{id:'194',name:'Ohio State Buckeyes',aliases:['Ohio State','Ohio St']}]});
 assert.match(ohio,/ncaa\/500\/194\.png/);
 assert.doesNotMatch(ohio,/ncaa\/500\/2294\.png/);
 assert.match(window.SPORT_MEDIA.ncaaf({kind:'moneyline',label:'Penn St.'}),/ncaa\/500\/213\.png/);
 assert.match(window.SPORT_MEDIA.ncaaf({kind:'moneyline',label:'Unknown College'}),/Unknown College team mark/);
 const umass=window.SPORT_MEDIA.ncaaf({kind:'spread',label:'UMass +10.5',college_teams:[{id:'113',name:'Massachusetts Minutemen',aliases:['UMass']},{id:'41',name:'UConn Huskies',aliases:['UConn']}]});
 assert.match(umass,/class="sport-selected-media" data-selected-subject="UMass"/);
 assert.match(umass,/ncaa\/500\/113\.png/);assert.doesNotMatch(umass,/ncaa\/500\/41\.png/);
 assert.match(umass,/Massachusetts Minutemen team mark/);
 assert.doesNotMatch(window.SPORT_MEDIA.ncaaf({kind:'total',label:'Over 45.5',college_teams:[{id:'113',name:'Massachusetts Minutemen'},{id:'41',name:'UConn Huskies'}]}),/sport-selected-media/);
});
