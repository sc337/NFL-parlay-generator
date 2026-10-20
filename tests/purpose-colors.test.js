const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function api(){const window={};vm.runInNewContext(fs.readFileSync('purpose-colors.js','utf8'),{window,document:{readyState:'loading',addEventListener(){}}});return window.PURPOSE_COLORS}
test('colors describe labeled states and profiles, never odds or estimated advantages',()=>{
 const c=api();assert.equal(c.profileFor('Conservative · NBA Same Game'),'conservative');assert.equal(c.profileFor('Balanced'),'balanced');assert.equal(c.profileFor('Lotto · NFL'),'lotto');assert.equal(c.profileFor('UFC 4-Leg Parlay'),'');
 assert.equal(c.statusTone('Model unvalidated; value unverified'),'warning');assert.equal(c.statusTone('Confirm participation'),'warning');assert.equal(c.statusTone('Feed unavailable'),'danger');assert.equal(c.statusTone('Player withdrawn'),'danger');
 for(const label of ['+400','-245','Model 70%','Estimated edge +4%','Updated 3m ago'])assert.equal(c.statusTone(label),'neutral');
});
function contrast(a,b){const luminance=hex=>{const values=hex.replace('#','').match(/../g).map(c=>parseInt(c,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722};const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test('semantic text and badge colors meet normal-text contrast in light and dark themes',()=>{
 const neutral=fs.readFileSync('neutral-palette.css','utf8'),purpose=fs.readFileSync('purpose-colors.css','utf8');
 for(const theme of ['dark','light']){
  const tokens={};for(const file of [neutral,purpose]){const block=file.match(new RegExp('html\\[data-theme="'+theme+'"\\] body\\{([^}]+)\\}'))[1];for(const [,name,value]of block.matchAll(/--([\w-]+):(#[\da-f]+)/gi))tokens[name]=value.length===4?'#'+value.slice(1).split('').map(c=>c+c).join(''):value}
  for(const color of ['text','muted','blue','teal','purple','amber','red','green'])assert.ok(contrast(tokens[color],tokens.surface)>=4.5,theme+' '+color+' on card');
  for(const color of ['blue','teal','purple','amber','red','green'])assert.ok(contrast(tokens[color],tokens[color+'-bg'])>=4.5,theme+' '+color+' badge');
 }
});
