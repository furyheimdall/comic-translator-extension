const $ = id => document.getElementById(id);
let settings, currentTab, hostname = '', state = {enabled: false, originals: false}, connectedProviders = null;
let busy = false, lastPairStatus = null;
async function send(payload) {
  const result = await chrome.runtime.sendMessage(payload);
  if (!result?.ok) throw new Error(result?.error || '확장 프로그램에 연결할 수 없습니다.');
  return result;
}
function show(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
function form() {
  return {...settings, serverUrl: $('serverUrl').value.trim().replace(/\/$/, ''), providerId: $('providerId').value, model: $('model').value, reasoning: $('reasoning').value || 'default', instructions: $('instructions').value, minSize: Math.max(1, Number($('minSize').value) || 300)};
}
function defaultDeviceName() {
  const data = navigator.userAgentData;
  const brand = data?.brands?.map(b => b.brand).find(name => !/not.a.brand|chromium/i.test(name)) || 'Chrome';
  return `${brand} · ${data?.platform || navigator.platform || '알 수 없는 OS'}`;
}
function renderPairing(status) {
  const pending = status.pairing?.status === 'pending';
  $('pairCode').hidden = !pending;
  if (pending) $('pairCode').textContent = `${status.pairing.code.slice(0, 3)} ${status.pairing.code.slice(3)}`;
  $('pair').hidden = pending || status.paired;
  $('pairCancel').hidden = !pending;
  $('unpair').hidden = !status.paired;
  $('deviceName').disabled = pending || status.paired;
  if (status.paired) show('pairState', `페어링됨 · 기기 “${status.deviceName}”`), $('pairState').classList.add('ok');
  else {
    $('pairState').classList.remove('ok');
    if (pending) show('pairState', `서버 웹 UI → 확장 프로그램에서 아래 코드의 요청을 승인하세요. ${status.pairing.error || ''}`, !!status.pairing.error);
    else show('pairState', status.pairing?.error || status.notice || '이 서버와 페어링되지 않았습니다. 비밀번호 없는 서버는 페어링 없이 연결됩니다.', !!(status.pairing?.error || status.notice));
  }
  const becamePaired = lastPairStatus === 'pending' && status.paired;
  lastPairStatus = pending ? 'pending' : status.paired ? 'paired' : 'none';
  return becamePaired;
}
async function refreshPairing() {
  const status = await send({type: 'PAIR_STATUS'});
  if (renderPairing(status)) {
    settings = (await send({type: 'GET_SETTINGS'})).settings;
    $('serverUrl').value = settings.serverUrl;
    await testConnection().catch(() => {});
  }
}
function fill(select, items, selected) {
  select.replaceChildren(...items.map(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; return option; }));
  select.value = items.some(([value]) => value === selected) ? selected : items[0]?.[0] ?? '';
}
// Models and reasoning levels come from the server for the chosen provider.
async function loadProviderOptions(selectedModel, selectedReasoning) {
  const providerId = $('providerId').value;
  $('model').disabled = $('reasoning').disabled = true;
  if (!providerId) { fill($('model'), [['', '제공자를 먼저 선택하세요']], ''); fill($('reasoning'), [['default', '제공자 기본값']], 'default'); return; }
  show('llmMessage', '모델 목록을 불러오는 중…');
  try {
    const options = await send({type: 'PROVIDER_OPTIONS', providerId, settings: form()});
    fill($('model'), options.models.map(model => ['' + (model === options.default_model ? '' : model), model === options.default_model ? `${model} (기본)` : model]), selectedModel || '');
    fill($('reasoning'), options.reasoning_levels.map(level => [level.value, level.label]), selectedReasoning || 'default');
    $('model').disabled = $('reasoning').disabled = false;
    show('llmMessage', options.models_error || '서버가 이 제공자에 제공하는 모델과 추론 수준입니다. 추론을 낮출수록 빠릅니다.', !!options.models_error);
  } catch (error) { show('llmMessage', error.message, true); }
}
function populate(providers, selected) {
  $('providerId').replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '번역 제공자 선택'; $('providerId').append(placeholder);
  for (const provider of providers) {
    const option = document.createElement('option'); option.value = provider.id;
    option.textContent = `${provider.name}${provider.model ? ` · ${provider.model}` : ''}${provider.connected ? '' : ' (연결 안 됨)'}`;
    option.disabled = !provider.connected; $('providerId').append(option);
  }
  if (providers.some(p => p.id === selected && p.connected)) $('providerId').value = selected;
  else if (providers.filter(p => p.connected).length === 1) $('providerId').value = providers.find(p => p.connected).id;
}
async function testConnection() {
  show('connectionMessage', '서버 연결 확인 중…'); $('test').disabled = true;
  try {
    const result = await send({type: 'TEST_CONNECTION', settings: form()});
    connectedProviders = result.providers; populate(result.providers, $('providerId').value || settings.providerId);
    await loadProviderOptions($('providerId').value === settings.providerId ? settings.model : '', $('providerId').value === settings.providerId ? settings.reasoning : 'default');
    show('connectionMessage', result.providers.some(p => p.connected) ? result.message : '서버 연결 성공 · 서버에서 번역 제공자를 먼저 연결하세요.', !result.providers.some(p => p.connected));
  } catch (error) { connectedProviders = null; show('connectionMessage', error.message, true); throw error; }
  finally { $('test').disabled = false; }
}
async function saveSettings() {
  if (!connectedProviders) await testConnection();
  const next = form();
  if (!connectedProviders.some(p => p.id === next.providerId && p.connected)) throw new Error('연결된 번역 제공자를 선택하세요.');
  settings = (await send({type: 'SAVE_SETTINGS', settings: next})).settings;
  show('feedback', '설정을 저장했습니다. 서버·제공자·모델·추론·메모를 바꾸면 실행 중인 탭 번역이 꺼집니다.');
}
function render(next) {
  state = next;
  $('enabled').checked = state.enabled;
  for (const key of ['queued', 'processing', 'done', 'failed']) $(key).textContent = String(state.counts?.[key] || 0);
  show('sessionMessage', state.message || (state.enabled ? '가까운 만화 이미지를 찾는 중입니다.' : '번역이 꺼져 있습니다.'), !!state.counts?.failed);
  $('originals').textContent = state.originals ? '번역 보기' : '원본 보기';
  $('originals').disabled = !state.enabled;
}
async function refresh() {
  if (currentTab && !busy) render(await send({type: 'GET_STATE', tabId: currentTab.id}));
}
async function action(fn) {
  busy = true;
  try { await fn(); }
  catch (error) { show('feedback', error.message, true); }
  finally { busy = false; await refresh().catch(() => {}); }
}
$('test').addEventListener('click', () => action(testConnection));
$('providerId').addEventListener('change', () => action(() => loadProviderOptions('', 'default')));
$('save').addEventListener('click', () => action(saveSettings));
$('enabled').addEventListener('change', () => {
  const enabled = $('enabled').checked;
  action(async () => {
    if (enabled) await saveSettings();
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
$('pair').addEventListener('click', () => action(async () => {
  const serverUrl = form().serverUrl;
  if (!serverUrl) throw new Error('먼저 서버 주소를 입력하세요.');
  renderPairing({...(await send({type: 'PAIR_START', serverUrl, name: $('deviceName').value.trim()})), paired: false});
}));
$('pairCancel').addEventListener('click', () => action(async () => { await send({type: 'PAIR_CANCEL'}); await refreshPairing(); }));
$('unpair').addEventListener('click', () => action(async () => {
  if (!confirm('이 브라우저의 서버 연결을 해제할까요? 다시 쓰려면 페어링해야 합니다.')) return;
  await send({type: 'UNPAIR'});
  connectedProviders = null; populate([], ''); await loadProviderOptions();
  show('connectionMessage', '');
  await refreshPairing();
}));
$('serverUrl').addEventListener('input', () => { connectedProviders = null; show('connectionMessage', '서버 주소가 변경되었습니다. 연결을 다시 테스트하세요. 다른 서버라면 다시 페어링해야 합니다.'); });
(async () => {
  const initial = await send({type: 'GET_SETTINGS'});
  settings = initial.settings;
  for (const id of ['serverUrl', 'instructions', 'minSize']) $(id).value = settings[id];
  $('deviceName').value = settings.deviceName || defaultDeviceName();
  await refreshPairing();
  if (settings.providerId) {
    const option = document.createElement('option'); option.value = settings.providerId; option.textContent = '저장된 제공자 · 연결 확인 필요'; $('providerId').append(option); $('providerId').value = settings.providerId;
  }
  [currentTab] = await chrome.tabs.query({active: true, currentWindow: true});
  const eligible = currentTab && /^https?:\/\//.test(currentTab.url || '');
  $('enabled').disabled = !eligible; $('autoSite').disabled = !eligible;
  if (eligible) {
    hostname = new URL(currentTab.url).hostname; $('site').textContent = hostname; $('autoSite').checked = settings.autoSites.includes(hostname);
    await refresh();
  } else show('site', '번역할 일반 웹 페이지에서 확장 프로그램을 열어 주세요.');
  if (settings.serverUrl) await testConnection().catch(() => {});
  setInterval(() => Promise.all([refresh(), refreshPairing()]).catch(error => show('feedback', error.message, true)), 1000);
})().catch(error => show('feedback', error.message, true));
