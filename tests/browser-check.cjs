const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hoai-browser-check-'));
const errors = [];
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = pathname.replace(/^\/hoai\//, '') || 'index.html';
  // This suite exercises local preview with isolated storage, never a real project.
  if (relative === 'supabase-config.js' && !process.env.HOAI_LIVE_DIAGNOSTIC) {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    response.end('window.HOAI_SUPABASE = {enabled:false,url:"",ownerId:"",bucket:"hoai-images",publishableKey:""};');
    return;
  }
  if (relative.endsWith('.mp3') && process.env.HOAI_MEDIA_ORIGIN) {
    const upstream = http.request(process.env.HOAI_MEDIA_ORIGIN + '/' + relative, { method: request.method, headers: request.headers }, incoming => {
      response.writeHead(incoming.statusCode, incoming.headers);
      incoming.pipe(response);
    });
    upstream.on('error', error => { response.writeHead(502); response.end(error.message); });
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
    return;
  }
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end(); return;
  }
  const size = fs.statSync(file).size;
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png' };
  const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(response);
  } else {
    response.writeHead(200, { ...headers, 'Content-Length': size });
    fs.createReadStream(file).pipe(response);
  }
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let socket;
let sequence = 0;
const pending = new Map();
async function command(method, params = {}) {
  const id = ++sequence;
  const result = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: ' + method)); }, 15000);
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
  });
  socket.send(JSON.stringify({ id, method, params }));
  return result;
}
async function evaluate(expression, userGesture = false) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function ready() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate('Boolean(window.HOAI_APP_READY && window.HOAI_INITIAL_DATA && typeof appState !== "undefined" && appState && !document.querySelector("main").inert)')) return;
    await wait(100);
  }
  throw new Error('Page initialization timed out');
}
let passed = 0;
function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  passed++;
  console.log('PASS', name);
}

