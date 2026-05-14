export const RADAR_HELPER_URL = 'http://127.0.0.1:8765';

function canCallLoopback() {
  const host = window.location.hostname;
  return window.location.protocol === 'file:' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === 'shophuyvan-analytics.nghiemchihuy.workers.dev';
}

async function helperFetch(path, options = {}) {
  if (!canCallLoopback()) {
    return {
      ok: false,
      blocked: true,
      error: 'browser_blocks_loopback'
    };
  }
  const response = await fetch(RADAR_HELPER_URL + path, {
    mode: 'cors',
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
  }
  return response.json();
}

export async function checkRadarLocal() {
  try {
    return await helperFetch('/health', { method: 'GET' });
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function wakeRadarLocal(reason = 'manual', jobId = null) {
  try {
    return await helperFetch('/wake', {
      method: 'POST',
      body: JSON.stringify({ reason, job_id: jobId })
    });
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
