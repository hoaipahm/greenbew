'use strict';

window.HoaiSurveillance = (() => {
  const cameras = [
    { src: 'assets/quiet-room.jpg', title: 'Căn phòng im lặng' },
    { src: 'assets/visitor-at-door.png', title: 'Vị khách ngoài cửa' },
    { src: 'assets/broadcast-waiting-room.png', title: 'Buổi Tế Lễ' },
    { src: 'assets/hazmat-night.png', title: 'Tổ chức FEMA' }
  ];
  const messages = ['Phát hiện tiếng gõ cửa.', 'Không xác định người bên ngoài.', 'Tín hiệu nhiễu. Tiếp tục quan sát.', 'Cánh cửa vẫn đóng.'];
  let camera = 0;
  let signal = 0;
  let lastSwitch = Date.now();
  let lastSignal = Date.now();
  const log = [{ time: new Date(), text: 'Đã kết nối camera.' }];

  function paint() {
    const selected = cameras[camera];
    const image = document.getElementById('cameraImage');
    if (image.getAttribute('src') !== selected.src) image.src = selected.src;
    image.alt = HoaiLanguage.translate(selected.title);
    document.getElementById('cameraLocation').textContent = HoaiLanguage.translate(selected.title);
    document.getElementById('cameraNumber').textContent = `CAM ${String(camera + 1).padStart(2, '0')}`;
    const list = document.getElementById('signalLog');
    list.replaceChildren(...log.map(entry => {
      const row = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = entry.time.toISOString();
      time.textContent = entry.time.toLocaleTimeString('en-GB', { hour12: false });
      const text = document.createElement('span');
      text.textContent = HoaiLanguage.translate(entry.text);
      row.append(time, text);
      return row;
    }));
  }

  function next() {
    camera = (camera + 1) % cameras.length;
    lastSwitch = Date.now();
    paint();
  }

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function tick() {
    if (document.hidden) return;
    document.getElementById('cameraClock').textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    if (!reduceMotion.matches && Date.now() - lastSwitch >= 18000) next();
    if (Date.now() - lastSignal >= 14000) {
      log.unshift({ time: new Date(), text: messages[signal++ % messages.length] });
      log.splice(5);
      lastSignal = Date.now();
      paint();
    }
  }
  window.addEventListener('hoai-language-change', paint);
  paint();
  tick();
  const timer = setInterval(tick, 1000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  return { next };
})();
