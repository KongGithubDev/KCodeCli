const API_BASE = process.env.FREELLMAPI_URL ?? 'http://localhost:3001';

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res;
}

export async function getKeys() {
  const res = await apiFetch('/api/keys');
  return res.json();
}

export async function addKey(platform: string, key: string, label?: string) {
  const res = await apiFetch('/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, key, label }),
  });
  return res.json();
}

export async function deleteKey(id: number) {
  const res = await apiFetch(`/api/keys/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function toggleKey(id: number, enabled: boolean) {
  const res = await apiFetch(`/api/keys/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return res.json();
}

export async function getModels() {
  const res = await apiFetch('/api/models');
  return res.json();
}

export async function getFallback() {
  const res = await apiFetch('/api/fallback');
  return res.json();
}

export async function sortFallback(preset: string) {
  const res = await apiFetch(`/api/fallback/sort/${preset}`, { method: 'POST' });
  return res.json();
}

export async function getHealth() {
  const res = await apiFetch('/api/ping');
  return res.json();
}

export async function getUnifiedKey() {
  const res = await apiFetch('/api/settings/api-key');
  return res.json() as Promise<{ apiKey: string }>;
}

export async function regenerateUnifiedKey() {
  const res = await apiFetch('/api/settings/api-key/regenerate', { method: 'POST' });
  return res.json() as Promise<{ apiKey: string }>;
}

export async function chatCompletion(body: object) {
  const unifiedKey = process.env.FREELLMAPI_KEY;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (unifiedKey) {
    headers['Authorization'] = `Bearer ${unifiedKey}`;
  }
  const res = await fetch(`${API_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

export async function streamChatCompletion(body: object, onChunk: (text: string) => void) {
  const unifiedKey = process.env.FREELLMAPI_KEY;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (unifiedKey) {
    headers['Authorization'] = `Bearer ${unifiedKey}`;
  }
  const res = await fetch(`${API_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content ?? '';
          if (delta) onChunk(delta);
        } catch {}
      }
    }
  }
}