(async () => {
  console.log('Starting local browser checks');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  browser = spawn(edge, ['--headless=new', '--no-sandbox', '--in-process-gpu', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--autoplay-policy=${process.env.HOAI_ALLOW_AUTOPLAY ? 'no-user-gesture-required' : 'user-gesture-required'}`, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const browserEndpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 20000);
    browser.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    browser.on('error', reject);
  });
  const browserOrigin = browserEndpoint.replace('ws:', 'http:').split('/devtools/')[0];
  console.log('Browser started');
  const targets = await (await fetch(browserOrigin + '/json/list')).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const promise = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) promise.reject(new Error(JSON.stringify(message.error)));
      else promise.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  };
  await new Promise(resolve => { socket.onopen = resolve; });
  console.log('Browser protocol connected');
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Network.enable');
  await command('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/hoai/` });
  if (process.env.HOAI_LIVE_DIAGNOSTIC) {
    await wait(7000);
    console.log(JSON.stringify(await evaluate(`({
      authStatus:document.getElementById('authStatus')?.textContent,
      storageStatus:document.getElementById('storageStatus')?.textContent,
      headerInert:document.querySelector('header').inert,
      loginDisabled:document.getElementById('btnOwnerLogin')?.disabled,
      cloud:window.HoaiCloud ? {enabled:HoaiCloud.state.enabled,error:HoaiCloud.state.error?.message,user:!!HoaiCloud.state.user}:null,
      errors:${JSON.stringify(errors)}
    })`), null, 2));
    return;
  }
  await ready();
  if (process.env.HOAI_ALLOW_AUTOPLAY) {
    await wait(500);
    check('music automatically starts when browser permits', await evaluate('!$("soundtrack").paused && radioContext.state === "running"'), true);
    check('automatic playback keeps pause button and loop', await evaluate('$("soundtrack").loop && $("btnRadioToggle").getAttribute("aria-pressed")==="true"'), true);
    await evaluate('$("soundtrack").currentTime=$("soundtrack").duration-.25');
    await wait(1500);
    check('soundtrack loops to beginning after reaching end', await evaluate('!$("soundtrack").paused && $("soundtrack").currentTime<5'), true);
    await evaluate('toggleRadio()');
    await command('Input.dispatchMouseEvent', {type:'mousePressed',x:5,y:500,button:'left',clickCount:1});
    await command('Input.dispatchMouseEvent', {type:'mouseReleased',x:5,y:500,button:'left',clickCount:1});
    await wait(200);
    check('manual pause is respected after subsequent interactions', await evaluate('$("soundtrack").paused && musicUserPaused && !musicAutoPending'), true);
    check('no uncaught autoplay exceptions', errors, []);
    console.log(`Verified ${passed} allowed-autoplay browser checks.`);
    return;
  }
  await wait(150);
  check('blocked autoplay waits for interaction without locking player', await evaluate('[$("soundtrack").paused,musicAutoPending,$("btnRadioToggle").disabled,$("musicStatus").textContent]'), [true,true,false,'● CHẠM VÀO TRANG ĐỂ NGHE NHẠC']);
  await command('Input.dispatchMouseEvent', {type:'mousePressed',x:5,y:500,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent', {type:'mouseReleased',x:5,y:500,button:'left',clickCount:1});
  await wait(300);
  check('first real page interaction starts soundtrack', await evaluate('!$("soundtrack").paused && radioContext.state === "running"'), true);
  await evaluate('toggleRadio()');
  await command('Input.dispatchMouseEvent', {type:'mousePressed',x:5,y:500,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent', {type:'mouseReleased',x:5,y:500,button:'left',clickCount:1});
  await wait(100);
  check('pause is not undone by later page interactions', await evaluate('$("soundtrack").paused && musicUserPaused && !musicAutoPending'), true);
  check('initial posts and all 8 provided images', await evaluate('[appState.posts.length, appState.gallery.length, appState.gallery.filter(i=>i.id.startsWith("provided-")).length]'), [4, 13, 8]);
  check('legacy cloud and local gallery captions receive corrected names', await evaluate(`(() => {
    const old = structuredClone(appState);
    old.gallery.find(i=>i.id==='provided-1').title='Phòng chờ phát sóng';
    old.gallery.find(i=>i.id==='provided-5').title='Người gác đêm';
    const corrected = validateState(old);
    return corrected.gallery.find(i=>i.id==='provided-1').title==='Buổi Tế Lễ'
      && corrected.gallery.find(i=>i.id==='provided-5').title==='Tổ chức FEMA'
      && old.gallery.find(i=>i.id==='provided-1').title==='Phòng chờ phát sóng';
  })()`), true);
  check('caption migration preserves custom titles', await evaluate('canonicalGalleryTitle({id:"provided-1",title:"Tên tôi tự đặt"})'), 'Tên tôi tự đặt');
  check('social logos open the supplied Facebook and Discord links safely in new tabs', await evaluate(`(() => {
    const links=[...document.querySelectorAll('.social-link')];
    return links.map(a=>a.href).join('|')==='https://www.facebook.com/edzorc|https://discord.com/invite/qPDtERBV'
      && links.every(a=>a.target==='_blank' && a.relList.contains('noopener') && a.relList.contains('noreferrer') && a.getAttribute('aria-label') && a.querySelector('svg'));
  })()`), true);
  check('visitors start with no editing controls', await evaluate('!canEdit() && $("hoaiBio").contentEditable === "false" && [...document.querySelectorAll("[data-owner]")].every(e=>e.hidden)'), true);
  await evaluate('editGalleryCaption("g1")');
  check('visitors cannot open gallery caption editor', await evaluate('!$("galleryEditDialog").open'), true);
  check('night surveillance is visible to visitors and identified as fictional', await evaluate('Boolean(window.HoaiSurveillance) && !document.querySelector(".surveillance").hidden && document.querySelector(".surveillance .helper-text").textContent.includes("hư cấu")'), true);
  await evaluate('HoaiSurveillance.next()');
  check('camera button switches feed and label', await evaluate('[$("cameraNumber").textContent,$("cameraImage").getAttribute("src"),$("cameraLocation").textContent]'), ['CAM 02 / 17','assets/original-8.jpg','Đêm vùng tro tàn']);
  await evaluate('HoaiLanguage.set("en")');
  check('camera and scheduled bulletins translate to English', await evaluate('[$("surveillanceTitle").textContent,$("cameraLocation").textContent,$("signalLog").querySelector("strong").textContent]'), ['NIGHT SURVEILLANCE','Night in the Ashlands','Midnight Bulletin']);
  check('daily schedule covers all twelve two-hour slots', await evaluate('[...$("signalLog").querySelectorAll("time")].map(t=>t.textContent).join("|")'), Array.from({length:12},(_,i)=>`${String(i*2).padStart(2,'0')}:00 – ${String(i*2+2).padStart(2,'0')}:00`).join('|'));
  await evaluate('HoaiLanguage.set("vi");for(let i=0;i<HoaiSurveillance.cameraCount-1;i++)HoaiSurveillance.next()');
  check('camera cycles through every unique image including post images', await evaluate('[$("cameraNumber").textContent,HoaiSurveillance.cameraCount]'), ['CAM 01 / 17',17]);
  await evaluate('HoaiSurveillance.edit(0)');
  check('visitors cannot open broadcast editor', await evaluate('!$("broadcastEditDialog").open'), true);
  check('broadcast changes automatically on Vietnam two-hour boundary', await evaluate('(()=>{HoaiSurveillance.tick(new Date("2026-10-21T19:00:00Z"));return [$("broadcastTime").textContent,$("broadcastHeadline").textContent]})()'), ['02:00 – 04:00','Tiếng gõ trong sương']);
  check('broadcast wraps to midnight on the next Vietnam day', await evaluate('(()=>{HoaiSurveillance.tick(new Date("2026-10-21T17:00:00Z"));return [$("broadcastTime").textContent,$("broadcastHeadline").textContent]})()'), ['00:00 – 02:00','Bản tin nửa đêm']);
  check('visitor writes rejected even through direct function call', await evaluate('(async()=>{try{await commitState({...appState,bio:"unauthorized"});return false;}catch{return appState.bio!=="unauthorized";}})()'), true);
  await evaluate(`window.qaOriginalLogin=HoaiCloud.login;HoaiCloud.state.enabled=true;
    HoaiCloud.login=async()=>{HoaiCloud.state.user={id:'owner-preview-uuid'};HoaiCloud.state.owner=true;};
    loginOwner();`);
  check('owner login uses email/password dialog', await evaluate('$("ownerLoginDialog").open && $("ownerEmail").type==="email" && $("ownerPassword").type==="password"'), true);
  await evaluate(`$('ownerEmail').value='owner@example.com';$('ownerPassword').value='not-a-real-password';submitOwnerLogin({preventDefault(){}})`);
  check('successful login clears password and closes dialog', await evaluate('!$("ownerLoginDialog").open && $("ownerPassword").value==="" && HoaiCloud.state.user.id==="owner-preview-uuid"'), true);
  await evaluate('HoaiCloud.login=window.qaOriginalLogin;HoaiCloud.state.enabled=false;HoaiCloud.state.owner=false;HoaiCloud.state.user=null;paintAccess()');
  await evaluate(`window.qaSoundStarts=0; window.qaOriginalOscillator=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(){window.qaSoundStarts++;return window.qaOriginalOscillator.call(this);};
    document.querySelector('.nav-btn').click();`);
  await wait(150);
  check('button clicks produce terminal sound', await evaluate('window.qaSoundStarts>0 && HoaiSounds.enabled'), true);
  await evaluate('$("btnUISound").click();window.qaBeforeMutedClick=window.qaSoundStarts;document.querySelector(".nav-btn").click()');
  await wait(100);
  check('UI sound toggle silences clicks', await evaluate('!HoaiSounds.enabled && window.qaSoundStarts===window.qaBeforeMutedClick'), true);
  await evaluate('$("btnUISound").click();AudioContext.prototype.createOscillator=window.qaOriginalOscillator;toggleLocalEditor()');
  check('explicit local preview restores editing without Firebase credentials', await evaluate('canEdit() && $("hoaiBio").contentEditable === "true"'), true);
  check('IndexedDB initialized', await evaluate('Boolean(database && storageVersion > 0)'), true);
  await evaluate('HoaiSurveillance.edit(0);$("broadcastTitleVi").value="Bản tin thử";$("broadcastTitleEn").value="Test bulletin";$("broadcastBodyVi").value="Dòng một\\nDòng hai";$("broadcastBodyEn").value="Line one\\nLine two";HoaiSurveillance.save({preventDefault(){}})');
  check('owner saves a bilingual broadcast slot', await evaluate('!$("broadcastEditDialog").open && HoaiBroadcast.schedule()[0].title_en==="Test bulletin"'), true);
  check('edited broadcast is displayed in English', await evaluate('(()=>{HoaiLanguage.set("en");HoaiSurveillance.tick(new Date("2026-10-21T17:00:00Z"));return $("broadcastHeadline").textContent})()'), 'Test bulletin');
  await evaluate('HoaiLanguage.set("vi");HoaiSurveillance.edit(0);$("broadcastTitleVi").value="Không mất bản đang sửa";window.qaBroadcastSave=HoaiBroadcast.save;HoaiBroadcast.save=async()=>{throw new Error("save failed")};HoaiSurveillance.save({preventDefault(){}})');
  check('broadcast save failure retains editor draft', await evaluate('$("broadcastEditDialog").open && $("broadcastTitleVi").value==="Không mất bản đang sửa" && !$("broadcastSave").disabled'), true);
  await evaluate('HoaiBroadcast.save=window.qaBroadcastSave;HoaiSurveillance.closeEditor();localStorage.removeItem("HOAI_BROADCAST_V1");HoaiBroadcast.load()');
  await evaluate('window.qaGalleryBefore=structuredClone(appState.gallery);editGalleryCaption("g1")');
  check('owner caption editor opens with both language fields', await evaluate('$("galleryEditDialog").open && $("galleryCaptionVi").value==="Chân dung Chủ nhân Hoài" && $("galleryCaptionEn").value==="Portrait of Hoài"'), true);
  await evaluate('$("galleryCaptionVi").value="<img src=x onerror=alert(1)>";$("galleryCaptionEn").value="My portrait";saveGalleryCaption({preventDefault(){}})');
  check('owner caption saves safely without injecting HTML', await evaluate('!$("galleryEditDialog").open && document.querySelector(".gallery-caption>span").textContent==="<img src=x onerror=alert(1)>" && !document.querySelector(".gallery-caption>span img")'), true);
  await command('Page.reload'); await wait(200); await ready();
  await evaluate('HoaiLanguage.set("en");viewGalleryImage("g1")');
  check('bilingual caption survives reload and appears in image viewer', await evaluate('[$("modalContentArea").querySelector("h2").textContent,document.querySelector(".gallery-caption>span").textContent]'), ['My portrait','My portrait']);
  await evaluate('HoaiLanguage.set("vi");closeReader();editGalleryCaption("g1");$("galleryCaptionVi").value="Bản chưa lưu";closeGalleryEditor()');
  check('cancelling caption edit preserves saved content', await evaluate('galleryCaption(appState.gallery.find(i=>i.id==="g1"))'), '<img src=x onerror=alert(1)>');
  await evaluate('editGalleryCaption("g1");$("galleryCaptionVi").value="Giữ khi lỗi";window.qaCommit=commitState;commitState=async()=>{throw new Error("qa save failure")};saveGalleryCaption({preventDefault(){}})');
  check('failed caption save keeps dialog and draft text', await evaluate('$("galleryEditDialog").open && $("galleryCaptionVi").value==="Giữ khi lỗi" && !$("galleryEditSave").disabled'), true);
  await evaluate('commitState=window.qaCommit;closeGalleryEditor();(async()=>{await commitState({...appState,gallery:structuredClone(publishedState.gallery)});renderGallery()})()');
  await evaluate('(async()=>{if($("soundtrack").paused)await toggleRadio();await toggleRadio()})()', true);
  check('soundtrack keeps user pause choice and looping enabled', await evaluate('$("soundtrack").paused && $("soundtrack").loop && musicUserPaused'), true);
  check('original frequencies available and synth initially off', await evaluate('[...document.querySelectorAll("[data-frequency]")].map(b=>Number(b.dataset.frequency)).join(",") === "55,110,73.4" && !radioPlaying'), true);
  await evaluate('toggleFrequencyRadio()');
  await wait(150);
  check('frequency synth starts at 55Hz', await evaluate('radioPlaying && radioContext.state === "running" && radioOscillators[0].frequency.value === 55 && $("soundtrack").paused'), true);
  for (const frequency of [110, 73.4, 55]) {
    await evaluate(`changeRadioFreq(${frequency})`);
    await wait(100);
    check(`synth switches to ${frequency}Hz`, await evaluate(`Math.abs(radioOscillators[0].frequency.value-${frequency}) < .001 && document.querySelector('[data-frequency="${frequency}"]').getAttribute('aria-pressed') === 'true'`), true);
  }
  await evaluate('toggleRadio()');
  check('synth and MP3 play independently together', await evaluate('radioPlaying && !$("soundtrack").paused'), true);
  await evaluate('toggleFrequencyRadio()');
  check('synth stops while MP3 keeps playing through shared analyser', await evaluate('!radioPlaying && radioContext.state === "running" && !$("soundtrack").paused && Boolean(radioMusicSource)'), true);
  await wait(300);
  check('MP3 alone drives real waveform and frequency spectrum', await evaluate('radioSamples.some(value=>Math.abs(value)>.000001) && radioSpectrum.some(value=>value>0)'), true);
  check('custom transport replaces native white player', await evaluate('!$("soundtrack").controls && getComputedStyle($("soundtrack")).display === "none" && !$("musicSeek").disabled'), true);
  await evaluate('$("musicVolume").value="60";$("musicVolume").dispatchEvent(new Event("input"))');
  await wait(150);
  check('volume changes shared audio output', await evaluate('Math.abs(radioMasterGain.gain.value-.6)<.01 && $("volumeReadout").textContent==="60%"'), true);
  await evaluate(`window.qaBeforeScrub=$('soundtrack').currentTime;
    for(const position of [100,180,250]){$('musicSeek').value=String(position);$('musicSeek').dispatchEvent(new Event('input'));}
    updateRadioTimeline();`);
  check('dragging previews destination without repeatedly seeking or resetting slider', await evaluate('Math.abs($("soundtrack").currentTime-window.qaBeforeScrub)<2 && $("musicSeek").value==="250"'), true);
  await evaluate('$("musicSeek").dispatchEvent(new Event("change"))');
  check('custom timeline seeks soundtrack', await evaluate('Math.abs($("soundtrack").currentTime-$("soundtrack").duration*.25)<2'), true);
  await wait(1500);
  check('playback continues from seek destination without restarting', await evaluate('!$("soundtrack").paused && $("soundtrack").currentTime>=$("soundtrack").duration*.25 && $("soundtrack").currentTime<$("soundtrack").duration*.25+5'), true);
  for (const rate of [.25, .5, 1, 1.5]) {
    await evaluate(`document.querySelector('[data-playback-rate="${rate}"]').click()`);
    check(`playback rate ${rate}x applied without resetting position`, await evaluate(`$('soundtrack').playbackRate===${rate} && $('soundtrack').preservesPitch && !$('soundtrack').paused && $('soundtrack').currentTime > $('soundtrack').duration*.24 && document.querySelector('[data-playback-rate="${rate}"]').getAttribute('aria-pressed')==='true'`), true);
  }
  await evaluate(`changePlaybackRate(1);$('soundtrack').pause();$('musicSeek').value='500';$('musicSeek').dispatchEvent(new Event('input'));$('musicSeek').dispatchEvent(new Event('change'));`);
  await wait(200);
  check('seeking while paused preserves pause and chosen position', await evaluate('$("soundtrack").paused && Math.abs($("soundtrack").currentTime-$("soundtrack").duration*.5)<2'), true);
  await evaluate(`window.qaCancelledPosition=$('soundtrack').currentTime;$('musicSeek').value='800';$('musicSeek').dispatchEvent(new Event('input'));$('musicSeek').dispatchEvent(new Event('pointercancel'));`);
  check('cancelled drag does not jump playback', await evaluate('!radioScrubbing && Math.abs($("soundtrack").currentTime-window.qaCancelledPosition)<.1'), true);
  for (const width of [320, 375, 768, 1280]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await wait(100);
    check(`layout stays within viewport at ${width}px`, await evaluate(`(() => {
      const selectors = ['.hero-grid','.posts-grid','.gallery-grid','.toolbar','.brand-box','.social-links','.slogan-banner','.radio-station','.station-scope','.station-transport','.frequency-actions','.station-speed'];
      return selectors.every(selector => {const r=document.querySelector(selector).getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1;});
    })()`), true);
  }
  check('all local image files load', await evaluate(`(async()=>{
    const sources = [...new Set([appState.avatar,...appState.posts.map(p=>p.image),...appState.gallery.map(i=>i.src)])];
    const results = await Promise.all(sources.map(async src=>{const img=new Image();img.src=src;try{await img.decode();return true;}catch{return false;}}));
    return results.every(Boolean);
  })()`), true);
  await evaluate('$("postTitleInput").value="Kiểm tra nhật ký"; $("postContentInput").value="Nội dung tiếng Việt <script>không chạy</script>"; publishPost()');
  check('post stored and form cleared', await evaluate('[appState.posts.length,$("postTitleInput").value]'), [5, '']);
  await command('Page.reload');
  await wait(200);
  await ready();
  check('post survives reload', await evaluate('appState.posts[0].title'), 'Kiểm tra nhật ký');
  await evaluate('editPost(appState.posts[0].id); $("postContentInput").value="Đã sửa nội dung"; publishPost()');
  check('editing preserves count', await evaluate('[appState.posts.length,appState.posts[0].content]'), [5, 'Đã sửa nội dung']);
  await evaluate('$("searchInput").value="không tồn tại";renderPosts()');
  check('search empty state', await evaluate('$("postsContainer").textContent.includes("Không tìm thấy bài phù hợp")'), true);
  await evaluate('$("searchInput").value="";renderPosts();openReader(appState.posts[0].id)');
  check('reader opens with focus inside', await evaluate('$("readerModal").classList.contains("open") && $("readerModal").contains(document.activeElement)'), true);
  await evaluate('closeReader()');
  check('reader closes', await evaluate('$("readerModal").classList.contains("open")'), false);
  check('malformed and hostile backup rejected', await evaluate(`(() => {
    const cases=[{posts:[]},{...appState,gallery:null},{...appState,posts:[{...appState.posts[0],id:"bad' onclick='alert(1)"}]},{...appState,avatar:'javascript:alert(1)'}];
    return cases.every(value=>{try{validateState(value);return false;}catch{return true;}});
  })()`), true);
  await evaluate('$("postTitleInput").value="Bản nháp còn giữ";$("postContentInput").value="Chưa đăng";scheduleDraft()');
  await wait(600);
  await command('Page.reload');
  await wait(200); await ready();
  check('draft restored after reload', await evaluate('$("postTitleInput").value'), 'Bản nháp còn giữ');
  check('invalid image rejected', await evaluate('(async()=>{try{await compressImageFile(new File(["bad"],"bad.txt",{type:"text/plain"}));return false;}catch{return true;}})()'), true);
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ZkAAAAASUVORK5CYII=';
  await evaluate(`(async()=>{const blob=await(await fetch('data:image/png;base64,${tinyPng}')).blob();await selectPostImage(new File([blob],'test.png',{type:'image/png'}));})()`);
  check('image preview processed', await evaluate('pendingUploadB64.startsWith("data:image/jpeg;base64,") && !imageLoading'), true);
  await evaluate('publishPost()');
  check('attached image added to gallery', await evaluate('[appState.posts.length,appState.gallery.length]'), [6, 14]);
  await evaluate('$("postTitleInput").value="Không được mất";$("postContentInput").value="Giữ lại khi lưu lỗi"; database.close();publishPost()');
  check('failed save retains composer contents and post count', await evaluate('[$("postTitleInput").value,appState.posts.length]'), ['Không được mất', 6]);
  await command('Page.reload'); await wait(200); await ready();
  check('saved image persists after reload', await evaluate('appState.gallery[0].src.startsWith("data:image/jpeg;base64,")'), true);
  check('MP3 available under repository subpath', (await fetch(`http://127.0.0.1:${port}/hoai/assets/no-im-not-a-human-ost.mp3`, { headers: { Range: 'bytes=0-15' } })).status, 206);
  await evaluate('if(!$("soundtrack").paused) toggleRadio()');
  await evaluate('toggleRadio()', true);
  await wait(300);
  check('MP3 plays on request', await evaluate('!$("soundtrack").paused && $("btnRadioToggle").getAttribute("aria-pressed")==="true"'), true);
  await evaluate('toggleRadio()');
  check('MP3 pauses on request', await evaluate('$("soundtrack").paused'), true);
  check('JSON export round trip', await evaluate(`(async()=>{
    const originalURL=URL.createObjectURL, originalClick=HTMLAnchorElement.prototype.click;
    let exported;
    URL.createObjectURL=blob=>{exported=blob;return originalURL(blob);};
    HTMLAnchorElement.prototype.click=function(){};
    try{await exportBackupJSON(); const parsed=validateState(JSON.parse(await exported.text()));return parsed.posts.length===appState.posts.length && parsed.gallery.length===appState.gallery.length;}
    finally{URL.createObjectURL=originalURL;HTMLAnchorElement.prototype.click=originalClick;}
  })()`), true);
  check('GitHub export produces executable seed with matching images', await evaluate(`(async()=>{
    const originalURL=URL.createObjectURL, originalClick=HTMLAnchorElement.prototype.click;
    let exported;
    URL.createObjectURL=blob=>{exported=blob;return originalURL(blob);};
    HTMLAnchorElement.prototype.click=function(){};
    try{await exportPublishedData();const text=await exported.text(); const snapshot=JSON.parse(text.slice('window.HOAI_INITIAL_DATA = '.length).trim().slice(0,-1));return validateState(snapshot).gallery.length===14 && snapshot.posts.length===6;}
    finally{URL.createObjectURL=originalURL;HTMLAnchorElement.prototype.click=originalClick;}
  })()`), true);
  await evaluate(`(async()=>{
    const previousConfirm=window.confirm;window.confirm=()=>true;
    try{const imported={...appState,bio:'Khôi phục từ JSON thành công'};await importBackupJSON({target:{files:[new File([JSON.stringify(imported)],'backup.json',{type:'application/json'})],value:'test'}});}
    finally{window.confirm=previousConfirm;}
  })()`);
  check('valid JSON import restores state', await evaluate('appState.bio'), 'Khôi phục từ JSON thành công');
  check('concurrent stale state cannot overwrite another tab', await evaluate(`(async()=>{
    const current=await readRecord('state');await writeRecord('state',{...current,version:current.version+1});
    try{await commitState({...appState,bio:'stale overwrite'});return false;}catch{return (await readRecord('state')).snapshot.bio!=='stale overwrite';}
  })()`), true);
  await command('Page.reload'); await wait(200); await ready();
  const originalBio = await evaluate('appState.bio');
  const originalTitle = await evaluate('appState.posts[0].title');
  await evaluate('document.querySelector("[data-language=en]").click()');
  check('English switch translates navigation, forms and radio', await evaluate('[document.documentElement.lang,document.querySelector(".nav-btn").textContent,$("ownerLoginTitle").textContent,$("postTitleInput").placeholder,$("btnFrequencyToggle").textContent]'), ['en','01. SANCTUARY','OWNER LOGIN','Example: Night 14 — Only the radio remains...','ENABLE SYNTH']);
  check('language switch preserves user biography and post titles', await evaluate('[$("hoaiBio").textContent,document.querySelector(".post-title").textContent]'), [originalBio, originalTitle]);
  const gallerySnapshot = await evaluate('JSON.stringify(appState.gallery)');
  check('all original Vietnamese gallery captions have English display names', await evaluate('[...document.querySelectorAll(".gallery-caption>span")].map(e=>e.textContent).filter(s=>["Portrait of Hoài","Night in the Ashlands","Shadows of the City","Four Charcoal Faces","Beneath the Blue Water","The Ritual","FEMA Organization","The Visitor at the Door","The Silent Room"].includes(s)).length'), 9);
  await evaluate('viewGalleryImage("provided-1")');
  check('ritual lightbox title and image alt both use English', await evaluate('[$("modalContentArea").querySelector("h2").textContent,$("modalContentArea").querySelector("img").alt]'), ['The Ritual','The Ritual']);
  await evaluate('HoaiLanguage.set("vi")');
  check('open ritual lightbox switches back to corrected Vietnamese caption', await evaluate('[$("modalContentArea").querySelector("h2").textContent,$("modalContentArea").querySelector("img").alt]'), ['Buổi Tế Lễ','Buổi Tế Lễ']);
  await evaluate('closeReader();viewGalleryImage("provided-5");HoaiLanguage.set("en")');
  check('FEMA lightbox switches to English while open', await evaluate('[$("modalContentArea").querySelector("h2").textContent,$("modalContentArea").querySelector("img").alt]'), ['FEMA Organization','FEMA Organization']);
  check('gallery accessibility labels follow selected language', await evaluate('[...document.querySelectorAll(".gallery-open")].find(e=>e.getAttribute("onclick").includes("provided-5")).getAttribute("aria-label")'), 'View FEMA Organization');
  check('language switching leaves stored gallery captions intact', await evaluate('JSON.stringify(appState.gallery)'), gallerySnapshot);
  await evaluate('closeReader();renderGallery()');
  check('gallery re-render uses current language', await evaluate('[...document.querySelectorAll(".gallery-open")].find(e=>e.getAttribute("onclick").includes("provided-1")).parentElement.querySelector(".gallery-caption>span").textContent'), 'The Ritual');
  check('post mood and category labels translate together', await evaluate('[...document.querySelectorAll(".mood-tag,.post-meta")].every(e=>!/[À-ỹ]/.test(e.textContent))'), true);
  await evaluate('openReader("post-2")');
  check('reader file heading and mood use English', await evaluate('[...document.querySelectorAll("#modalContentArea .helper-text")].map(e=>e.textContent)'), ['FILE #14 // CLASSIFIED FILES // 20/10/2026 - 23:40', 'HOÀI // ISOLATED // ALONE']);
  await evaluate('HoaiLanguage.set("vi")');
  check('open reader switches back to Vietnamese without closing', await evaluate('$("readerModal").classList.contains("open") && $("modalContentArea").querySelector(".helper-text").textContent.startsWith("HỒ SƠ #14 // HỒ SƠ MẬT")'), true);
  await evaluate('HoaiLanguage.set("en")');
  check('open reader switches back to English without closing', await evaluate('$("readerModal").classList.contains("open") && $("modalContentArea").querySelector(".helper-text").textContent.startsWith("FILE #14 // CLASSIFIED FILES")'), true);
  await evaluate('closeReader();openReader("post-3")');
  check('newly opened reader uses current language', await evaluate('$("modalContentArea").querySelector(".helper-text").textContent.startsWith("FILE #03 // SOLITARY NOTES")'), true);
  await evaluate('closeReader()');
  await evaluate('showToast("Đã lưu bài và ảnh lên Supabase.");updateMusicUI();renderPosts()');
  check('dynamic messages and newly rendered controls use English', await evaluate('[$("toastBox").textContent,$("btnRadioToggle").textContent,document.querySelector(".post-footer button").textContent]'), ['Post and images saved to Supabase.','▶ PLAY MUSIC','READ FILE →']);
  for (const width of [320,375,768,1280]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    check(`English layout fits ${width}px viewport`, await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  }
  await command('Page.reload'); await wait(200); await ready();
  check('English preference survives reload', await evaluate('[document.documentElement.lang,document.querySelector(".nav-btn").textContent]'), ['en','01. SANCTUARY']);
  await evaluate('document.querySelector("[data-language=vi]").click()');
  check('switching back restores Vietnamese interface', await evaluate('[document.documentElement.lang,document.querySelector(".nav-btn").textContent,$("postTitleInput").placeholder]'), ['vi','01. CÕI RIÊNG','Ví dụ: Đêm thứ 14 - Chỉ còn tiếng radio...']);
  await evaluate('window.scrollTo(0,0)');
  const artifacts = path.join(__dirname, 'artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifacts, 'desktop.png'), Buffer.from(screenshot.data, 'base64'));
  await evaluate('$("sec-backup").scrollIntoView({block:"start"});toggleRadio()');
  await wait(300);
  const radioShot = await command('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifacts, 'radio.png'), Buffer.from(radioShot.data, 'base64'));
  check('no uncaught browser exceptions', errors, []);
  console.log(`Verified ${passed} browser checks in Microsoft Edge.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  socket?.close();
  browser?.kill();
  server.closeAllConnections();
  server.close();
});
