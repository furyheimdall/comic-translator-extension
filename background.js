const DEFAULTS = {serverUrl: '', token: '', deviceName: '', notice: '', providerId: '', providerLabel: '', model: '', reasoning: 'default', autoAll: false, autoSites: [], minSize: 300};
const PAIR_POLL_MS = 2000;
let pairing = null; // {serverUrl, id, secret, code, expiresAt, status, error}
let settings, tabs = {}, sessions = {}, saveChain = Promise.resolve(), retryChain = Promise.resolve();
const creations = new Map(), uploadChains = new Map(), running = new Set(), polling = new Set(), outputs = new Map();
const ready = (async () => {
  settings = {...DEFAULTS, ...await chrome.storage.local.get(Object.keys(DEFAULTS))};
  await chrome.storage.local.remove('instructions'); // glossary setting removed in 1.3.0
  const saved = await chrome.storage.session.get(['translationTabs', 'liveSessions', 'pairing']);
  tabs = saved.translationTabs || {};
  sessions = saved.liveSessions || {};
  pairing = saved.pairing || null;
  if (pairing?.status === 'pending') pollPairing();
  // A worker may have stopped between fetching bytes and receiving the upload response.
  for (const state of Object.values(tabs)) for (const page of Object.values(state.pages)) {
    if (page.status === 'uploading' && page.idx == null) page.status = 'queued';
  }
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: (await chrome.declarativeNetRequest.getSessionRules()).map(rule => rule.id)});
  await chrome.alarms.create('resume-translations', {periodInMinutes: 0.5});
  for (const id of Object.keys(tabs)) resume(Number(id));
})();
function save() {
  const snapshot = {translationTabs: structuredClone(tabs), liveSessions: structuredClone(sessions)};
  // Persistence only helps resume after a worker restart; a failed write must not stop translation.
  saveChain = saveChain.then(() => chrome.storage.session.set(snapshot)).catch(error => console.warn('세션 상태 저장 실패:', errorText(error)));
  return saveChain;
}
function errorText(error) { return error?.message || String(error); }
function llmKey(config) { return [config.serverUrl, config.token, config.providerId, config.model, config.reasoning]; }
function configKey() { return JSON.stringify(llmKey(settings)); }
function validateServer(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('서버 주소는 http:// 또는 https:// 주소여야 합니다.');
  return url.href.replace(/\/$/, '');
}
async function api(path, options = {}, config = settings) {
  if (!config.serverUrl) throw new Error('먼저 서버 주소를 설정해 주세요.');
  const headers = new Headers(options.headers);
  if (config.token) headers.set('Authorization', `Bearer ${config.token}`);
  let response;
  try { response = await fetch(validateServer(config.serverUrl) + path, {...options, headers, signal: AbortSignal.timeout(120000)}); }
  catch (cause) { throw new Error('서버에 연결할 수 없습니다. 주소·네트워크·서버 실행 상태를 확인하세요.', {cause}); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && config.token && config.token === settings.token) {
      await forgetPairing('서버에서 이 브라우저의 연결이 해제되었습니다. 다시 페어링하세요.');
    }
    const error = new Error(response.status === 401 ? (body.detail || '서버와 페어링되지 않았습니다. 서버 연결에서 페어링을 요청하세요.') : response.status === 409 ? `번역 엔진을 사용할 수 없습니다: ${body.detail || '엔진 준비 상태를 확인하세요.'}` : body.detail || `서버 오류 (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response;
}
// ---------------------------------------------------------------- pairing
function deviceName() {
  const data = navigator.userAgentData;
  const brand = data?.brands?.map(b => b.brand).find(name => !/not.a.brand|chromium/i.test(name)) || 'Chrome';
  return `${brand} · ${data?.platform || navigator.platform || '알 수 없는 OS'}`;
}
async function savePairing() { await chrome.storage.session.set({pairing}); }
async function forgetPairing(notice) {
  if (!settings.token) return;
  settings = {...settings, token: '', deviceName: '', notice};
  await chrome.storage.local.set(settings);
  await Promise.all(Object.keys(tabs).map(id => disable(Number(id))));
  sessions = {}; await save();
}
async function startPairing(serverUrl, name) {
  serverUrl = validateServer(serverUrl);
  const response = await api('/api/pair/start', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: name || deviceName()})}, {serverUrl});
  const started = await response.json();
  pairing = {serverUrl, id: started.id, secret: started.secret, code: started.code, expiresAt: Date.now() + started.expires_in * 1000, status: 'pending', error: ''};
  await savePairing();
  pollPairing();
  return publicPairing();
}
let pairTimer = null;
function pollPairing() {
  clearTimeout(pairTimer);
  pairTimer = setTimeout(async () => {
    if (pairing?.status !== 'pending') return;
    try {
      const response = await api('/api/pair/poll', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: pairing.id, secret: pairing.secret})}, {serverUrl: pairing.serverUrl});
      const result = await response.json();
      if (result.status === 'approved') {
        await Promise.all(Object.keys(tabs).map(id => disable(Number(id))));
        settings = {...settings, serverUrl: pairing.serverUrl, token: result.token, deviceName: result.name, notice: ''};
        await chrome.storage.local.set(settings);
        pairing = {...pairing, secret: '', status: 'approved'};
      } else if (result.status !== 'pending') {
        pairing = {...pairing, secret: '', status: result.status, error: result.status === 'denied' ? '서버에서 연결 요청을 거절했습니다.' : '연결 요청이 만료되었습니다. 다시 요청하세요.'};
      }
    } catch (error) {
      pairing = {...pairing, error: errorText(error)};
    }
    await savePairing();
    if (pairing.status === 'pending') pollPairing();
  }, PAIR_POLL_MS);
}
function publicPairing() {
  return {pairing: pairing && {status: pairing.status, code: pairing.code, serverUrl: pairing.serverUrl, expiresAt: pairing.expiresAt, error: pairing.error}};
}
async function unpair() {
  if (settings.token) await api('/api/pair/unpair', {method: 'POST'}).catch(() => {});
  pairing = null; await savePairing();
  await forgetPairing('이 브라우저의 서버 연결을 해제했습니다.');
}
async function connect(config) {
  const session = await (await api('/api/session', {}, config)).json();
  if (session.password_required && !session.authenticated) throw new Error('이 서버와 아직 페어링되지 않았습니다. ‘페어링 요청’을 누르세요.');
  const [meta, providers] = await Promise.all([api('/api/meta', {}, config).then(r => r.json()), api('/api/providers', {}, config).then(r => r.json())]);
  const engine = meta.engines.find(item => item.live && item.available);
  if (!engine) throw new Error('사용 가능한 실시간 번역 엔진이 없습니다. 서버에서 엔진을 준비하세요.');
  const who = session.device ? ` · 기기 “${session.device}”` : session.password_required ? '' : ' · 비밀번호 없는 서버';
  return {engine: engine.id, providers, message: `연결 성공${who} · 실시간 번역 엔진 준비됨`};
}
// The token is never taken from the popup: it only comes from pairing and only for its own server.
function withServer(serverUrl) {
  const url = validateServer(serverUrl);
  return {...settings, serverUrl: url, token: url === settings.serverUrl ? settings.token : ''};
}
async function ensureSession(state) {
  if (sessions[state.configKey]) return sessions[state.configKey];
  if (!creations.has(state.configKey)) {
    const work = (async () => {
      const connection = await connect(state.config);
      if (!connection.providers.some(p => p.id === state.config.providerId && p.connected)) throw new Error('연결된 번역 제공자를 선택하세요.');
      const response = await api('/api/live', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title: state.title, provider_id: state.config.providerId, model: state.config.model || undefined, reasoning: state.config.reasoning || 'default', engine: connection.engine})}, state.config);
      const live = await response.json();
      sessions[state.configKey] = live.id;
      await save();
      return live.id;
    })().finally(() => creations.delete(state.configKey));
    creations.set(state.configKey, work);
  }
  return creations.get(state.configKey);
}
function notify(tabId, message, frameId) {
  return chrome.tabs.sendMessage(tabId, message, frameId == null ? {} : {frameId}).catch(() => {});
}
async function badge(tabId) {
  const state = tabs[tabId];
  const count = state ? Object.values(state.pages).filter(p => ['queued', 'uploading', 'processing'].includes(p.status)).length : 0;
  await chrome.action.setBadgeText({tabId, text: count ? String(count) : ''}).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({tabId, color: '#3458ce'}).catch(() => {});
}
function publicState(state) {
  const counts = {queued: 0, processing: 0, done: 0, failed: 0};
  if (state) for (const page of Object.values(state.pages)) counts[page.status === 'uploading' ? 'processing' : page.status]++;
  return {enabled: !!state, manual: !!state?.manual, originals: !!state?.originals, counts, message: state?.message || ''};
}
function base64(bytes) {
  const array = new Uint8Array(bytes); let text = '';
  for (let i = 0; i < array.length; i += 32768) text += String.fromCharCode(...array.subarray(i, i + 32768));
  return btoa(text);
}
function decode(data) { return Uint8Array.from(atob(data), char => char.charCodeAt(0)); }
async function imageFetch(url, pageUrl) {
  if (!/^https?:\/\//i.test(url)) throw new Error('지원하지 않는 이미지 주소입니다.');
  const request = () => fetch(url, {credentials: 'include', signal: AbortSignal.timeout(30000)}).then(response => {
    if (!response.ok) throw new Error(`이미지 다운로드 실패 (${response.status})`);
    return response;
  });
  let response;
  try { response = await request(); }
  catch {
    // Serialize temporary rules so two tabs cannot supply different Referers for the same URL.
    const retry = retryChain.catch(() => {}).then(async () => {
      const id = 1;
      const exact = '^' + url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
      try {
        await chrome.declarativeNetRequest.updateSessionRules({addRules: [{id, priority: 1, action: {type: 'modifyHeaders', requestHeaders: [{header: 'Referer', operation: 'set', value: pageUrl}]}, condition: {regexFilter: exact, isUrlFilterCaseSensitive: true, tabIds: [chrome.tabs.TAB_ID_NONE], resourceTypes: ['xmlhttprequest']}}]});
        return await request();
      } finally { await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [id]}); }
    });
    retryChain = retry;
    response = await retry;
  }
  return {data: base64(await response.arrayBuffer()), mime: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream'};
}
async function bytesFor(tabId, page) {
  // Content fetches local URLs and supplies the canvas fallback; HTTP downloads remain in this worker.
  for (const frameId of page.frames) {
    const result = await chrome.tabs.sendMessage(tabId, {type: 'GET_BYTES', url: page.url}, {frameId}).catch(() => null);
    if (result?.ok) return result;
    if (result?.error) page.lastByteError = result.error;
  }
  throw new Error(page.lastByteError || '이미지를 읽을 수 없습니다. 페이지를 새로고침하세요.');
}
async function sendOutput(tabId, state, page) {
  const key = `${page.sid}:${page.idx}`;
  let dataUrl = outputs.get(key);
  if (!dataUrl) {
    const response = await api(`/api/jobs/${encodeURIComponent(page.sid)}/pages/${page.idx}/output`, {}, state.config);
    dataUrl = `data:image/png;base64,${base64(await response.arrayBuffer())}`;
    outputs.set(key, dataUrl);
    // Bounded cache; completed images remain in the document, and can be fetched again.
    if (outputs.size > 12) outputs.delete(outputs.keys().next().value);
  }
  if (tabs[tabId] !== state) return;
  for (const frame of page.frames) await notify(tabId, {type: 'RESULT', url: page.url, dataUrl}, frame);
}
async function recover(sid) {
  for (const [key, value] of Object.entries(sessions)) if (value === sid) delete sessions[key];
  for (const [id, state] of Object.entries(tabs)) {
    let changed = false;
    for (const page of Object.values(state.pages)) if (page.sid === sid && page.status !== 'done' && page.status !== 'failed') {
      page.idx = null; page.sid = null; page.status = 'queued'; changed = true;
    }
    if (changed) { state.message = '서버 세션이 삭제되어 새 세션에서 다시 번역합니다.'; resume(Number(id)); }
  }
  await save();
}
async function upload(tabId, state, page) {
  const predecessor = uploadChains.get(state.configKey) || Promise.resolve();
  let release;
  const finished = new Promise(resolve => { release = resolve; });
  const tail = predecessor.catch(() => {}).then(() => finished);
  uploadChains.set(state.configKey, tail);
  page.status = 'uploading';
  await save(); await badge(tabId);
  await notify(tabId, {type: 'PAGE_STATUS', url: page.url, status: 'processing'});
  try {
    const [sid, bytes] = await Promise.all([ensureSession(state), bytesFor(tabId, page)]);
    // Prepare two images in parallel, but append them in discovery order.
    await predecessor.catch(() => {});
    if (tabs[tabId] !== state) return;
    const form = new FormData();
    form.append('file', new Blob([decode(bytes.data)], {type: bytes.mime}), bytes.mime === 'image/png' ? 'page.png' : bytes.mime === 'image/webp' ? 'page.webp' : 'page.jpg');
    form.append('source_name', page.url.slice(0, 500));
    page.sid = sid;
    const result = await (await api(`/api/live/${encodeURIComponent(sid)}/pages`, {method: 'POST', body: form}, state.config)).json();
    page.idx = result.idx;
    if (tabs[tabId] !== state) {
      await api(`/api/live/${encodeURIComponent(sid)}/discard`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pages: [result.idx]})}, state.config).catch(() => {});
      return;
    }
    if (result.error) throw new Error(result.error);
    page.status = result.translated ? 'done' : 'processing';
    if (!result.translated) poll(tabId);
    if (result.translated) await sendOutput(tabId, state, page);
    state.message = '번역 작업을 서버에 보냈습니다.';
  } catch (error) {
    if (tabs[tabId] !== state) return;
    if (error.status === 404 && page.sid) { await recover(page.sid); return; }
    page.status = 'failed'; page.error = errorText(error); state.message = page.error;
    await notify(tabId, {type: 'PAGE_STATUS', url: page.url, status: 'failed', error: page.error});
  } finally {
    release();
    if (uploadChains.get(state.configKey) === tail) uploadChains.delete(state.configKey);
    await save(); await badge(tabId);
  }
}
async function pump(tabId) {
  if (running.has(tabId)) return;
  running.add(tabId);
  try {
    while (tabs[tabId]) {
      const state = tabs[tabId];
      const queued = Object.values(state.pages).filter(p => p.status === 'queued').slice(0, 2);
      if (!queued.length) break;
      await Promise.all(queued.map(page => upload(tabId, state, page)));
    }
  } finally { running.delete(tabId); }
  poll(tabId);
}
async function poll(tabId) {
  if (polling.has(tabId) || !tabs[tabId]) return;
  polling.add(tabId);
  try {
    while (tabs[tabId]) {
      const state = tabs[tabId];
      const pending = Object.values(state.pages).filter(p => p.status === 'processing' && p.idx != null);
      if (!pending.length) break;
      for (const sid of new Set(pending.map(p => p.sid))) {
        const pages = pending.filter(p => p.sid === sid);
        try {
          const live = await (await api(`/api/live/${encodeURIComponent(sid)}?pages=${pages.map(p => p.idx).join(',')}`, {}, state.config)).json();
          if (tabs[tabId] !== state) break;
          state.message = live.message || live.error || '';
          for (const result of live.pages) {
            const page = pages.find(p => p.idx === result.idx);
            if (!page) continue;
            if (result.translated) { await sendOutput(tabId, state, page); page.status = 'done'; }
            else if (result.error || live.status === 'failed' || live.status === 'cancelled') {
              page.status = 'failed'; page.error = result.error || live.error || '번역 작업이 중단되었습니다.';
              await notify(tabId, {type: 'PAGE_STATUS', url: page.url, status: 'failed', error: page.error});
            }
          }
        } catch (error) {
          if (tabs[tabId] !== state) break;
          if (error.status === 404) await recover(sid);
          else {
            state.message = errorText(error);
            for (const page of pages) await notify(tabId, {type: 'PAGE_STATUS', url: page.url, status: 'processing', error: state.message});
            if (error.status === 401 || error.status === 409 || error.status === 400) {
              for (const page of pages) { page.status = 'failed'; page.error = state.message; await notify(tabId, {type: 'PAGE_STATUS', url: page.url, status: 'failed', error: page.error}); }
            }
          }
        }
      }
      await save(); await badge(tabId);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } finally { polling.delete(tabId); }
}
function resume(tabId) { pump(tabId).catch(error => { if (tabs[tabId]) tabs[tabId].message = errorText(error); }); }
async function disable(tabId) {
  const state = tabs[tabId];
  if (!state) return;
  delete tabs[tabId];
  await save(); await badge(tabId);
  await notify(tabId, {type: 'DISABLE'});
  const pending = Object.values(state.pages).filter(p => p.idx != null && p.status !== 'done' && p.status !== 'failed');
  for (const sid of new Set(pending.map(p => p.sid))) await api(`/api/live/${encodeURIComponent(sid)}/discard`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pages: pending.filter(p => p.sid === sid).map(p => p.idx)})}, state.config).catch(() => {});
}
// `manual`: only images the user picks from the context menu are translated.
async function enable(tabId, manual = false) {
  const existing = tabs[tabId];
  if (existing) {
    if (existing.manual && !manual) {
      existing.manual = false; existing.message = '가까운 만화 이미지를 찾는 중입니다.';
      await save();
      await notify(tabId, {type: 'ENABLE', minSize: settings.minSize, manual: false, originals: existing.originals});
    }
    return;
  }
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//.test(tab.url || '')) throw new Error('일반 웹 페이지에서만 번역을 켤 수 있습니다.');
  if (!settings.serverUrl || !settings.providerId) throw new Error('먼저 설정에서 서버와 페어링하고 번역 제공자를 고르세요.');
  tabs[tabId] = {url: tab.url, title: tab.title || '만화 번역', configKey: configKey(), config: {...settings}, pages: {}, originals: false, manual, message: manual ? '선택한 이미지를 번역합니다.' : '가까운 만화 이미지를 찾는 중입니다.'};
  await save();
  await notify(tabId, {type: 'ENABLE', minSize: settings.minSize, manual});
}
async function handle(message, sender) {
  await ready;
  const tabId = sender.url?.startsWith(chrome.runtime.getURL('')) && message.tabId != null ? message.tabId : sender.tab?.id;
  switch (message.type) {
    case 'GET_SETTINGS': return {settings: {...settings, token: settings.token ? 'paired' : ''}, ...publicPairing()};
    case 'TEST_CONNECTION': return connect(withServer(message.settings.serverUrl));
    case 'PROVIDER_OPTIONS':
      return (await api(`/api/providers/${encodeURIComponent(message.providerId)}/options`, {}, withServer(message.settings.serverUrl))).json();
    case 'PAIR_START': return startPairing(message.serverUrl, message.name);
    case 'PAIR_STATUS': return {...publicPairing(), paired: !!settings.token, deviceName: settings.deviceName, notice: settings.notice};
    case 'PAIR_CANCEL': clearTimeout(pairTimer); pairing = null; await savePairing(); return publicPairing();
    case 'UNPAIR': await unpair(); return {ok: true};
    case 'SAVE_SETTINGS': {
      const {token: _token, deviceName: _name, notice: _notice, ...fields} = message.settings;
      const server = withServer(fields.serverUrl);
      const next = {...settings, ...fields, serverUrl: server.serverUrl, token: server.token};
      if (!next.token && settings.token) { next.deviceName = ''; next.notice = '서버 주소가 바뀌어 다시 페어링해야 합니다.'; }
      next.minSize = Math.max(1, Number(next.minSize) || 300);
      const changed = JSON.stringify(llmKey(next)) !== configKey();
      if (changed) await Promise.all(Object.keys(tabs).map(id => disable(Number(id))));
      settings = next; await chrome.storage.local.set(settings); return {settings: {...settings, token: settings.token ? 'paired' : ''}};
    }
    case 'GET_STATE': return publicState(tabs[tabId]);
    case 'SET_ENABLED': if (message.enabled) await enable(tabId); else await disable(tabId); return publicState(tabs[tabId]);
    case 'SET_ORIGINALS': if (tabs[tabId]) { tabs[tabId].originals = message.originals; await save(); await notify(tabId, {type: 'SET_ORIGINALS', originals: message.originals}); } return publicState(tabs[tabId]);
    case 'HELLO': {
      if (!sender.tab) throw new Error('탭 정보가 없습니다.');
      if (!tabs[tabId] && autoFor(sender.tab.url)) await enable(tabId);
      const state = tabs[tabId];
      if (state) resume(tabId);
      return {...publicState(state), minSize: settings.minSize};
    }
    case 'CANDIDATE': {
      const state = tabs[tabId]; if (!state || !sender.tab) return {accepted: false};
      let page = state.pages[message.url];
      if (!page) page = state.pages[message.url] = {url: message.url, frames: [], status: 'queued', idx: null, sid: null};
      // Picking a failed image again from the context menu retries it.
      if (message.retry && page.status === 'failed') Object.assign(page, {status: 'queued', idx: null, sid: null, error: null});
      if (!page.frames.includes(sender.frameId)) page.frames.push(sender.frameId);
      await save();
      if (page.status === 'done') {
        try { await sendOutput(tabId, state, page); }
        catch (error) {
          if (error.status !== 404) throw error;
          const oldSid = page.sid;
          page.status = 'queued'; page.idx = null; page.sid = null;
          await recover(oldSid); resume(tabId);
        }
      }
      else if (page.status === 'failed') await notify(tabId, {type: 'PAGE_STATUS', url: page.url, status: 'failed', error: page.error}, sender.frameId);
      else { await notify(tabId, {type: 'PAGE_STATUS', url: page.url, status: page.status === 'queued' ? 'queued' : 'processing'}, sender.frameId); resume(tabId); }
      return {accepted: true};
    }
    case 'FETCH_IMAGE': if (!sender.tab || !tabs[tabId]) throw new Error('이 탭의 번역이 꺼져 있습니다.'); return imageFetch(message.url, message.pageUrl);
    default: throw new Error('알 수 없는 요청입니다.');
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handle(message, sender).then(data => respond({ok: true, ...data}), error => respond({ok: false, error: errorText(error)}));
  return true;
});
chrome.tabs.onRemoved.addListener(id => { ready.then(() => disable(id)); });
// Whole-tab translation starts by itself everywhere (autoAll) or on listed hosts.
function autoFor(url) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) && (settings.autoAll || settings.autoSites.includes(parsed.hostname));
  } catch { return false; }
}
function withoutHash(url) { return (url || '').split('#')[0]; }
function hostOf(url) { try { return new URL(url).hostname; } catch { return ''; } }
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  ready.then(async () => {
    const state = tabs[id];
    if (!state) return;
    // A hash-only change (#3 → #4 in many readers) keeps the same document and its images.
    if (change.url && change.status !== 'loading' && withoutHash(change.url) === withoutHash(state.url)) {
      state.url = change.url; await save(); return;
    }
    // A document reload invalidates frame-local object URLs even when its URL is unchanged.
    if (change.status === 'loading' || (change.url && change.url !== state.url)) {
      const {manual} = state, sameSite = hostOf(tab.url) === hostOf(state.url);
      await disable(id);
      // Translation the user turned on stays on while they read through the same site
      // (next page, next chapter, SPA route changes); automatic rules also apply elsewhere.
      // After a real reload the new document's HELLO finds this state and resumes it.
      if (autoFor(tab.url)) await enable(id).catch(() => {});
      else if (sameSite) await enable(id, manual).catch(() => {});
    }
  });
});
chrome.alarms.onAlarm.addListener(() => { ready.then(() => Object.keys(tabs).forEach(id => resume(Number(id)))); });
// ---------------------------------------------------------------- context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-image', title: '이 이미지 번역', contexts: ['image'],
    documentUrlPatterns: ['http://*/*', 'https://*/*'],
  });
});
function onMenuClick(info, tab) {
  if (info.menuItemId !== 'translate-image' || !tab?.id || !info.srcUrl) return Promise.resolve();
  return ready.then(async () => {
    if (!settings.serverUrl || !settings.providerId) { chrome.runtime.openOptionsPage(); return; }
    await enable(tab.id, true);
    await notify(tab.id, {type: 'TRANSLATE_IMAGE', url: info.srcUrl}, info.frameId);
  }).catch(error => { if (tabs[tab.id]) tabs[tab.id].message = errorText(error); });
}
chrome.contextMenus.onClicked.addListener(onMenuClick);
