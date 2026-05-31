const ENV = {};

async function loadEnv() {
  if (window.__ENV__) {
    Object.assign(ENV, window.__ENV__);
    return;
  }
  try {
    const res = await fetch('/.env');
    if (!res.ok) return;
    const text = await res.text();
    text.split('\n').filter(Boolean).forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) ENV[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
  } catch {}
}

function env(key, fallback = '') {
  return ENV[key] || fallback;
}
