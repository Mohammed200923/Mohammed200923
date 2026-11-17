const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+process.argv[2],{waitUntil:'networkidle'});
await p.evaluate(()=>document.fonts.ready);
const r=await p.evaluate(()=>window.layout());
console.log(JSON.stringify(r));
const ov=await p.evaluate(()=>[...document.querySelectorAll('.card')].filter(e=>e.scrollHeight>e.clientHeight+1).map(e=>e.id));
console.log('overflow:',ov.join(',')||'none','| font ok:',await p.evaluate(()=>document.fonts.check('20px "IBM Plex Sans"')));
await p.pdf({path:process.argv[3],width:'36in',height:'48in',printBackground:true});await b.close();})();
