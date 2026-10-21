const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const storage = new Map();
const window = new EventTarget();
let owner = false;
const context = vm.createContext({ window, Date, crypto: webcrypto, Event, HoaiCloud: { ready: Promise.resolve(), state: { enabled: false } },
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,value) },
  requireEditor: () => { if(!owner) throw new Error('owner only'); }
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../broadcast.js'),'utf8'),context);
const model = window.HoaiBroadcast;
(async()=>{
  assert.equal(model.defaults.length,12);
  assert.equal(model.defaults.map(slot=>slot.hour).join(','),'0,2,4,6,8,10,12,14,16,18,20,22');
  for(let hour=0;hour<24;hour++) {
    const date = new Date(Date.UTC(2026,9,21,hour-7,59,59));
    assert.equal(model.position(date).hour,Math.floor(hour/2)*2);
  }
  assert.equal(model.position(new Date('2026-10-21T16:59:59Z')).hour,22);
  assert.equal(model.position(new Date('2026-10-21T17:00:00Z')).hour,0);
  assert.equal(model.position(new Date('2026-10-21T17:00:00Z')).day,'2026-10-22');
  for(const hour of [-2,1,24,null]) assert.throws(()=>model.validate({...model.defaults[0],hour}));
  assert.throws(()=>model.validate({...model.defaults[0],body_en:''}));
  assert.throws(()=>model.validate({...model.defaults[0],title_vi:'x'.repeat(161)}));
  await assert.rejects(model.save(model.defaults[0],null),/owner/);
  owner=true;
  await model.load();
  await model.save({...model.defaults[0],title_en:'Saved slot'},null);
  assert.equal(model.schedule()[0].title_en,'Saved slot');
  await assert.rejects(model.save(model.defaults[0],null),/thay đổi/);
  await model.load();
  assert.equal(model.schedule()[0].title_en,'Saved slot');
  assert.equal(model.schedule().length,12);
  let finishLoad;
  context.HoaiCloud.state.enabled = true;
  context.HoaiCloud.loadBroadcast = () => new Promise(resolve => { finishLoad = resolve; });
  context.HoaiCloud.saveBroadcast = async () => webcrypto.randomUUID();
  const pendingLoad = model.load();
  await new Promise(resolve=>setImmediate(resolve));
  await model.save({...model.defaults[0],title_en:'Newer saved bulletin'},model.schedule()[0].revision);
  finishLoad([{...model.defaults[0],title_en:'Stale polled bulletin'}]);
  await pendingLoad;
  assert.equal(model.schedule()[0].title_en,'Newer saved bulletin');
  console.log('PASS 24 hourly boundaries, Vietnam midnight, bilingual validation, owner-only save, persistence and stale-write protection');
  console.log('PASS delayed background poll cannot overwrite a newer saved bulletin');
})().catch(error=>{console.error(error);process.exitCode=1});
