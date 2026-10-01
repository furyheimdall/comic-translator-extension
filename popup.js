const $ = id => document.getElementById(id);
let settings, currentTab, hostname = '', state = {enabled: false, originals: false}, busy = false;
async function send(payload) {
  const result = await chrome.runtime.sendMessage(payload);
  if (!result?.ok) throw new Error(result?.error || '확장 프로그램에 연결할 수 없습니다.');
  return result;
}
function show(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
$('version').textContent = `v${chrome.runtime.getManifest().version}`;
function ready() { return !!(settings.serverUrl && settings.providerId); }
function renderSummary(status) {
  const server = settings.serverUrl ? new URL(settings.serverUrl).host : '설정 안 됨';
  $('summaryServer').textContent = status.paired ? `${server} · 페어링됨 (${status.deviceName})` : settings.serverUrl ? `${server} · ${status.notice || '페어링 안 됨'}` : server;
  $('summaryLlm').textContent = settings.providerLabel || (settings.providerId ? '제공자 선택됨' : '설정 안 됨');
  $('setupNeeded').hidden = ready();
}
function render(next) {
  state = next;
  // Right-click translation of single images runs in "manual" mode; the toggle means the whole tab.
  $('enabled').checked = state.enabled && !state.manual;
  for (const key of ['queued', 'processing', 'done', 'failed']) $(key).textContent = String(state.counts?.[key] || 0);
  const idle = state.manual ? '오른쪽 클릭한 이미지만 번역합니다.' : state.enabled ? '가까운 만화 이미지를 찾는 중입니다.' : '번역이 꺼져 있습니다.';
  show('sessionMessage', state.message || idle, !!state.counts?.failed);
  $('originals').textContent = state.originals ? '번역 보기' : '원본 보기';
  $('originals').disabled = !state.enabled;
}
async function refresh() {
  if (!currentTab || busy) return;
  render(await send({type: 'GET_STATE', tabId: currentTab.id}));
  settings = (await send({type: 'GET_SETTINGS'})).settings;
  renderSummary(await send({type: 'PAIR_STATUS'}));
}
async function action(fn) {
  busy = true;
  try { await fn(); }
  catch (error) { show('feedback', error.message, true); }
  finally { busy = false; await refresh().catch(() => {}); }
}
$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('enabled').addEventListener('change', () => {
  const enabled = $('enabled').checked;
  action(async () => {
    if (enabled && !ready()) { $('enabled').checked = false; chrome.runtime.openOptionsPage(); throw new Error('먼저 설정을 마치세요.'); }
    render(await send({type: 'SET_ENABLED', tabId: currentTab.id, enabled}));
  });
});
$('originals').addEventListener('click', () => action(async () => render(await send({type: 'SET_ORIGINALS', tabId: currentTab.id, originals: !state.originals}))));
$('autoSite').addEventListener('change', () => action(async () => {
  const autoSites = new Set(settings.autoSites);
  if ($('autoSite').checked) autoSites.add(hostname); else autoSites.delete(hostname);
  settings = (await send({type: 'SAVE_SETTINGS', settings: {...settings, autoSites: [...autoSites]}})).settings;
  show('feedback', $('autoSite').checked ? '이 사이트의 새 페이지에서도 자동으로 번역합니다.' : '이 사이트 자동 번역을 껐습니다.');
}));
(async () => {
  settings = (await send({type: 'GET_SETTINGS'})).settings;
  renderSummary(await send({type: 'PAIR_STATUS'}));
  [currentTab] = await chrome.tabs.query({active: true, currentWindow: true});
  const eligible = currentTab && /^https?:\/\//.test(currentTab.url || '');
  $('enabled').disabled = !eligible; $('autoSite').disabled = !eligible;
  if (eligible) {
    hostname = new URL(currentTab.url).hostname; $('site').textContent = hostname; $('autoSite').checked = settings.autoSites.includes(hostname);
    await refresh();
  } else show('site', '번역할 일반 웹 페이지에서 확장 프로그램을 열어 주세요.');
  setInterval(() => refresh().catch(error => show('feedback', error.message, true)), 1000);
})().catch(error => show('feedback', error.message, true));
