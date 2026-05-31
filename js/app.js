let currentLang = 'en';
let userLocation = null;
let userMarker = null;
let userPulse = null;
let map = null;
let markers = [];
let currentFilter = 'all';
let currentSort = 'distance';
let currentView = 'list';
let savedContacts = JSON.parse(localStorage.getItem('roadsos_saved') || '[]');
let allServices = [];
let isSatelliteView = false;

function t(key) { return translations[currentLang][key] || key; }

function switchLang() {
  currentLang = currentLang === 'en' ? 'hi' : 'en';
  renderAll();
}

function showToast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function flattenServices() {
  const all = [];
  Object.values(emergencyData).forEach(cat => {
    cat.forEach(s => {
      all.push({ ...s, distance: userLocation ? getDistance(userLocation.lat, userLocation.lng, s.lat || userLocation.lat, s.lng || userLocation.lng) : 0 });
    });
  });
  return all;
}

function getTypeIcon(type) {
  const icons = { trauma: '🏥', ambulance: '🚑', police: '👮', rescue: '🚗', contact: '📞' };
  return icons[type] || '📍';
}

function getMarkerColor(type) {
  const colors = { trauma: '#E63946', ambulance: '#457B9D', police: '#4338ca', rescue: '#ea580c', contact: '#d97706' };
  return colors[type] || '#666';
}

function formatPhone(phone) {
  const n = phone.replace(/[^0-9+]/g, '');
  if (n.startsWith('+')) return n;
  if (n.length <= 4) return n;
  return '+' + n;
}

function isSaved(id) { return savedContacts.includes(id); }

function toggleSave(id) {
  if (isSaved(id)) { savedContacts = savedContacts.filter(s => s !== id); }
  else { savedContacts.push(id); }
  localStorage.setItem('roadsos_saved', JSON.stringify(savedContacts));
  renderServices();
  renderSaved();
}

