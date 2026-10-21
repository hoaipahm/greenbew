'use strict';

let radioContext;
let radioOscillators = [];
let radioAnalyser;
let radioSamples;
let radioSpectrum;
let radioSynthGain;
let radioMasterGain;
let radioMusicSource;
let radioPlaying = false;
let radioChanging = false;
let musicChanging = false;
let currentFreq = 55;
let radioFrame;
let radioScrubbing = false;
let musicAutoPending = true;
let musicAutoStarting = false;
let musicUserPaused = false;
let musicPlaybackRequest = 0;
let musicHasPlayed = false;

function removeMusicStartListeners() {
  document.removeEventListener('pointerdown', startMusicOnInteraction, true);
  document.removeEventListener('keydown', startMusicOnInteraction, true);
}

function finishMusicAutostart() {
  musicAutoPending = false;
  removeMusicStartListeners();
}

async function startSoundtrack(automatic = false) {
  const request = ++musicPlaybackRequest;
  const audio = $('soundtrack');
  try {
    ensureRadioAudio();
    // resume() may wait for a gesture; do not let that lock the play/pause button.
    void radioContext.resume().then(() => {
      if (!musicUserPaused && !audio.paused) updateMusicUI();
    }).catch(error => console.warn('Không mở được âm thanh:', error));
    await audio.play();
    if (request !== musicPlaybackRequest || musicUserPaused) return;
    if (radioContext.state === 'running') finishMusicAutostart();
    updateMusicUI();
  } catch (error) {
    if (request !== musicPlaybackRequest || musicUserPaused) return;
    if (error.name === 'NotAllowedError') {
      musicAutoPending = true;
      $('musicStatus').textContent = '● CHẠM VÀO TRANG ĐỂ NGHE NHẠC';
    } else if (error.name !== 'AbortError') {
      finishMusicAutostart();
      $('musicStatus').textContent = '● KHÔNG PHÁT ĐƯỢC';
      if (!automatic) showToast('Chưa phát được nhạc. Kiểm tra kết nối rồi thử lại.');
    }
  }
}

async function tryMusicAutostart() {
  if (!musicAutoPending || musicUserPaused || musicAutoStarting || document.hidden) return;
  musicAutoStarting = true;
  try { await startSoundtrack(true); }
  finally { musicAutoStarting = false; }
}

function startMusicOnInteraction(event) {
  if (!event.isTrusted || !musicAutoPending || musicUserPaused) return;
  if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
  // Let the dedicated button handle its own click, avoiding a play-then-pause race.
  if (event.target.closest('#btnRadioToggle')) return;
  if (radioContext?.state === 'suspended') {
    void radioContext.resume().then(() => {
      if (!musicUserPaused && !$('soundtrack').paused) updateMusicUI();
    }).catch(error => console.warn('Không mở được âm thanh:', error));
  }
  void tryMusicAutostart();
}

// Music and synthesizer share one analyser and output; neither is played twice.
function ensureRadioAudio() {
  if (radioContext) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Trình duyệt chưa hỗ trợ bộ phát âm thanh này.');
  radioContext = new AudioContextClass();
  radioAnalyser = radioContext.createAnalyser();
  radioAnalyser.fftSize = 2048;
  radioAnalyser.smoothingTimeConstant = .8;
  radioSamples = new Float32Array(radioAnalyser.fftSize);
  radioSpectrum = new Uint8Array(radioAnalyser.frequencyBinCount);
  radioMasterGain = radioContext.createGain();
  radioMasterGain.gain.value = Number($('musicVolume').value) / 100;
  radioMasterGain.connect(radioAnalyser);
  radioAnalyser.connect(radioContext.destination);
  radioMusicSource = radioContext.createMediaElementSource($('soundtrack'));
  radioMusicSource.connect(radioMasterGain);
}

function createFrequencyRadio() {
  ensureRadioAudio();
  if (radioOscillators.length) return;
  const filter = radioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 240;
  radioSynthGain = radioContext.createGain();
  radioSynthGain.gain.value = 0;
  filter.connect(radioSynthGain);
  radioSynthGain.connect(radioMasterGain);
  radioOscillators = ['sawtooth', 'triangle'].map((type, index) => {
    const oscillator = radioContext.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = currentFreq * (index ? 1.5 : 1);
    oscillator.connect(filter);
    oscillator.start();
    return oscillator;
  });
}

function radioHasSignal() {
  return radioPlaying || !$('soundtrack').paused;
}

