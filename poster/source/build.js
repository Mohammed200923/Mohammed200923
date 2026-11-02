const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+process.argv[2],{waitUntil:'networkidle'});
await p.evaluate(()=>document.fonts.ready);
const o=await p.evaluate(()=>[...document.querySelectorAll('.box')].map(e=>e.id+': content '+Math.round(e.scrollHeight*0.75)+'pt / box '+Math.round(e.clientHeight*0.75)+'pt'+(e.scrollHeight>e.clientHeight+1?'  OVERFLOW':'')));
console.log(o.join('\n'));
console.log('font ok:',await p.evaluate(()=>document.fonts.check('20px "IBM Plex Sans"')));
await p.pdf({path:process.argv[3],width:'36in',height:'48in',printBackground:true});await b.close();})();
