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

// Render Services
function renderServices() {
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
    const saved = isSaved(s.id) ? 'saved' : '';
    const d = userLocation && s.lat ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}` : '#';

    return `
      <div class="service-card" onclick="openMapFor('${s.id}')">
        <div class="card-icon ${s.type}">${getTypeIcon(s.type)}</div>
        <div class="card-body">
          <div class="card-name">${s.name}</div>
          <div class="card-type">${s.subtype}</div>
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

// Init
document.addEventListener('DOMContentLoaded', function() {
  window.addEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);
  if (!navigator.onLine) handleOffline();

  initGroq();
  detectLocation();
  renderEmergencyNumbers();
  renderSaved();

  document.getElementById('sos-btn').addEventListener('click', triggerSOS);

  setupSmartSearch();

  document.getElementById('report-form')?.addEventListener('submit', submitReport);
});