function drawRadioWave() {
  cancelAnimationFrame(radioFrame);
  const canvas = $('radioCanvas');
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas;
  const active = radioHasSignal() && radioContext?.state === 'running';
  context.fillStyle = '#020b08';
  context.fillRect(0, 0, width, height);
  context.lineWidth = 1;
  context.strokeStyle = '#0c261e';
  context.beginPath();
  for (let x = 0; x < width; x += 40) { context.moveTo(x, 0); context.lineTo(x, height); }
  for (let y = 0; y < height; y += 30) { context.moveTo(0, y); context.lineTo(width, y); }
  context.stroke();
  if (active) {
    radioAnalyser.getFloatTimeDomainData(radioSamples);
    radioAnalyser.getByteFrequencyData(radioSpectrum);
  }
  let peak = 0;
  if (active) for (const sample of radioSamples) peak = Math.max(peak, Math.abs(sample));
  // Visual gain keeps quiet passages legible without changing the listening volume.
  const visualGain = peak > 0 ? Math.min(40, .85 / peak) : 1;
  // Four windows of the measured audio waveform, with no simulated beat.
  for (let trace = 0; trace < 4; trace++) {
    const center = 38 + trace * 56;
    context.strokeStyle = active ? ['#196b57', '#2b9b81', '#00ff9d', '#a5ffe0'][trace] : '#164234';
    context.lineWidth = trace === 2 ? 2 : 1.3;
    context.shadowColor = '#00ff9d';
    context.shadowBlur = active && trace === 2 ? 9 : 0;
    context.beginPath();
    for (let x = 0; x < width; x += 2) {
      const index = Math.floor(x / width * 1024) + trace * 256;
      const sample = active ? radioSamples[index] * visualGain : 0;
      const y = center + sample * (24 + trace * 3);
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  context.shadowBlur = 0;
  const gradient = context.createLinearGradient(0, 260, 0, height);
  gradient.addColorStop(0, '#bdffe8');
  gradient.addColorStop(.35, '#00ff9d');
  gradient.addColorStop(1, '#08573e');
  context.fillStyle = gradient;
  for (let band = 0; band < 64; band++) {
    const low = Math.floor(Math.pow(radioSpectrum?.length || 1024, band / 64));
    const high = Math.max(low + 1, Math.floor(Math.pow(radioSpectrum?.length || 1024, (band + 1) / 64)));
    let magnitude = 0;
    if (active) {
      for (let bin = low; bin < high; bin++) magnitude = Math.max(magnitude, radioSpectrum[bin] || 0);
    }
    const barHeight = Math.max(2, magnitude / 255 * 95);
    const x = band * width / 64;
    context.fillRect(x + 2, height - barHeight, width / 64 - 4, barHeight);
  }
  if (active && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    radioFrame = requestAnimationFrame(drawRadioWave);
  }
}

function updateFrequencyUI() {
  $('frequencyReadout').textContent = currentFreq;
  $('btnFrequencyToggle').textContent = radioPlaying ? 'TẮT NỀN SYNTH' : 'BẬT NỀN SYNTH';
  $('btnFrequencyToggle').setAttribute('aria-pressed', String(radioPlaying));
  $('frequencyStatus').textContent = `${currentFreq} Hz // ${radioPlaying ? 'NỀN ĐANG PHÁT' : 'NỀN ĐANG TẮT'}`;
  document.querySelectorAll('[data-frequency]').forEach(button => {
    const selected = Number(button.dataset.frequency) === currentFreq;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  updateMusicUI();
}

async function toggleFrequencyRadio() {
  if (radioChanging) return;
  radioChanging = true;
  $('btnFrequencyToggle').disabled = true;
  try {
    createFrequencyRadio();
    await radioContext.resume();
    radioPlaying = !radioPlaying;
    radioSynthGain.gain.setTargetAtTime(radioPlaying ? .08 : 0, radioContext.currentTime, .04);
    updateFrequencyUI();
  } catch (error) {
    showToast('Chưa bật/tắt được tần số: ' + error.message);
  } finally {
    radioChanging = false;
    $('btnFrequencyToggle').disabled = false;
  }
}

function changeRadioFreq(frequency) {
  if (![55, 110, 73.4].includes(frequency)) return;
  currentFreq = frequency;
  radioOscillators.forEach((oscillator, index) => {
    oscillator.frequency.setValueAtTime(frequency * (index ? 1.5 : 1), radioContext.currentTime);
  });
  updateFrequencyUI();
}

async function toggleRadio() {
  if (musicChanging) return;
  musicChanging = true;
  $('btnRadioToggle').disabled = true;
  try {
    if ($('soundtrack').paused) {
      musicUserPaused = false;
      await startSoundtrack();
    } else {
      musicUserPaused = true;
      ++musicPlaybackRequest;
      finishMusicAutostart();
      $('soundtrack').pause();
    }
  } catch {
    $('musicStatus').textContent = '● KHÔNG PHÁT ĐƯỢC';
    showToast('Chưa phát được nhạc. Kiểm tra kết nối rồi thử lại.');
  } finally {
    musicChanging = false;
    $('btnRadioToggle').disabled = false;
  }
}

function updateMusicUI() {
  const playing = !$('soundtrack').paused;
  if (playing && radioContext?.state === 'running') {
    musicHasPlayed = true;
    finishMusicAutostart();
  }
  $('btnRadioToggle').textContent = playing ? 'Ⅱ TẠM DỪNG' : '▶ PHÁT NHẠC';
  $('btnRadioToggle').setAttribute('aria-pressed', String(playing));
  $('musicStatus').textContent = playing ? (radioPlaying ? '● OST + SYNTH' : '● ON AIR // OST')
    : (radioPlaying ? '● ON AIR // SYNTH' : '● STANDBY');
  if (playing && radioContext?.state === 'suspended') $('musicStatus').textContent = '● CHẠM VÀO TRANG ĐỂ NGHE NHẠC';
  $('musicStatus').classList.toggle('on-air', radioHasSignal());
  drawRadioWave();
}

function formatRadioTime(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  const rest = String(value % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${String(minutes).padStart(2, '0')}:${rest}`;
}

function updateRadioTimeline() {
  const audio = $('soundtrack');
  const hasDuration = Number.isFinite(audio.duration) && audio.duration > 0;
  const displayTime = radioScrubbing && hasDuration ? Number($('musicSeek').value) / 1000 * audio.duration : audio.currentTime;
  $('musicElapsed').textContent = formatRadioTime(displayTime);
  $('musicDuration').textContent = formatRadioTime(audio.duration);
  $('musicSeek').disabled = !hasDuration;
  if (!radioScrubbing) $('musicSeek').value = hasDuration ? Math.round(audio.currentTime / audio.duration * 1000) : 0;
  $('musicSeek').setAttribute('aria-valuetext', `${formatRadioTime(displayTime)} / ${formatRadioTime(audio.duration)}`);
}

function changePlaybackRate(rate) {
  if (![.25, .5, 1, 1.5].includes(rate)) return;
  $('soundtrack').preservesPitch = true;
  $('soundtrack').playbackRate = rate;
  document.querySelectorAll('[data-playback-rate]').forEach(button => {
    const selected = Number(button.dataset.playbackRate) === rate;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function setupRadioPlayer() {
  updateFrequencyUI();
  document.addEventListener('visibilitychange', drawRadioWave);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', drawRadioWave);
  for (const event of ['play', 'pause', 'ended', 'playing']) $('soundtrack').addEventListener(event, updateMusicUI);
  $('soundtrack').addEventListener('pause', () => {
    if (musicHasPlayed && $('soundtrack').paused) {
      musicUserPaused = true;
      finishMusicAutostart();
    }
  });
  for (const event of ['timeupdate', 'loadedmetadata', 'durationchange', 'seeked', 'emptied']) {
    $('soundtrack').addEventListener(event, updateRadioTimeline);
  }
  $('soundtrack').addEventListener('error', () => {
    updateMusicUI();
    $('musicStatus').textContent = '● LỖI TẢI NHẠC';
    showToast('Không tải được soundtrack. Kiểm tra tệp nhạc và kết nối.');
  });
  $('soundtrack').addEventListener('waiting', () => {
    if (!$('soundtrack').paused) $('musicStatus').textContent = '● ĐANG TẢI ĐOẠN NHẠC…';
  });
  $('soundtrack').addEventListener('seeking', () => { $('musicStatus').textContent = '● ĐANG TUA…'; });
  $('soundtrack').addEventListener('seeked', updateMusicUI);
  // Preview while dragging; seek only once when the mouse/touch is released.
  $('musicSeek').addEventListener('input', () => {
    radioScrubbing = true;
    updateRadioTimeline();
  });
  $('musicSeek').addEventListener('change', () => {
    const audio = $('soundtrack');
    const position = Number($('musicSeek').value);
    radioScrubbing = false;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.max(0, Math.min(audio.duration, position / 1000 * audio.duration));
    }
    updateRadioTimeline();
  });
  const cancelScrub = () => { radioScrubbing = false; updateRadioTimeline(); };
  $('musicSeek').addEventListener('pointercancel', cancelScrub);
  $('musicSeek').addEventListener('blur', cancelScrub);
  $('musicSeek').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); cancelScrub(); }
  });
  $('musicVolume').addEventListener('input', () => {
    const volume = Number($('musicVolume').value);
    $('volumeReadout').textContent = volume + '%';
    if (radioMasterGain) radioMasterGain.gain.setTargetAtTime(volume / 100, radioContext.currentTime, .02);
  });
  new ResizeObserver(drawRadioWave).observe($('radioCanvas'));
  document.addEventListener('pointerdown', startMusicOnInteraction, true);
  document.addEventListener('keydown', startMusicOnInteraction, true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void tryMusicAutostart();
  });
  void tryMusicAutostart();
}
