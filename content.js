(() => {
  if (globalThis.__comicTranslatorLoaded) return;
  globalThis.__comicTranslatorLoaded = true;
  let enabled = false, manual = false, originals = false, minSize = 300, scanTimer, frameScheduled = false;
  const records = new Map(), assets = new Map(), roots = new Map();
  const intersection = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const record = records.get(entry.target);
      if (record) { record.near = entry.isIntersecting; if (record.near) consider(record); }
    }
  }, {rootMargin: `${Math.max(innerHeight * 2, 1000)}px 0px`});
  const resize = new ResizeObserver(positionSoon);
  async function message(payload) {
    const result = await chrome.runtime.sendMessage(payload);
    if (!result?.ok) throw new Error(result?.error || '확장 프로그램과 연결할 수 없습니다.');
    return result;
  }
  function localUrl(image) { return image.currentSrc || image.src; }
  function owned(url) { return [...assets.values()].some(asset => asset.objectUrl === url); }
  // data: URLs (and other very long ones) carry the whole image. Exchange a short hash instead,
  // so messages and the worker's session storage never hold image bytes as a key.
  const keys = new Map();
  async function assetKey(url) {
    if (!url.startsWith('data:') && url.length <= 2048) return url;
    if (!keys.has(url)) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
      keys.set(url, 'inline:' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''));
    }
    return keys.get(url);
  }
  const BADGE_STATE = {'번역 중': 'processing', '번역 대기': 'queued', '실패': 'failed'};
  function setBadge(record, text, error = '') {
    if (!enabled || !record.image.isConnected) return;
    if (!record.badge) {
      record.badge = document.createElement('div');
      record.badge.className = 'comic-translator-badge';
      record.badge.setAttribute('data-comic-translator-ui', '');
      const spinner = document.createElement('span'); spinner.className = 'comic-translator-spinner';
      const label = document.createElement('span');
      record.badge.append(spinner, label);
      document.documentElement.append(record.badge);
    }
    const state = BADGE_STATE[text] || 'queued';
    // The badge ignores the mouse, so a tooltip would never show: put the reason in the text.
    record.badge.lastChild.textContent = state === 'failed' && error ? `실패 · ${error.length > 80 ? error.slice(0, 80) + '…' : error}` : text;
    record.badge.title = error;
    record.badge.dataset.state = state;
    record.badge.dataset.failed = state === 'failed' ? 'true' : 'false';
    // A moving sweep over the image itself while the server works on it.
    if (state === 'processing' && !record.working) {
      record.working = document.createElement('div');
      record.working.className = 'comic-translator-working';
      record.working.setAttribute('data-comic-translator-ui', '');
      document.documentElement.append(record.working);
    } else if (state !== 'processing') { record.working?.remove(); record.working = null; }
    record.image.dataset.comicTranslatorStatus = text;
    positionSoon();
  }
  function removeBadge(record) {
    record.badge?.remove(); record.badge = null;
    record.working?.remove(); record.working = null;
    delete record.image.dataset.comicTranslatorStatus;
  }
  function positionSoon() {
    if (frameScheduled) return;
    frameScheduled = true;
    requestAnimationFrame(() => {
      frameScheduled = false;
      for (const record of records.values()) {
        const rect = record.image.getBoundingClientRect();
        const visible = enabled && record.image.isConnected && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
        if (record.badge) {
          record.badge.style.setProperty('display', visible ? 'flex' : 'none', 'important');
          record.badge.style.left = `${Math.max(0, rect.left + 6)}px`;
          record.badge.style.top = `${Math.max(0, rect.top + 6)}px`;
        }
        if (record.working) {
          record.working.style.display = visible ? 'block' : 'none';
          record.working.style.left = `${rect.left}px`; record.working.style.top = `${rect.top}px`;
          record.working.style.width = `${rect.width}px`; record.working.style.height = `${rect.height}px`;
        }
        if (record.canvas) {
          record.canvas.style.display = visible && !originals ? 'block' : 'none';
          record.canvas.style.left = `${rect.left}px`; record.canvas.style.top = `${rect.top}px`;
          record.canvas.style.width = `${rect.width}px`; record.canvas.style.height = `${rect.height}px`;
        }
      }
    });
  }
  function capture(record) {
    const image = record.image;
    record.source = {src: image.getAttribute('src'), srcset: image.getAttribute('srcset')};
    image.dataset.comicTranslatorOriginalSrc = record.source.src ?? '';
    image.dataset.comicTranslatorOriginalSrcset = record.source.srcset ?? '';
  }
  function resetAttribute(image, name, value) { if (value == null) image.removeAttribute(name); else image.setAttribute(name, value); }
  function sameImage(a, b) {
    try {
      const x = new URL(a, location.href), y = new URL(b, location.href);
      return x.origin + x.pathname === y.origin + y.pathname;
    } catch { return false; }
  }
  function backgroundUrl(element) {
    return /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(element).backgroundImage || '')?.[1] || '';
  }
  // Some sites (e.g. X) paint the picture as a CSS background and keep a transparent <img>
  // on top only for saving/dragging; swapping that <img> alone changes nothing visible.
  function paintBackgrounds(record) {
    const image = record.image, original = record.source?.src || '';
    if (!original || Number(getComputedStyle(image).opacity) > 0.05) return;
    record.backgrounds ||= [];
    let scope = image.parentElement;
    for (let depth = 0; scope && depth < 3; depth++, scope = scope.parentElement) {
      const painted = [...scope.querySelectorAll('*')].filter(el => el !== image && !el.hasAttribute('data-comic-translator-ui') && sameImage(backgroundUrl(el), original));
      for (const el of painted) {
        if (!record.backgrounds.some(b => b.el === el)) record.backgrounds.push({el, value: el.style.getPropertyValue('background-image'), priority: el.style.getPropertyPriority('background-image')});
        el.style.setProperty('background-image', `url("${record.asset.objectUrl}")`, 'important');
      }
      if (painted.length) break;
    }
  }
  function unpaintBackgrounds(record) {
    for (const b of record.backgrounds || []) {
      if (b.value) b.el.style.setProperty('background-image', b.value, b.priority); else b.el.style.removeProperty('background-image');
    }
    record.backgrounds = null;
  }
  function restore(record) {
    if (!record.swapped && !record.canvas) return;
    record.swapped = false;
    record.canvas?.remove(); record.canvas = null;
    unpaintBackgrounds(record);
    record.image.style.opacity = record.opacity;
    if (record.source) {
      resetAttribute(record.image, 'src', record.source.src);
      resetAttribute(record.image, 'srcset', record.source.srcset);
    }
    record.image.style.width = record.width;
    record.image.style.height = record.height;
    delete record.image.dataset.comicTranslatorTranslated;
  }
  async function canvasFallback(record, asset) {
    if (!enabled || originals || record.asset !== asset) return;
    try {
      const bitmap = await createImageBitmap(asset.blob);
      if (!enabled || originals || record.asset !== asset) { bitmap.close(); return; }
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.className = 'comic-translator-canvas';
      canvas.setAttribute('data-comic-translator-ui', '');
      const computed = getComputedStyle(record.image);
      canvas.style.objectFit = computed.objectFit;
      canvas.style.objectPosition = computed.objectPosition;
      canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
      record.canvas?.remove(); record.canvas = canvas;
      document.documentElement.append(canvas);
      record.image.style.opacity = '0';
      // Restore the loaded original beneath the overlay; blob CSP errors no longer loop.
      resetAttribute(record.image, 'src', record.source.src);
      resetAttribute(record.image, 'srcset', record.source.srcset);
      record.image.dataset.comicTranslatorTranslated = 'canvas';
      removeBadge(record); positionSoon();
    } catch (error) { setBadge(record, '실패', `번역 이미지 표시 실패: ${error.message}`); }
  }
  function apply(record, asset) {
    if (!enabled || originals || !asset.objectUrl || !record.image.isConnected || record.asset !== asset) return;
    if (record.swapped) return;
    const image = record.image, rect = image.getBoundingClientRect();
    capture(record);
    record.swapped = true;
    // Preserve auto-sized images without overriding responsive CSS constraints.
    if (rect.width && rect.height && !image.hasAttribute('width') && !image.hasAttribute('height') && !record.width && !record.height) {
      image.style.width = `${rect.width}px`; image.style.height = `${rect.height}px`;
    }
    image.removeAttribute('srcset');
    image.src = asset.objectUrl;
    image.dataset.comicTranslatorTranslated = 'blob';
    paintBackgrounds(record);
    removeBadge(record);
  }
  async function consider(record) {
    const image = record.image;
    if (!enabled || !image.complete || !image.naturalWidth || record.swapped || record.canvas) return;
    // Right-clicked images skip the automatic proximity and size rules; manual mode translates nothing else.
    if (!record.forced) {
      if (manual || !record.near) return;
      if (Math.min(image.naturalWidth, image.naturalHeight) < minSize || image.naturalWidth * image.naturalHeight < 250000) return;
    }
    const url = localUrl(image);
    if (!url || owned(url) || !/^(https?:|data:|blob:)/.test(url)) return;
    const key = await assetKey(url);
    if (localUrl(image) !== url || record.swapped) return;
    let asset = assets.get(key);
    if (!asset) { asset = {key, url, images: new Set(), requested: false, dataUrl: null, objectUrl: null, blob: null, status: 'queued'}; assets.set(key, asset); }
    if (record.asset !== asset) {
      record.asset?.images.delete(record);
      record.asset = asset; asset.images.add(record); capture(record);
    }
    if (asset.objectUrl) { apply(record, asset); return; }
    setBadge(record, asset.status === 'failed' ? '실패' : asset.status === 'processing' ? '번역 중' : '번역 대기', asset.error);
    if (asset.requested && !record.retry) return;
    asset.requested = true;
    const retry = !!record.retry; record.retry = false;
    try { await message({type: 'CANDIDATE', url: key, retry}); }
    catch (error) { asset.requested = false; setBadge(record, '실패', error.message); }
  }
  function changed(record) {
    if (!enabled) return;
    const image = record.image;
    const src = image.getAttribute('src'), srcset = image.getAttribute('srcset');
    if (record.swapped) {
      if (record.canvas && src === record.source?.src && srcset === record.source?.srcset) return;
      if (!record.canvas && src === record.asset?.objectUrl && !srcset) return;
      // A site rewrote an original. Do not restore old attributes over that rewrite.
      record.swapped = false; record.canvas?.remove(); record.canvas = null; unpaintBackgrounds(record);
      image.style.opacity = record.opacity;
      image.style.width = record.width; image.style.height = record.height;
      if (src === record.asset?.objectUrl) resetAttribute(image, 'src', record.source.src);
      delete image.dataset.comicTranslatorTranslated;
      record.asset?.images.delete(record); record.asset = null;
      capture(record);
    }
    if (image.complete) setTimeout(() => consider(record), 0);
  }
  function watch(image) {
    if (records.has(image)) return;
    const record = {image, asset: null, near: false, swapped: false, canvas: null, badge: null, width: image.style.width, height: image.style.height, opacity: image.style.opacity};
    records.set(image, record);
    record.onLoad = () => {
      if (record.swapped && !record.canvas) { removeBadge(record); return; }
      consider(record); positionSoon();
    };
    record.onError = () => { if (record.swapped && !record.canvas && record.asset?.blob) canvasFallback(record, record.asset); };
    image.addEventListener('load', record.onLoad); image.addEventListener('error', record.onError);
    intersection.observe(image); resize.observe(image);
  }
  function scan(root) {
    if (!enabled) return;
    if (!roots.has(root)) {
      const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes') {
            const record = records.get(mutation.target); if (record) changed(record);
          } else for (const node of mutation.addedNodes) if (node.nodeType === 1 && !node.hasAttribute('data-comic-translator-ui')) scanNodes(node);
        }
        positionSoon();
      });
      observer.observe(root, {subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset', 'sizes']});
      roots.set(root, observer);
    }
    scanNodes(root);
  }
  function scanNodes(node) {
    if (node.matches?.('img')) watch(node);
    if (node.shadowRoot) scan(node.shadowRoot);
    for (const element of node.querySelectorAll?.('img, *') || []) {
      if (element.matches('img')) watch(element);
      if (element.shadowRoot) scan(element.shadowRoot);
    }
  }
  function start(config) {
    minSize = config.minSize || 300; originals = !!config.originals;
    const wasManual = manual; manual = !!config.manual;
    if (enabled) {
      for (const record of records.values()) {
        if (!originals && record.asset?.objectUrl) apply(record, record.asset);
        else if (wasManual && !manual) consider(record);
      }
      return;
    }
    enabled = true;
    scan(document);
    scanTimer = setInterval(() => {
      scanNodes(document);
      for (const [image, record] of records) if (!image.isConnected) {
        record.badge?.remove(); record.working?.remove(); record.canvas?.remove(); intersection.unobserve(image); resize.unobserve(image);
        image.removeEventListener('load', record.onLoad); image.removeEventListener('error', record.onError);
        record.asset?.images.delete(record); records.delete(image);
      }
      for (const [root, observer] of roots) if (root.host && !root.host.isConnected) { observer.disconnect(); roots.delete(root); }
      // Frameworks may re-render the painted element; paint the translation onto the new one.
      if (!originals) for (const record of records.values()) if (record.swapped && !record.canvas && record.asset?.objectUrl) paintBackgrounds(record);
      positionSoon();
    }, 3000);
  }
  function stop() {
    enabled = false; manual = false; clearInterval(scanTimer);
    for (const observer of roots.values()) observer.disconnect(); roots.clear(); intersection.disconnect(); resize.disconnect();
    for (const record of records.values()) {
      restore(record); removeBadge(record);
      record.image.removeEventListener('load', record.onLoad); record.image.removeEventListener('error', record.onError);
      delete record.image.dataset.comicTranslatorOriginalSrc; delete record.image.dataset.comicTranslatorOriginalSrcset;
    }
    for (const asset of assets.values()) if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
    records.clear(); assets.clear(); keys.clear();
  }
  async function imageBytes(key) {
    const asset = assets.get(key);
    if (!asset || !enabled) throw new Error('원본 이미지가 현재 페이지에 없습니다.');
    const url = asset.url;
    let blob;
    try {
      if (/^https?:/.test(url)) {
        const fetched = await message({type: 'FETCH_IMAGE', url, pageUrl: location.href});
        blob = new Blob([Uint8Array.from(atob(fetched.data), c => c.charCodeAt(0))], {type: fetched.mime});
      } else {
        const response = await fetch(url);
        if (!response.ok) throw new Error('이미지 읽기 실패');
        blob = await response.blob();
      }
    } catch (error) {
      const record = [...asset.images].find(item => item.image.complete && item.image.naturalWidth && !item.swapped);
      if (!record) throw new Error('원본 이미지를 가져올 수 없습니다.');
      const canvas = document.createElement('canvas'); canvas.width = record.image.naturalWidth; canvas.height = record.image.naturalHeight;
      try {
        canvas.getContext('2d').drawImage(record.image, 0, 0);
        blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('이미지 변환 실패')), 'image/png'));
      } catch { throw new Error('이미지를 읽을 수 없습니다. 사이트의 외부 이미지 접근 제한 또는 로그인 상태를 확인하세요.'); }
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('이미지를 PNG로 변환할 수 없습니다.');
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('이미지 바이트를 읽을 수 없습니다.')); reader.readAsDataURL(blob);
    });
    return {data: dataUrl.split(',')[1], mime: blob.type};
  }
  async function receive(payload) {
    switch (payload.type) {
      case 'ENABLE': start(payload); break;
      case 'DISABLE': stop(); break;
      case 'GET_BYTES': return imageBytes(payload.url);
      case 'TRANSLATE_IMAGE': {
        scanNodes(document);
        const targets = [...records.values()].filter(record => localUrl(record.image) === payload.url || record.image.src === payload.url);
        for (const record of targets) {
          record.forced = true;
          if (record.asset?.status === 'failed') { record.asset.status = 'queued'; record.asset.error = ''; record.retry = true; }
          consider(record);
        }
        return {found: targets.length};
      }
      case 'SET_ORIGINALS':
        originals = payload.originals;
        for (const record of records.values()) if (originals) restore(record); else if (record.asset?.objectUrl) apply(record, record.asset);
        positionSoon(); break;
      case 'PAGE_STATUS': {
        const asset = assets.get(payload.url); if (!asset) break;
        asset.status = payload.status; asset.error = payload.error;
        for (const record of asset.images) setBadge(record, payload.status === 'failed' ? '실패' : payload.status === 'queued' ? '번역 대기' : '번역 중', payload.error);
        break;
      }
      case 'RESULT': {
        const asset = assets.get(payload.url); if (!asset || !enabled) break;
        if (!asset.objectUrl) {
          asset.blob = new Blob([Uint8Array.from(atob(payload.dataUrl.split(',')[1]), c => c.charCodeAt(0))], {type: 'image/png'});
          asset.objectUrl = URL.createObjectURL(asset.blob);
        }
        asset.status = 'done';
        for (const record of asset.images) { removeBadge(record); apply(record, asset); }
        break;
      }
    }
    return {};
  }
  chrome.runtime.onMessage.addListener((payload, sender, respond) => {
    receive(payload).then(result => respond({ok: true, ...result}), error => respond({ok: false, error: error.message})); return true;
  });
  addEventListener('scroll', positionSoon, {passive: true, capture: true}); addEventListener('resize', positionSoon, {passive: true});
  message({type: 'HELLO'}).then(state => { if (state.enabled) start(state); }).catch(() => {});
})();
