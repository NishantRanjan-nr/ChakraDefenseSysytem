/* Main frontend script (single IIFE) */
(() => {
  // Utils
  const $ = (sel) => document.querySelector(sel);
  const safeText = (el, text) => { if (el) el.textContent = text; };

  // State
  let alertsCount = 0;
  let audioCtx = null;

  // Elements
  const qrStatusEl = $('#qrStatus');
  const crowdEl = $('#crowd');
  const alertMsgEl = $('#alertMsg');
  const alertCardEl = $('#alertCard');
  const activeAlertsEl = $('#activeAlerts');
  const avgDensityEl = $('#avgDensity');
  const alertModal = $('#alertModal');
  const alertDetails = $('#alertDetails');
  const dismissAlertBtn = $('#dismissAlert');
  // chart removed: no density canvas
  const startBtn = document.getElementById('startCam');

  // Theme toggle (if present)
  const themeToggle = $('#themeToggle');
  if (themeToggle) {
    const applyTheme = (t) => { document.body.setAttribute('data-theme', t); localStorage.setItem('theme', t); themeToggle.textContent = t === 'dark' ? 'Dark' : 'Light'; };
    const saved = localStorage.getItem('theme');
    applyTheme(saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    themeToggle.addEventListener('click', () => applyTheme(document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  }

  // Modal helpers
  function openModal(message) {
    if (!alertModal || !alertDetails) return;
    alertDetails.textContent = message;
    alertModal.hidden = false;
    alertModal.setAttribute('aria-hidden', 'false');
    const panel = alertModal.querySelector('.modal-panel');
    panel && panel.focus();
    playBeep();
  }

  function closeModal() {
    if (!alertModal) return;
    alertModal.hidden = true;
    alertModal.setAttribute('aria-hidden', 'true');
  }

  // Keyboard dismiss
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Dismiss button
  if (dismissAlertBtn) dismissAlertBtn.addEventListener('click', closeModal);
  if (alertModal) alertModal.addEventListener('click', (e) => { if (e.target === alertModal) closeModal(); });

  // Reusable audio beep
  function playBeep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.value = 0.02;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      setTimeout(() => { o.stop(); }, 120);
    } catch (e) { /* ignore — browser may block autoplay */ }
  }


  // Public actions
  function scanQR() {
    safeText(qrStatusEl, 'QR Verified — Entry Allowed');
    safeText(crowdEl, 'Moderate');
    safeText(avgDensityEl, 'Moderate');
  }

  function detectMisbehavior() {
    alertsCount += 1;
    safeText(alertMsgEl, 'AI detected suspicious behavior');
    safeText(alertDetails, 'Misbehavior detected by AI. Authorities have been notified.');
    alertCardEl && alertCardEl.classList.add('active');
    safeText(activeAlertsEl, String(alertsCount));
    safeText(crowdEl, 'High');
    safeText(avgDensityEl, 'High');
    openModal('Crowd behavior anomaly detected. Check live feeds and consider emergency controls.');
  }

  // Expose functions for inline handlers
  window.scanQR = scanQR;
  window.detectMisbehavior = detectMisbehavior;

  // --- Capture UI (camera, capture, download zip, upload) ---
  const cameraSelect = document.getElementById('cameraSelect');
  const stopBtn = document.getElementById('stopCam');
  const captureBtn = $('#captureBtn');
  const downloadZipBtn = $('#downloadZip');
  const uploadBtn = $('#uploadToServer');
  const videoEl = document.getElementById('captureVideo');
  const thumbsEl = $('#thumbs');
  const cameraStatusEl = document.getElementById('cameraStatus');
  const serverStatusEl = document.getElementById('serverStatus');
  const testServerBtn = document.getElementById('testServerBtn');
  let mediaStream = null;
  const capturedBlobs = [];

  async function startCamera() {
    console.debug('startCamera: invoked');
    // stop previous stream if present
    if (mediaStream) {
      mediaStream.getTracks().forEach(t=>t.stop());
      mediaStream = null;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      console.debug('startCamera: requesting getUserMedia');
      const constraints = { video: { width: 640, height: 360 } };
      // use selected device if present
      if (cameraSelect && cameraSelect.value) {
        constraints.video.deviceId = { exact: cameraSelect.value };
      }
      cameraStatusEl && (cameraStatusEl.textContent = 'Starting camera...');
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoEl) videoEl.srcObject = mediaStream;
      if (captureBtn) captureBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = false;
      // enable upload/download once we have a frame later
      cameraStatusEl && (cameraStatusEl.textContent = 'Camera started');
    } catch (err) {
      console.error('camera error', err);
      cameraStatusEl && (cameraStatusEl.textContent = 'Camera error: ' + (err.message || err));
      cameraStatusEl && cameraStatusEl.classList.add('error');
    }
  }

    // NOTE: file-upload UI removed — uploadSelectedFile() was removed.

  // Enumerate cameras and populate select
  async function enumerateCameras(){
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.debug('enumerateCameras: enumerateDevices not supported');
      return [];
    }
    try{
      console.debug('enumerateCameras: querying devices');
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d=>d.kind === 'videoinput');

      if (cameraSelect) {
        cameraSelect.innerHTML = '';
        cams.forEach((c, idx)=>{
          const opt = document.createElement('option');
          opt.value = c.deviceId;
          // labels may be empty until permission is granted — show placeholder
          opt.text = c.label || `Camera ${idx+1}`;
          cameraSelect.appendChild(opt);
        });
        if (cameraStatusEl) cameraStatusEl.textContent = cams.length ? `Found ${cams.length} camera(s)` : 'No cameras found';
      }
      if (cams.length) startBtn && (startBtn.disabled = false);
      return cams;
    }catch(e){console.warn('enumerate devices failed', e); return []; }
  }

  // update devices on devicechange
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', enumerateCameras);
  }

  // Hook up start/stop/capture/upload button handlers
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.style.pointerEvents = 'auto';
    startBtn.addEventListener('click', async (e)=>{ e.preventDefault();
      cameraStatusEl && cameraStatusEl.classList.remove('error');
      cameraStatusEl && (cameraStatusEl.textContent = 'Requesting camera permission...');
      try{
        const cams = await enumerateCameras();
        const phoneRegex = /phone|mobile|pixel|galaxy|realme|adb|usb|external|iphone|android|droidcam|ip webcam|ip-webcam|obs/i;
        let chosen = null;
        if (cams && cams.length) {
          chosen = cams.find(c => !(c.label && phoneRegex.test(c.label))) || cams[0];
        }
        if (chosen && cameraSelect) {
          cameraSelect.value = chosen.deviceId;
        }
        await startCamera();
      }catch(err){
        console.error('start camera failed', err);
        cameraStatusEl && (cameraStatusEl.textContent = 'Failed to start camera: ' + (err.message || err));
        cameraStatusEl && cameraStatusEl.classList.add('error');
      }
    });
  }

  if (stopBtn) stopBtn.addEventListener('click', (e)=>{ e.preventDefault(); stopCamera(); });
  cameraSelect && cameraSelect.addEventListener('change', ()=>{ if (mediaStream) startCamera(); });
  captureBtn && captureBtn.addEventListener('click', captureFrame);
  downloadZipBtn && downloadZipBtn.addEventListener('click', downloadZip);
  uploadBtn && uploadBtn.addEventListener('click', uploadLastToServer);

  function captureFrame() {
    if (!videoEl) return;
    const c = document.createElement('canvas');
    c.width = videoEl.videoWidth || 640;
    c.height = videoEl.videoHeight || 360;
    const ctx = c.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return;
      capturedBlobs.push(blob);
      const url = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.src = url;
      thumbsEl && thumbsEl.prepend(img);
      if (downloadZipBtn) downloadZipBtn.disabled = false;
      if (uploadBtn) uploadBtn.disabled = false;
    }, 'image/jpeg', 0.85);
  }

  async function downloadZip() {
    if (!window.JSZip) {
      alert('JSZip not loaded');
      return;
    }
    const zip = new JSZip();
    capturedBlobs.forEach((b, i) => {
      zip.file(`capture_${String(i+1).padStart(3,'0')}.jpg`, b);
    });
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = 'captures.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function uploadLastToServer() {
    if (!capturedBlobs.length) {
      cameraStatusEl && (cameraStatusEl.textContent = 'No captured images to upload.');
      return;
    }
    const last = capturedBlobs[capturedBlobs.length - 1];
    const fd = new FormData();
    fd.append('file', last, 'capture.jpg');
    const endpoint = (window.SERVER_ENDPOINT && window.SERVER_ENDPOINT.url) || 'http://localhost:8000/detect-image';
    // include threshold and confidence query params
    // Use default thresholds; upload UI removed
    const thr = 5;
    const confThr = 0.3;
    const url = `${endpoint}?threshold=${encodeURIComponent(thr)}&conf_threshold=${encodeURIComponent(confThr)}`;
    if (uploadBtn) uploadBtn.disabled = true;
    cameraStatusEl && (cameraStatusEl.textContent = 'Uploading image to server...');
    try {
      const res = await fetch(url, { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text().catch(()=>res.statusText || '');
        throw new Error(`Server responded ${res.status} ${text}`);
      }
      const json = await res.json().catch(()=>null);
      if (!json) {
        safeText(alertMsgEl, 'Server returned an unexpected response.');
        cameraStatusEl && (cameraStatusEl.textContent = 'Upload complete — unexpected server response.');
      } else {
        // update UI with counts and detection info (no dedicated upload UI present)
        cameraStatusEl && (cameraStatusEl.textContent = json.alert ? 'Server reported alert' : 'Server analysis: no alert');
        if (json.alert) {
          if (json.detections && json.detections.length) {
            const detail = `Server detected: ${JSON.stringify(json.detections)}`;
            safeText(alertDetails, detail);
          }
          safeText(cameraStatusEl, `ALERT: ${json.person_count || 'unknown'} > ${json.threshold}`);
          window.detectMisbehavior && window.detectMisbehavior();
        } else {
          safeText(alertMsgEl, 'Server analysis: no alert');
          safeText(cameraStatusEl, `OK: ${json.person_count || 0} ≤ ${json.threshold}`);
        }
      }
    } catch (e) {
      console.error('upload error', e);
      const msg = e && e.message ? e.message : String(e);
      cameraStatusEl && (cameraStatusEl.textContent = `Upload failed: ${msg}`);
      cameraStatusEl && cameraStatusEl.classList.add('error');
      // Helpful hint
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ECONNREFUSED')){
        cameraStatusEl && (cameraStatusEl.textContent += ' — ensure the detection server is running at http://localhost:8000 and CORS is enabled.');
      }
    } finally {
      if (uploadBtn) uploadBtn.disabled = false;
    }
  }

  // --- Server test utility ---
  async function testServer(){
    const endpoint = (window.SERVER_ENDPOINT && window.SERVER_ENDPOINT.url) || 'http://localhost:8000/docs';
    serverStatusEl && (serverStatusEl.classList.remove('error'));
    serverStatusEl && (serverStatusEl.textContent = `Pinging ${endpoint} ...`);
    const controller = new AbortController();
    const timeout = setTimeout(()=> controller.abort(), 4500);
    try{
      const res = await fetch(endpoint, { method: 'GET', signal: controller.signal, mode: 'cors' });
      clearTimeout(timeout);
      if (!res.ok) {
        serverStatusEl && (serverStatusEl.textContent = `Server responded ${res.status}`);
        serverStatusEl && serverStatusEl.classList.add('error');
        return false;
      }
      serverStatusEl && (serverStatusEl.textContent = 'Server reachable');
      return true;
    }catch(e){
      clearTimeout(timeout);
      const msg = e && e.name === 'AbortError' ? 'Request timed out' : (e && e.message) || String(e);
      serverStatusEl && (serverStatusEl.textContent = `Server test failed: ${msg}`);
      serverStatusEl && serverStatusEl.classList.add('error');
      return false;
    }
  }

  if (testServerBtn) testServerBtn.addEventListener('click', async (e)=>{ e.preventDefault(); testServer(); });

  // --- Heatmap rendering and emergency/authority controls ---
  // Minimal heatmap: random gaussian spots based on preset density
  const heatmapCanvas = document.getElementById('heatmapCanvas');
  const heatmapDensityLabel = document.getElementById('heatmapDensityLabel');
  const refreshHeatmapBtn = document.getElementById('refreshHeatmap');
  const heatmapPreset = document.getElementById('heatmapPreset');
  const triggerAlarmBtn = document.getElementById('triggerAlarm');
  const toggleLockdownBtn = document.getElementById('toggleLockdown');
  const sendAuthorityAlertBtn = document.getElementById('sendAuthorityAlert');
  const clearAlertsBtn = document.getElementById('clearAlerts');
  const controlStatusEl = document.getElementById('controlStatus');
  let lockdownActive = false;

  function drawHeatmap(preset) {
    if (!heatmapCanvas) return;
    const ctx = heatmapCanvas.getContext('2d');
    const w = heatmapCanvas.width;
    const h = heatmapCanvas.height;
    ctx.clearRect(0,0,w,h);
    // background
    const grad = ctx.createLinearGradient(0,0,w,0);
    grad.addColorStop(0,'#071018'); grad.addColorStop(1,'#0b0b0b');
    ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
    // number of hotspots by preset
    const mapCount = { low:6, moderate:12, high:22, critical:38 };
    const spots = mapCount[preset] || 12;
    for (let i=0;i<spots;i++){
      const x = Math.random()*w;
      const y = Math.random()*h;
      const radius = (30 + Math.random()*80) * (preset==='critical'?1.6:(preset==='high'?1.2:1));
      const intensity = (preset==='low'?0.2:(preset==='moderate'?0.45:(preset==='high'?0.7:0.95))) * (0.6 + Math.random()*0.8);
      const g = ctx.createRadialGradient(x,y,0,x,y,radius);
      g.addColorStop(0, `rgba(255,60,0,${intensity})`);
      g.addColorStop(0.4, `rgba(255,150,0,${intensity*0.6})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x-radius, y-radius, radius*2, radius*2);
    }
  }

  function updateHeatmapLabel(preset){
    if (heatmapDensityLabel) heatmapDensityLabel.textContent = `Density: ${preset.charAt(0).toUpperCase()+preset.slice(1)}`;
    if (crowdEl) crowdEl.textContent = preset.charAt(0).toUpperCase()+preset.slice(1);
    if (avgDensityEl) avgDensityEl.textContent = preset.charAt(0).toUpperCase()+preset.slice(1);
  }

  if (refreshHeatmapBtn) refreshHeatmapBtn.addEventListener('click', ()=>{
    const p = (heatmapPreset && heatmapPreset.value) || 'moderate';
    drawHeatmap(p);
    updateHeatmapLabel(p);
  });
  if (heatmapPreset) heatmapPreset.addEventListener('change', ()=>{ const p = heatmapPreset.value; drawHeatmap(p); updateHeatmapLabel(p); });

  // Emergency controls
  function triggerAlarm(){
    playBeep();
    safeText(controlStatusEl, 'Alarm triggered — loud alert sent');
    safeText(alertMsgEl, 'Manual alarm triggered by operator');
    alertsCount += 1; safeText(activeAlertsEl, String(alertsCount));
    openModal('Manual alarm activated. Check live feeds.');
  }

  function toggleLockdown(){
    lockdownActive = !lockdownActive;
    safeText(controlStatusEl, lockdownActive ? 'Lockdown: ACTIVE' : 'Lockdown: Released');
    toggleLockdownBtn && (toggleLockdownBtn.textContent = lockdownActive ? 'Release Lockdown' : 'Toggle Lockdown');
    if (lockdownActive) {
      safeText(alertMsgEl, 'Lockdown engaged by operator');
    } else {
      safeText(alertMsgEl, 'Lockdown released');
    }
  }

  function sendAuthorityAlert(){
    // minimal client-side behaviour: mark status and emit WS alert if available
    safeText(controlStatusEl, 'Authority alert sent');
    safeText(alertMsgEl, 'Authority alert dispatched');
    try{ if (window.__lastWs && window.__lastWs.readyState === 1) window.__lastWs.send(JSON.stringify({ type:'operator_alert', detail:'Operator dispatched authority alert' })); }catch(e){}
  }

  function clearAlerts(){
    alertsCount = 0; safeText(activeAlertsEl, String(alertsCount));
    safeText(alertMsgEl, 'Alerts cleared');
    safeText(controlStatusEl, 'Status: Idle');
    closeModal();
  }

  if (triggerAlarmBtn) triggerAlarmBtn.addEventListener('click', (e)=>{ e.preventDefault(); triggerAlarm(); });
  if (toggleLockdownBtn) toggleLockdownBtn.addEventListener('click', (e)=>{ e.preventDefault(); toggleLockdown(); });
  if (sendAuthorityAlertBtn) sendAuthorityAlertBtn.addEventListener('click', (e)=>{ e.preventDefault(); sendAuthorityAlert(); });
  if (clearAlertsBtn) clearAlertsBtn.addEventListener('click', (e)=>{ e.preventDefault(); clearAlerts(); });
  // Panel/tab handling: show only the selected admin panel
  const tabs = Array.from(document.querySelectorAll('.dash-card[data-target]'));
  const panels = {
    livePanel: document.getElementById('livePanel'),
    heatmapPanel: document.getElementById('heatmapPanel'),
    controlsPanel: document.getElementById('controlsPanel'),
    authorityPanel: document.getElementById('authorityPanel')
  };

  function hideAllPanels(){ Object.values(panels).forEach(p=>{ if (p) p.style.display = 'none'; }); tabs.forEach(t=>t.classList.remove('active')); }

  function showPanel(id){ hideAllPanels(); const p = panels[id]; if (!p) return; p.style.display = 'block';
    // mark tab active
    const tab = tabs.find(tb => tb.dataset && tb.dataset.target === id); if (tab) tab.classList.add('active');
    // panel-specific actions
    if (id === 'heatmapPanel'){
      const preset = (heatmapPreset && heatmapPreset.value) || 'moderate'; drawHeatmap(preset); updateHeatmapLabel(preset);
    }
    if (id === 'authorityPanel'){
      refreshAlertsList();
    }
  }

  tabs.forEach(t => t.addEventListener('click', ()=>{ const target = t.dataset && t.dataset.target; if (target) showPanel(target); }));

  // Alerts list management
  const alertsListEl = document.getElementById('alertsList');
  function refreshAlertsList(){ if (!alertsListEl) return; alertsListEl.innerHTML = ''; const now = new Date().toLocaleString(); const msg = (alertMsgEl && alertMsgEl.textContent) || 'No alerts'; const detail = (alertDetails && alertDetails.textContent) || ''; const item = document.createElement('div'); item.style.padding = '6px'; item.style.borderBottom = '1px solid rgba(255,255,255,0.02)'; item.innerHTML = `<strong>${now}</strong><div style="font-size:13px;margin-top:4px">${msg}</div><pre style="margin-top:6px">${detail}</pre>`; alertsListEl.prepend(item); }
  const refreshAlertsBtn = document.getElementById('refreshAlerts'); if (refreshAlertsBtn) refreshAlertsBtn.addEventListener('click', (e)=>{ e.preventDefault(); refreshAlertsList(); });

  // Show live panel by default
  setTimeout(()=>{ showPanel('livePanel'); }, 120);

  // Render initial heatmap
    setTimeout(()=>{ const p = (heatmapPreset && heatmapPreset.value) || 'moderate'; drawHeatmap(p); updateHeatmapLabel(p); }, 350);
  })();
