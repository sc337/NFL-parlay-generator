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
});
