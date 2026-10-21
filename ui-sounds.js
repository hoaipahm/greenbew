'use strict';

window.HoaiSounds = (() => {
  let context;
  let output;
  let echo;
  let noiseBuffer;
  let enabled = true;
  try { enabled = localStorage.getItem('HOAI_UI_SOUND') !== 'off'; }
  catch { /* Sound preferences are optional when browser storage is unavailable. */ }

  function paint() {
    const button = document.getElementById('btnUISound');
    if (!button) return;
    button.textContent = enabled ? '♪ TIẾNG BẤM: BẬT' : '♪ TIẾNG BẤM: TẮT';
    button.setAttribute('aria-pressed', String(enabled));
  }

  function play(destructive = false) {
    if (!enabled) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!context) {
        context = new AudioContextClass();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.ratio.value = 8;
        limiter.attack.value = .003;
        limiter.release.value = .12;
        output = context.createGain();
        output.gain.value = .8;
        output.connect(limiter);
        limiter.connect(context.destination);
        echo = context.createDelay(.3);
        echo.delayTime.value = .085;
        const echoLevel = context.createGain();
        echoLevel.gain.value = .25;
        echo.connect(echoLevel);
        echoLevel.connect(output);
        noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * .075), context.sampleRate);
        const noise = noiseBuffer.getChannelData(0);
        for (let index = 0; index < noise.length; index++) noise[index] = (Math.random() * 2 - 1) * (1 - index / noise.length);
      }
      const sound = () => {
        if (!enabled) return;
        const now = context.currentTime;
        const envelope = (peak, duration) => {
          const gain = context.createGain();
          gain.gain.setValueAtTime(.0001, now);
          gain.gain.exponentialRampToValueAtTime(peak, now + .006);
          gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
          gain.connect(output);
          gain.connect(echo);
          return gain;
        };
        // Detuned falling tones, a metallic attack and filtered radio hiss.
        const base = destructive ? 125 : 220;
        for (const [frequency, peak, duration] of [[base, .14, .23], [base * 1.05946, .085, .28], [1760, .045, .065]]) {
          const oscillator = context.createOscillator();
          const gain = envelope(peak, duration);
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency, now);
          oscillator.frequency.exponentialRampToValueAtTime(frequency * .52, now + duration);
          oscillator.connect(gain);
          oscillator.start(now);
          oscillator.stop(now + duration + .01);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        }
        const hiss = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const hissGain = envelope(.07, .075);
        filter.type = 'bandpass';
        filter.frequency.value = destructive ? 900 : 1900;
        filter.Q.value = 1.2;
        hiss.buffer = noiseBuffer;
        hiss.connect(filter);
        filter.connect(hissGain);
        hiss.start(now);
        hiss.onended = () => { hiss.disconnect(); filter.disconnect(); hissGain.disconnect(); };
      };
      if (context.state === 'running') sound();
      else void context.resume().then(sound).catch(error => console.warn('Không mở được âm thanh giao diện:', error));
    } catch (error) { console.warn('Không phát được tiếng bấm:', error); }
  }

  function toggle() {
    enabled = !enabled;
    try { localStorage.setItem('HOAI_UI_SOUND', enabled ? 'on' : 'off'); }
    catch { /* The current tab can still toggle sounds without saved preferences. */ }
    paint();
    if (enabled) play();
  }

  function setup() {
    paint();
    // A click also covers keyboard activation; no sound on typing or slider movement.
    document.addEventListener('click', event => {
      if (event.target.matches('input, select, textarea')) return;
      const button = event.target.closest('button, a.social-link, label.write-cta-btn, label.btn-sm, label.upload-dropzone');
      if (!button || button.id === 'btnUISound' || button.disabled || button.closest('[inert]')) return;
      play(button.classList.contains('btn-danger-sm'));
    }, true);
  }

  return { setup, toggle, get enabled() { return enabled; } };
})();