// Geolocation
function detectLocation() {
  const statusEl = document.getElementById('location-status');
  statusEl.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px"></span> ${t('loading_location')}`;
  statusEl.className = 'location-status loading';

  if (!navigator.geolocation) {
    statusEl.innerHTML = `⚠️ ${t('location_error')}`;
    statusEl.className = 'location-status error';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      statusEl.innerHTML = `📍 ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
      statusEl.className = 'location-status success';
      document.getElementById('report-location').value = `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
      allServices = flattenServices();
      initMap();
      renderServices();
      renderEmergencyNumbers();
      renderSaved();
    },
    err => {
      statusEl.innerHTML = `⚠️ ${t('location_error')} (${err.message})`;
      statusEl.className = 'location-status error';
      userLocation = { lat: 13.0358, lng: 80.2464 };
      allServices = flattenServices();
      initMap();
      renderServices();
      renderSaved();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// Map
function initMap() {
  map = L.map('map', { zoomControl: false }).setView([userLocation.lat, userLocation.lng], 13);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  const userIcon = L.divIcon({
    className: '',
    html: '<div class="user-marker"><div class="user-pulse"></div></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
  userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
  userMarker.bindPopup(`<div class="popup-content"><h4>📍 You are here</h4></div>`);

  addServiceMarkers();

  if (map._isFullscreen === undefined) {
    L.control.fullscreen = L.Control.extend({
      onAdd: function() { const btn = L.DomUtil.create('button', 'leaflet-control-fullscreen'); btn.innerHTML = '⛶'; btn.title = 'Fullscreen'; btn.onclick = function() { const el = document.getElementById('map'); if (document.fullscreenElement) { document.exitFullscreen(); } else { el.requestFullscreen(); } }; return btn; },
      onRemove: function() {}
    });
    L.control.fullscreen({ position: 'topright' }).addTo(map);
  }
}

function addServiceMarkers() {
  markers.forEach(m => { if (map) map.removeLayer(m); });
  markers = [];
  const shown = new Set(currentFilter === 'all' ? allServices.map(s => s.id) : allServices.filter(s => s.type === currentFilter).map(s => s.id));

  allServices.forEach(s => {
    if (!s.lat || !s.lng) return;
    const color = getMarkerColor(s.type);
    const icon = L.divIcon({
      className: '',
      html: `<div class="custom-marker ${s.type}" style="background:${color}">${getTypeIcon(s.type)}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    const marker = L.marker([s.lat, s.lng], { icon });
    marker.serviceId = s.id;
    if (shown.has(s.id)) marker.addTo(map);

    const distText = userLocation ? `<p>📏 ${s.distance.toFixed(1)} km</p>` : '';
    const phoneHtml = s.phone ? `<div class="popup-phone">📞 ${s.phone}</div>` : '';

    marker.bindPopup(`
      <div class="popup-content">
        <h4>${getTypeIcon(s.type)} ${s.name}</h4>
        <p>${s.subtype}</p>
        ${distText}
        ${phoneHtml}
        <div class="popup-actions">
          ${s.phone ? `<a href="tel:${formatPhone(s.phone)}" class="popup-call">📞 ${t('call')}</a>` : ''}
          ${s.lat ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank" class="popup-dir">🗺️ ${t('directions')}</a>` : ''}
        </div>
      </div>
    `);

    markers.push(marker);
  });
}

// SOS
function triggerSOS() {
  document.getElementById('sos-modal').classList.add('show');
}

function confirmSOS() {
  document.getElementById('sos-modal').classList.remove('show');
  const btn = document.getElementById('sos-btn');
  btn.classList.add('sending');
  btn.innerHTML = `<span class="sos-icon">🆘</span><span>${t('sos_sending')}</span>`;

  if (userLocation) {
    const url = `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
    smartSOSBroadcast(userLocation.lat, userLocation.lng, '').then(advice => {
      document.getElementById('sos-analysis-content').innerHTML = `
        <div class="ai-section">
          <h5>🚨 AI Emergency Guidance</h5>
          <div style="font-size:0.85rem;color:var(--gray-600);line-height:1.6">${advice.replace(/\n/g, '<br>')}</div>
        </div>`;
      document.getElementById('sos-analysis-modal').classList.add('show');
    }).catch(() => {});
    signInAnonymously();
  }

  setTimeout(() => {
    btn.classList.remove('sending');
    btn.classList.add('sent');
    btn.innerHTML = `<span class="sos-icon">✅</span><span>${t('sos_sent')}</span>`;
    showToast(t('sos_sent'), 5000);

    if (userLocation) {
      const url = `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
      if (navigator.share) {
        navigator.share({ title: 'SOS Emergency', text: `🚨 EMERGENCY! I need help at: ${url}`, url }).catch(() => {});
      }
    }

    setTimeout(() => {
      btn.classList.remove('sent');
      btn.innerHTML = `<span class="sos-icon">🆘</span><span>${t('sos_button')}</span><span class="sos-sub">${t('tap_sos')}</span>`;
    }, 6000);
  }, 2500);
}

function closeAnalysis() {
  document.getElementById('sos-analysis-modal').classList.remove('show');
}

function cancelSOS() {
  document.getElementById('sos-modal').classList.remove('show');
}

// Call
function callNumber(number) {
  window.location.href = `tel:${formatPhone(number)}`;
}

function callEmergency(code) {
  window.location.href = `tel:${code}`;
}

// Share Location
function shareLocation() {
  if (!userLocation) { showToast(t('location_error')); return; }
  const url = `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
  const msg = `🚨 RoadSoS Emergency! My location: ${url}`;

  if (navigator.share) {
    navigator.share({ title: 'My Location - RoadSoS', text: msg, url }).catch(() => {});
  } else {
    const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(wa, '_blank');
  }
}

function shareService(name) {
  const msg = `RoadSoS - Check out: ${name}`;
  if (navigator.share) {
    navigator.share({ title: name, text: msg }).catch(() => {});
  } else {
    const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(wa, '_blank');
  }
}

function openMapFor(id) {
  const s = allServices.find(x => x.id === id);
  if (!s || !s.lat || !s.lng || !map) return;
  map.setView([s.lat, s.lng], 16);
  const m = markers.find(m => {
    const ll = m.getLatLng();
    return Math.abs(ll.lat - s.lat) < 0.001 && Math.abs(ll.lng - s.lng) < 0.001;
  });
  if (m) m.openPopup();
  switchView('map');
  document.getElementById('services').scrollIntoView({ behavior: 'smooth' });
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  const btn = view === 'list' ? document.getElementById('view-list') : document.getElementById('view-map');
  if (btn) btn.classList.add('active');
  document.getElementById('services-list').style.display = view === 'list' ? 'block' : 'none';
  document.getElementById('map-container').style.display = view === 'map' ? 'block' : 'none';
  if (view === 'map' && map) setTimeout(() => map.invalidateSize(), 100);
}

function setFilter(type) {
  currentFilter = type;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const el = document.querySelector(`[data-filter="${type}"]`);
  if (el) el.classList.add('active');
  renderServices();
}

function setSort(type) {
  currentSort = type;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  const el = document.querySelector(`[data-sort="${type}"]`);
  if (el) el.classList.add('active');
  renderServices();
}

// Report Form
function selectSeverity(el, level) {
  document.querySelectorAll('.severity-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('report-severity').value = level;
}

function handlePhotoUpload(input) {
  const label = document.getElementById('photo-label');
  if (input.files && input.files[0]) {
    label.textContent = `📸 ${input.files[0].name}`;
  } else {
    label.textContent = `📷 ${t('report_photo')}`;
  }
}

function submitReport(e) {
  e.preventDefault();
  const desc = document.getElementById('report-desc').value;
  const severity = document.getElementById('report-severity').value;
  if (!desc.trim()) { showToast('Please describe the accident'); return; }
  showToast('🤖 AI analyzing your report...', 2000);

  const reportData = {
    severity,
    description: desc,
    location: userLocation ? `${userLocation.lat},${userLocation.lng}` : 'unknown',
    timestamp: new Date().toISOString()
  };

  const photoInput = document.querySelector('#report-form input[type="file"]');
  const photoFile = photoInput?.files?.[0];

  (async () => {
    if (photoFile) {
      const url = await uploadPhoto(photoFile);
      if (url) reportData.photoUrl = url;
    }
    const reportId = await saveReport(reportData);
    if (reportId) showToast(`✅ Report #${reportId.slice(0,6)} saved to cloud`, 4000);
  })();

  analyzeAccident(severity, desc).then(analysis => {
    document.getElementById('analysis-content').innerHTML = `
      <div class="analysis-section"><h5>🚑 First Aid Guidance</h5>${formatAnalysis(analysis)}</div>`;
    document.getElementById('analysis-modal').classList.add('show');
  }).catch(() => {
    document.getElementById('analysis-content').innerHTML =
      `<p style="color:var(--gray-500);font-size:0.9rem">Report submitted. Help is on the way.</p>`;
    document.getElementById('analysis-modal').classList.add('show');
  });

  if (userLocation) {
    const url = `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
    if (navigator.share) {
      navigator.share({ title: 'Accident Report', text: `🚨 Accident reported at ${url}\nSeverity: ${severity}\n${desc}`, url }).catch(() => {});
    }
  }
  document.getElementById('report-form').reset();
  document.getElementById('report-severity').value = 'moderate';
  document.querySelectorAll('.severity-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('photo-label').textContent = `📷 ${t('report_photo')}`;
}

function closeReportAnalysis() {
  document.getElementById('analysis-modal').classList.remove('show');
}

function formatAnalysis(text) {
  const html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\s*[-•]\s*/g, '<br>• ')
    .replace(/\n\d+\.\s*/g, '<br>')
    .replace(/\n/g, '<br>');
  return `<div style="font-size:0.85rem;color:var(--gray-600);line-height:1.6;margin-top:4px">${html}</div>`;
}

// Render Emergency Numbers
function renderEmergencyNumbers() {
  const cont = document.getElementById('emergency-numbers');
  cont.innerHTML = emergencyData.emergency_contacts.map(ec => `
    <a href="tel:${ec.phone}" onclick="event.preventDefault();callEmergency('${ec.phone}')">
      📞 ${ec.name} - ${ec.phone}
    </a>
  `).join('');
}

// Render Saved Contacts
function renderSaved() {
  const container = document.getElementById('saved-list');
  if (savedContacts.length === 0) {
    container.innerHTML = `<div class="saved-empty"><div class="empty-icon">💾</div><p>${t('contacts_prompt')}</p></div>`;
    return;
  }

  const savedServices = allServices.filter(s => savedContacts.includes(s.id));
  container.innerHTML = savedServices.map(s => {
    const dist = s.distance ? `<span>📏 ${s.distance.toFixed(1)} ${t('km')}</span>` : '';
    return `
      <div class="service-card">
        <div class="card-icon ${s.type}">${getTypeIcon(s.type)}</div>
        <div class="card-body">
          <div class="card-name">${s.name}</div>
          <div class="card-type">${s.subtype}</div>
          <div class="card-meta">${dist}</div>
          <div class="card-actions">
            ${s.phone ? `<button class="action-btn call-btn" onclick="callNumber('${s.phone}')">📞 ${t('call')}</button>` : ''}
            <button class="action-btn save-btn saved" onclick="toggleSave('${s.id}')">❤️ ${t('save')}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render All (for lang switch)
function renderAll() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.getElementById('lang-btn').textContent = t('lang_switch');
  document.title = currentLang === 'en' ? 'RoadSoS - Emergency Road Safety' : 'RoadSoS - सड़क सुरक्षा आपातकालीन';
  if (allServices.length) renderServices();
  renderEmergencyNumbers();
  renderSaved();
}

// Navigation
function showSection(sectionId) {
  document.querySelectorAll('.section-page').forEach(s => s.style.display = 'none');
  const el = document.getElementById(sectionId);
  if (el) el.style.display = 'block';
  closeNav();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  const link = document.querySelector(`[data-section="${sectionId}"]`);
  if (link) link.classList.add('active');
}

function toggleNav() {
  document.getElementById('nav-links').classList.toggle('open');
  document.getElementById('nav-overlay').classList.toggle('show');
}

function closeNav() {
  document.getElementById('nav-links').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('show');
}

// Offline detection
function handleOffline() {
  document.getElementById('offline-banner').classList.add('show');
}
function handleOnline() {
  document.getElementById('offline-banner').classList.remove('show');
}

// AI Chat
let chatHistory = [];

function toggleChat() {
  document.getElementById('chat-panel').classList.toggle('open');
  document.getElementById('chat-dot').style.display = 'none';
  if (document.getElementById('chat-panel').classList.contains('open')) {
    document.getElementById('chat-input').focus();
  }
}

function addChatMsg(text, role) {
  const container = document.getElementById('chat-messages');
  const welcome = container.querySelector('.chat-welcome');
  if (welcome) welcome.remove();
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `${text}<span class="msg-time">${time}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  addChatMsg(msg, 'user');
  chatHistory.push({ role: 'user', content: msg });

  const thinking = document.createElement('div');
  thinking.className = 'chat-msg bot';
  thinking.innerHTML = '<div class="ai-thinking" style="margin:0;padding:8px 12px"><div class="spinner-small"></div> Thinking...</div>';
  document.getElementById('chat-messages').appendChild(thinking);

  try {
    const response = await chatWithAI(msg);
    thinking.remove();
    addChatMsg(response, 'bot');
    chatHistory.push({ role: 'assistant', content: response });
  } catch {
    thinking.remove();
    addChatMsg('⚠️ Sorry, I had trouble connecting. Please try again.', 'bot');
  }
}

// Smart Search
let searchTimer;

function setupSmartSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const badge = document.getElementById('smart-search-badge');
    if (badge) badge.classList.remove('show');
    searchTimer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 3) { renderServices(); return; }
      try {
        const ids = await smartSearch(q);
        if (ids && ids.length) {
          const filtered = allServices.filter(s => ids.includes(s.id));
          if (filtered.length) {
            renderServices();
            if (badge) badge.classList.add('show');
            return;
          }
        }
      } catch {}
      renderServices();
    }, 600);
  });
}

// ===== PROFILE =====
function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem('roadsos_profile') || '{}');
    if (p.vehicle) document.getElementById('profile-vehicle').value = p.vehicle;
    if (p.blood) document.getElementById('profile-blood').value = p.blood;
    if (p.conditions) document.getElementById('profile-conditions').value = p.conditions;
    const names = document.querySelectorAll('#profile-contacts .ec-name');
    const phones = document.querySelectorAll('#profile-contacts .ec-phone');
    (p.contacts || []).forEach((c, i) => {
      if (names[i]) names[i].value = c.name || '';
      if (phones[i]) phones[i].value = c.phone || '';
    });
  } catch {}
}

function saveProfile() {
  const names = document.querySelectorAll('#profile-contacts .ec-name');
  const phones = document.querySelectorAll('#profile-contacts .ec-phone');
  const contacts = [];
  names.forEach((n, i) => {
    if (n.value.trim() || phones[i].value.trim()) {
      contacts.push({ name: n.value.trim(), phone: phones[i].value.trim() });
    }
  });
  const profile = {
    vehicle: document.getElementById('profile-vehicle').value.trim(),
    blood: document.getElementById('profile-blood').value,
    conditions: document.getElementById('profile-conditions').value.trim(),
    contacts
  };
  localStorage.setItem('roadsos_profile', JSON.stringify(profile));
  showToast('✅ Profile saved! Shared with emergency responders on SOS.', 3000);
}

function getProfile() {
  try { return JSON.parse(localStorage.getItem('roadsos_profile') || '{}'); }
  catch { return {}; }
}

// ===== ACCIDENT DETECTION =====
let crashTimer = null;
let crashCountdown = 10;
let crashDetected = false;

function startAccidentDetection() {
  if (!window.DeviceMotionEvent && !window.DeviceOrientationEvent) return;
  let lastAccel = null;
  const THRESHOLD = 25;

  window.addEventListener('devicemotion', e => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null) return;
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    const delta = lastAccel !== null ? Math.abs(mag - lastAccel) : 0;
    lastAccel = mag;

    if (delta > THRESHOLD && !crashDetected && userLocation) {
      crashDetected = true;
      crashCountdown = 10;
      document.getElementById('crash-alert').style.display = 'flex';
      document.getElementById('crash-countdown').textContent = crashCountdown;
      crashTimer = setInterval(() => {
        crashCountdown--;
        document.getElementById('crash-countdown').textContent = crashCountdown;
        if (crashCountdown <= 0) {
          clearInterval(crashTimer);
          triggerCrashSOS();
        }
      }, 1000);
    }
  });
}

function cancelCrashAlert() {
  crashDetected = false;
  clearInterval(crashTimer);
  document.getElementById('crash-alert').style.display = 'none';
  showToast('✅ Accident alert cancelled', 2000);
}

function triggerCrashSOS() {
  clearInterval(crashTimer);
  document.getElementById('crash-alert').style.display = 'none';
  crashDetected = false;
  const profile = getProfile();
  const contactsMsg = profile.contacts?.filter(c => c.phone).map(c => `👤 ${c.name}: ${c.phone}`).join('\n') || '';
  const medicalMsg = profile.blood ? `\n🩸 Blood: ${profile.blood}` : '';
  const vehicleMsg = profile.vehicle ? `\n🚗 Vehicle: ${profile.vehicle}` : '';

  const btn = document.getElementById('sos-btn');
  btn.classList.add('sending');
  btn.innerHTML = `<span class="sos-icon">🆘</span><span>Auto-SOS from crash detection!</span>`;

  setTimeout(() => {
    btn.classList.remove('sending');
    btn.classList.add('sent');
    btn.innerHTML = `<span class="sos-icon">✅</span><span>Auto-SOS sent!</span>`;
    showToast('🚨 Crash detected! SOS sent with your profile.', 6000);

    if (userLocation) {
      const url = `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
      const sosMsg = `🚨 CRASH ALERT from RoadSoS!\n📍 ${url}${medicalMsg}${vehicleMsg}\n\nEmergency Contacts:\n${contactsMsg || 'None set'}`;
      if (navigator.share) {
        navigator.share({ title: 'CRASH ALERT - RoadSoS', text: sosMsg }).catch(() => {});
      }
      smartSOSBroadcast(userLocation.lat, userLocation.lng, vehicleMsg).then(advice => {
        document.getElementById('sos-analysis-content').innerHTML = `
          <div class="ai-section"><h5>🚨 Crash Detected — AI Guidance</h5>
          <div style="font-size:0.85rem;color:var(--gray-600);line-height:1.6">${advice.replace(/\n/g, '<br>')}</div></div>`;
        document.getElementById('sos-analysis-modal').classList.add('show');
      }).catch(() => {});
    }

    setTimeout(() => {
      btn.classList.remove('sent');
      btn.innerHTML = `<span class="sos-icon">🆘</span><span>${t('sos_button')}</span><span class="sos-sub">${t('tap_sos')}</span>`;
    }, 8000);
  }, 1500);
}

// ===== HOSPITAL STATUS =====
function getBedStatus(beds) {
  if (!beds) return '';
  const total = beds.icu + beds.emergency;
  if (total > 20) return '<span style="color:#16a34a;font-size:0.7rem">🟢 Available</span>';
  if (total > 10) return '<span style="color:#f97316;font-size:0.7rem">🟡 Limited</span>';
  return '<span style="color:#dc2626;font-size:0.7rem">🔴 Full</span>';
}

// Override renderServices to show bed status
renderServices = function() {
  const query = (document.getElementById('search-input')?.value || '').toLowerCase();
  let filtered = allServices.filter(s => {
    if (currentFilter !== 'all' && s.type !== currentFilter) return false;
    if (query && !s.name.toLowerCase().includes(query) && !(s.subtype || '').toLowerCase().includes(query) && !(s.address || '').toLowerCase().includes(query)) return false;
    return true;
  });

  filtered.sort((a, b) => currentSort === 'distance' ? a.distance - b.distance : b.rating - a.rating);

  const container = document.getElementById('services-list');
  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--gray-400)"><div style="font-size:3rem;margin-bottom:12px">🔍</div><p>${t('no_services')}</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(s => {
    const dist = s.distance ? `<span>📏 ${s.distance.toFixed(1)} ${t('km')}</span>` : '';
    const rating = s.rating ? `<span>⭐ ${s.rating}</span>` : '';
    const bedStatus = s.beds ? getBedStatus(s.beds) : '';
    const saved = isSaved(s.id) ? 'saved' : '';
    const d = userLocation && s.lat ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}` : '#';

    return `
      <div class="service-card" onclick="openMapFor('${s.id}')">
        <div class="card-icon ${s.type}">${getTypeIcon(s.type)}</div>
        <div class="card-body">
          <div class="card-name">${s.name}</div>
          <div class="card-type">${s.subtype} ${bedStatus}</div>
          <div class="card-meta">${dist}${rating}${s.address ? `<span>📍 ${s.address}</span>` : ''}</div>
          <div class="card-actions">
            ${s.phone ? `<button class="action-btn call-btn" onclick="event.stopPropagation();callNumber('${s.phone}')">📞 ${t('call')}</button>` : ''}
            ${s.lat ? `<a href="${d}" target="_blank" class="action-btn dir-btn" onclick="event.stopPropagation()">🗺️ ${t('directions')}</a>` : ''}
            <button class="action-btn share-btn" onclick="event.stopPropagation();shareService('${s.name}')">📤 ${t('share')}</button>
            <button class="action-btn save-btn ${saved}" onclick="event.stopPropagation();toggleSave('${s.id}')">${saved ? '❤️' : '🤍'} ${t('save')}</button>
          </div>
        </div>
        ${s.distance ? `<div class="distance-badge">${(s.distance * 1000).toFixed(0)}m</div>` : ''}
      </div>
    `;
  }).join('');

  if (currentView === 'map' && map) {
    const filteredIds = new Set(filtered.map(f => f.id));
    markers.forEach(m => {
      const inFilter = filteredIds.has(m.serviceId);
      if (map.hasLayer(m) !== inFilter) {
        if (inFilter) map.addLayer(m);
        else map.removeLayer(m);
      }
    });
    if (userLocation && filtered.length > 0) {
      const bounds = L.latLngBounds([[userLocation.lat, userLocation.lng]]);
      filtered.forEach(s => { if (s.lat && s.lng) bounds.extend([s.lat, s.lng]); });
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }
};

// Init
document.addEventListener('DOMContentLoaded', function() {
  window.addEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);
  if (!navigator.onLine) handleOffline();

  loadEnv();
  detectLocation();
  renderEmergencyNumbers();
  renderSaved();
  loadProfile();
  startAccidentDetection();
  updateHazardStats();
  renderHazardList();

  document.getElementById('sos-btn').addEventListener('click', triggerSOS);

  setupSmartSearch();

  document.getElementById('report-form')?.addEventListener('submit', submitReport);
});

// ===== DARK MODE =====
function toggleDark() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('roadsos_dark', isDark ? '0' : '1');
  document.getElementById('dark-toggle').textContent = isDark ? '🌙' : '☀️';
}

(function() {
  if (localStorage.getItem('roadsos_dark') === '1') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('dark-toggle').textContent = '☀️';
  }
})();

// ===== VOICE GUIDE =====
let voiceActive = false;

function toggleVoiceGuide() {
  voiceActive = !voiceActive;
  const btn = document.getElementById('voice-btn');
  btn.style.background = voiceActive ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.15)';
  btn.innerHTML = voiceActive ? '🔊 Voice ON' : '🔊 Voice Guide';
  if (voiceActive) speak('Voice guide activated. Tap SOS in an emergency.');
}

function speak(text, lang = 'en-IN') {
  if (!voiceActive) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.9;
  u.volume = 1;
  window.speechSynthesis.speak(u);
}

// Override triggerSOS to add voice
const _origTrigger = triggerSOS;
triggerSOS = function() {
  if (voiceActive) speak('Emergency SOS activated! Help is being notified. Stay calm and wait for assistance.', currentLang === 'hi' ? 'hi-IN' : 'en-IN');
  _origTrigger();
};

// ===== INCIDENT RECORDING =====
let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;

async function startRecording() {
  const btn = document.getElementById('record-btn');
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
    return;
  }
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    mediaRecorder = new MediaRecorder(recordingStream);
    recordedChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `incident-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      recordingStream.getTracks().forEach(t => t.stop());
      recordingStream = null;
      showToast('✅ Incident video saved. Share it with authorities.', 4000);
      btn.innerHTML = '📹 Record Incident';
      btn.style.background = 'rgba(255,255,255,0.15)';
    };
    mediaRecorder.start();
    btn.innerHTML = '⏹️ Stop Recording';
    btn.style.background = 'rgba(239,68,68,0.4)';
    showToast('🔴 Recording incident... Tap again to stop.', 3000);
  } catch {
    showToast('⚠️ Camera access denied. Enable camera to record.', 3000);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

// ===== HAZARD REPORTING =====
let hazardMap = null;
let hazardMarkers = [];
let hazardReports = JSON.parse(localStorage.getItem('roadsos_hazards') || '[]');

function getHazardIcon(type) {
  return { pothole: '🕳️', debris: '🗑️', signal: '🚦', road: '🛑', accident: '🚨', blackspot: '🔴', other: '⚠️' }[type] || '⚠️';
}

function getHazardColor(type) {
  return { pothole: '#8B4513', debris: '#6B7280', signal: '#F59E0B', road: '#DC2626', accident: '#E63946', blackspot: '#991B1B', other: '#6366F1' }[type] || '#6B7280';
}

function initHazardMap() {
  if (!userLocation) return;
  const container = document.getElementById('hazard-map-container');
  if (!container) return;
  document.getElementById('hazard-map')?.remove();
  container.innerHTML = '<div id="hazard-map" style="height:100%"></div>';

  hazardMap = L.map('hazard-map', { zoomControl: false }).setView([userLocation.lat, userLocation.lng], 12);
  L.control.zoom({ position: 'bottomright' }).addTo(hazardMap);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(hazardMap);

  const userIcon = L.divIcon({ className: '', html: '<div class="user-marker" style="width:14px;height:14px;border-width:3px"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
  L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(hazardMap).bindPopup('<div class="popup-content"><h4>📍 You</h4></div>');

  addHazardMarkers();
  hazardMap.invalidateSize();
}

function addHazardMarkers() {
  if (!hazardMap) return;
  hazardMarkers.forEach(m => hazardMap.removeLayer(m));
  hazardMarkers = [];

  emergencyData.hazard_blackspots.forEach(bs => {
    const color = '#DC2626';
    const icon = L.divIcon({ className: '', html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">🔴</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    const m = L.marker([bs.lat, bs.lng], { icon });
    m.bindPopup(`<div class="popup-content"><h4>🔴 ${bs.name}</h4><p>⚠️ ${bs.severity.toUpperCase()} risk</p><p>${bs.desc}</p></div>`);
    hazardMarkers.push(m);
    m.addTo(hazardMap);
  });

  hazardReports.forEach(r => {
    const icon = L.divIcon({ className: '', html: `<div style="width:24px;height:24px;border-radius:50%;background:${getHazardColor(r.type)};display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${getHazardIcon(r.type)}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
    const m = L.marker([r.lat, r.lng], { icon });
    const status = r.resolved ? '✅ Resolved' : '⚠️ Active';
    m.bindPopup(`<div class="popup-content"><h4>${getHazardIcon(r.type)} ${r.type}</h4><p>${r.desc || 'No description'}</p><p>${status} · ${new Date(r.time).toLocaleDateString()}</p></div>`);
    hazardMarkers.push(m);
    m.addTo(hazardMap);
  });
}

function reportHazard() {
  if (!userLocation) { showToast('⚠️ Enable location to report hazards'); return; }
  const type = document.getElementById('hazard-type').value;
  const desc = document.getElementById('hazard-desc').value.trim();
  const report = { id: 'h' + Date.now(), type, desc: desc || `${type} hazard`, lat: userLocation.lat, lng: userLocation.lng, time: new Date().toISOString(), resolved: false, votes: 0 };
  hazardReports.push(report);
  localStorage.setItem('roadsos_hazards', JSON.stringify(hazardReports));
  document.getElementById('hazard-desc').value = '';
  showToast(`✅ ${getHazardIcon(type)} ${type} hazard reported!`, 3000);
  updateHazardStats();
  renderHazardList();
  addHazardMarkers();
}

function updateHazardStats() {
  document.getElementById('stat-potholes').textContent = hazardReports.filter(r => r.type === 'pothole').length;
  document.getElementById('stat-blackspots').textContent = emergencyData.hazard_blackspots.length;
  document.getElementById('stat-resolved').textContent = hazardReports.filter(r => r.resolved).length;
  document.getElementById('stat-total').textContent = hazardReports.length + emergencyData.hazard_blackspots.length;
}

function renderHazardList() {
  const container = document.getElementById('hazard-list');
  const all = [...emergencyData.hazard_blackspots.map(bs => ({ ...bs, isBlackspot: true })), ...hazardReports.map(r => ({ ...r, isBlackspot: false }))];
  container.innerHTML = all.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).map(h => {
    if (h.isBlackspot) {
      return `<div style="background:var(--white);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px;box-shadow:var(--shadow)">
        <span style="font-size:1.2rem">🔴</span>
        <div style="flex:1"><div style="font-weight:700;font-size:0.85rem;color:var(--dark)">${h.name}</div><div style="font-size:0.75rem;color:var(--gray-500)">${h.desc} · ${h.severity}</div></div>
      </div>`;
    }
    return `<div style="background:var(--white);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px;box-shadow:var(--shadow)">
      <span style="font-size:1.2rem">${getHazardIcon(h.type)}</span>
      <div style="flex:1"><div style="font-weight:700;font-size:0.85rem;color:var(--dark)">${h.type} — ${h.desc}</div><div style="font-size:0.75rem;color:var(--gray-500)">${h.resolved ? '✅ Resolved' : '⚠️ Active'} · ${new Date(h.time).toLocaleDateString()}</div></div>
      ${h.resolved ? '' : `<button onclick="resolveHazard('${h.id}')" style="padding:4px 10px;border-radius:var(--radius-sm);font-size:0.7rem;font-weight:600;background:#dcfce7;color:#16a34a">Resolve</button>`}
    </div>`;
  }).join('');
}

function resolveHazard(id) {
  hazardReports = hazardReports.map(r => r.id === id ? { ...r, resolved: true } : r);
  localStorage.setItem('roadsos_hazards', JSON.stringify(hazardReports));
  updateHazardStats();
  renderHazardList();
  addHazardMarkers();
  showToast('✅ Hazard marked as resolved', 2000);
}

// ===== QR PROFILE =====
function shareQR() {
  const profile = getProfile();
  if (!profile.blood && !profile.contacts?.length) {
    showToast('⚠️ Save your profile first to generate a QR code', 3000);
    return;
  }
  const data = [`RoadSoS Emergency Profile`];
  if (profile.blood) data.push(`Blood: ${profile.blood}`);
  if (profile.vehicle) data.push(`Vehicle: ${profile.vehicle}`);
  if (profile.conditions) data.push(`Conditions: ${profile.conditions}`);
  if (profile.contacts?.length) {
    profile.contacts.forEach(c => { if (c.name && c.phone) data.push(`Contact: ${c.name} ${c.phone}`); });
  }
  const encoded = encodeURIComponent(data.join('\n'));
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`;
  document.getElementById('qr-code').src = qrUrl;
  document.getElementById('qr-code').style.width = '200px';
  document.getElementById('qr-code').style.height = '200px';
}

// Override saveProfile to also update QR
const _origSave = saveProfile;
saveProfile = function() {
  _origSave();
  setTimeout(shareQR, 500);
};

// ===== SAFE DRIVER SCORE =====
function getDriverScore() {
  try { return JSON.parse(localStorage.getItem('roadsos_score') || '{"points":100,"level":"Bronze","trips":0,"sosCount":0}'); }
  catch { return { points: 100, level: 'Bronze', trips: 0, sosCount: 0 }; }
}

function updateDriverScore(type) {
  const score = getDriverScore();
  if (type === 'trip') { score.points += 5; score.trips++; }
  if (type === 'sos') { score.points = Math.max(0, score.points - 10); score.sosCount++; }
  if (score.points >= 300) score.level = 'Platinum';
  else if (score.points >= 200) score.level = 'Gold';
  else if (score.points >= 100) score.level = 'Silver';
  else score.level = 'Bronze';
  localStorage.setItem('roadsos_score', JSON.stringify(score));
}

function renderDriverScoreBadge() {
  const score = getDriverScore();
  const existing = document.getElementById('driver-score-badge');
  if (existing) existing.remove();
  const badge = document.createElement('div');
  badge.id = 'driver-score-badge';
  badge.style.cssText = 'position:fixed;top:72px;right:16px;z-index:900;background:var(--white);border-radius:var(--radius-sm);padding:6px 14px;box-shadow:var(--shadow);font-size:0.75rem;font-weight:600;cursor:pointer;border:1px solid var(--gray-200)';
  badge.innerHTML = `🏆 ${score.level} · ${score.points} pts · ${score.trips} trips`;
  badge.onclick = () => showToast(`🏆 Safe Driver Score\n${score.points} pts · ${score.level}\n${score.trips} safe trips · ${score.sosCount} SOS`, 4000);
  document.body.appendChild(badge);
}

// Track SOS for driver score
const _origConfirm = confirmSOS;
confirmSOS = function() {
  updateDriverScore('sos');
  _origConfirm();
};

// Daily safe trip bonus
setInterval(() => {
  const last = localStorage.getItem('roadsos_last_trip_date');
  const today = new Date().toDateString();
  if (last !== today) {
    localStorage.setItem('roadsos_last_trip_date', today);
    updateDriverScore('trip');
    renderDriverScoreBadge();
  }
}, 30000);

// Override showSection to init hazard map
const _origShow = showSection;
showSection = function(sectionId) {
  _origShow(sectionId);
  if (sectionId === 'hazards') {
    setTimeout(() => {
      if (!hazardMap) initHazardMap();
      else hazardMap.invalidateSize();
      renderDriverScoreBadge();
      updateHazardStats();
    }, 200);
  }
};

// Delayed init for hazard map + score
setTimeout(() => {
  renderDriverScoreBadge();
}, 3000);
