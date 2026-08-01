/**
 * 小说拆文 · 独立网页的最小框架
 * 只提供拆文功能需要的 App API（registerFeature / escapeHtml / toast / confirm / prompt）、
 * 主题切换，以及「导出 / 导入 JSON」数据迁移。不含任何同步逻辑。
 */
(function () {
  'use strict';

  const THEME_KEY = 'novelnotes.theme';
  const DATA_KEY = 'novelnotes.v1';
  let rootEl = null;
  let booted = false;
  const features = [];

  // ---------- 主题 ----------
  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }

  // ---------- 工具 ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  // 数字格式化：把 660000 渲染成 "66.0 万"，10123 -> "1.01 万"，等
  function formatCount(n) {
    if (typeof n !== 'number' || !isFinite(n) || n <= 0) return n ? String(n) : '0';
    if (n >= 100000000) return (n / 100000000).toFixed(n % 100000000 ? 1 : 0) + ' 亿';
    if (n >= 10000) return (n / 10000).toFixed((n % 10000) ? 1 : 0) + ' 万';
    if (n >= 1000) return (n / 1000).toFixed(1) + ' 千';
    return String(Math.round(n));
  }
  let toastTimer;
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
  }

  // ---------- 自定义弹层（PWA 不支持原生 confirm/prompt） ----------
  function ensureModal() {
    let mask = document.getElementById('app-modal');
    if (mask) return mask;
    mask = document.createElement('div');
    mask.id = 'app-modal';
    mask.className = 'app-modal-mask';
    mask.hidden = true;
    mask.innerHTML =
      '<div class="app-modal" role="dialog" aria-modal="true">' +
      '  <div class="app-modal-title" id="app-modal-title"></div>' +
      '  <div class="app-modal-body" id="app-modal-body"></div>' +
      '  <div class="app-modal-actions" id="app-modal-actions"></div>' +
      '</div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', (e) => { if (e.target === mask) closeModal(); });
    return mask;
  }
  function openModal(opts) {
    const mask = ensureModal();
    mask.querySelector('#app-modal-title').textContent = opts.title || '';
    const bodyEl = mask.querySelector('#app-modal-body');
    bodyEl.innerHTML = '';
    if (opts.body) {
      if (typeof opts.body === 'string') bodyEl.innerHTML = opts.body;
      else bodyEl.appendChild(opts.body);
    }
    const actionsEl = mask.querySelector('#app-modal-actions');
    actionsEl.innerHTML = '';
    (opts.actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.kind || '');
      b.type = 'button';
      b.textContent = a.text;
      b.addEventListener('click', () => {
        if (a.close !== false) closeModal();
        if (a.onClick) { try { a.onClick(); } catch (e) { console.error(e); toast('操作失败，请重试'); } }
      });
      actionsEl.appendChild(b);
    });
    mask.hidden = false;
  }
  function closeModal() { const m = document.getElementById('app-modal'); if (m) m.hidden = true; }
  function confirmDialog(title, msg, onYes, opts) {
    const danger = !opts || opts.danger !== false;
    openModal({
      title: title,
      body: '<p style="margin:0;font-size:14px;line-height:1.6">' + escapeHtml(msg) + '</p>',
      actions: [
        { text: (opts && opts.cancelText) || '取消', kind: 'ghost' },
        { text: (opts && opts.okText) || '确定', kind: danger ? 'danger' : '', onClick: onYes },
      ],
    });
  }
  function promptDialog(title, defaultVal, onValue, opts) {
    const wrap = document.createElement('div');
    wrap.className = 'app-modal-form';
    const type = (opts && opts.type) || 'text';
    const hint = opts && opts.hint;
    wrap.innerHTML =
      (hint ? '<p class="app-modal-hint">' + escapeHtml(hint) + '</p>' : '') +
      '<input id="app-modal-input" type="' + type + '"' +
      (type === 'number' ? ' inputmode="decimal" step="0.01" min="0"' : '') +
      ' value="' + escapeHtml(defaultVal == null ? '' : String(defaultVal)) + '" />';
    openModal({
      title: title,
      body: wrap,
      actions: [
        { text: '取消', kind: 'ghost' },
        { text: '确定', kind: '', onClick: () => {
          const raw = wrap.querySelector('#app-modal-input').value;
          const v = (type === 'number') ? parseFloat(raw) : raw;
          if (onValue) onValue(v);
        } },
      ],
    });
    setTimeout(() => { const inp = wrap.querySelector('#app-modal-input'); if (inp) { inp.focus(); if (type !== 'number') inp.select(); } }, 80);
  }

  // ---------- 导出 / 导入（全量备份整个本地数据） ----------
  function exportData() {
    try {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) items[k] = localStorage.getItem(k);
      }
      const payload = { _backup: 'novel-notes', exportedAt: new Date().toISOString(), items };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      a.href = url;
      a.download = 'chaowen-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast('已导出全部数据（书架 / 收藏 / 趋势 / 主题）');
    } catch (e) { console.error(e); toast('导出失败'); }
  }
  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        let items = null;
        if (parsed && parsed._backup && parsed.items) {
          items = parsed.items;
        } else if (parsed && Array.isArray(parsed.books)) {
          // 兼容旧格式：仅恢复书架
          items = {}; items[DATA_KEY] = JSON.stringify({ books: parsed.books });
        } else if (Array.isArray(parsed)) {
          items = {}; items[DATA_KEY] = JSON.stringify({ books: parsed });
        }
        if (!items) { toast('文件格式不正确，无法导入'); return; }
        confirmDialog('导入数据', '导入会用备份覆盖当前所有本地数据，确定继续？\n（建议先点「导出」备份当前数据）', () => {
          for (const k in items) { try { localStorage.setItem(k, items[k]); } catch (e) {} }
          toast('已导入，正在刷新…');
          setTimeout(() => location.reload(), 600);
        }, { okText: '导入并覆盖' });
      } catch (e) { console.error(e); toast('解析失败：不是有效的 JSON'); }
    };
    reader.readAsText(file);
  }

  // ---------- 云端同步：把个人热度趋势历史(nnHistory)+收藏(nnFavorites)推到 GitHub ----------
  // 数据写在公开仓库 data/nn-user-history.json；token 仅存本机 localStorage，不进入代码。
  const GH = { owner: 'shvanten', repo: 'novel-notes', path: 'data/nn-user-history.json' };
  const TOKEN_KEY = 'nnGhToken';
  let syncMask = null;

  function ghHeaders(token) {
    return { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' };
  }
  function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64dec(b64) { return decodeURIComponent(escape(atob(b64.replace(/\s/g, '')))); }
  function setSyncStatus(msg, isErr) {
    const el = document.getElementById('nn-sync-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('err', !!isErr);
  }
  function openSync() {
    syncMask = document.getElementById('nn-sync-mask');
    if (!syncMask) return;
    const tok = document.getElementById('nn-sync-token');
    if (tok) tok.value = localStorage.getItem(TOKEN_KEY) || '';
    setSyncStatus('');
    syncMask.classList.add('open');
  }
  function closeSync() { if (syncMask) syncMask.classList.remove('open'); }

  async function ghGetFile(token) {
    const r = await fetch('https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + GH.path, { headers: ghHeaders(token) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('读取失败 ' + r.status);
    const j = await r.json();
    return { sha: j.sha || null, data: JSON.parse(b64dec(j.content || '')) };
  }

  async function uploadCloud() {
    const tokEl = document.getElementById('nn-sync-token');
    const retEl = document.getElementById('nn-sync-retain');
    const token = (tokEl && tokEl.value || '').trim();
    if (!token) { setSyncStatus('请先填写 GitHub Token', true); return; }
    localStorage.setItem(TOKEN_KEY, token);
    const retain = parseInt((retEl && retEl.value) || '180', 10);
    try {
      setSyncStatus('正在读取本地趋势…');
      const all = JSON.parse(localStorage.getItem('nnHistory') || '[]');
      const cut = new Date(); cut.setDate(cut.getDate() - retain);
      const keep = Array.isArray(all) ? all.filter((s) => { const d = new Date(s.date); return isNaN(d) || d >= cut; }) : [];
      const payload = {
        _kind: 'nn-user-history',
        updatedAt: new Date().toISOString(),
        retainDays: retain,
        history: keep,
        favorites: JSON.parse(localStorage.getItem('nnFavorites') || '[]')
      };
      setSyncStatus('正在上传到 GitHub（保留近 ' + retain + ' 天）…');
      const cur = await ghGetFile(token); // 拿 sha（若已存在）
      const body = {
        message: 'sync: upload nn user history (retain ' + retain + 'd)',
        content: b64enc(JSON.stringify(payload)),
        committer: { name: 'novel-notes-sync', email: 'sync@local' }
      };
      if (cur && cur.sha) body.sha = cur.sha;
      const r = await fetch('https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + GH.path, {
        method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(body)
      });
      if (!r.ok) { const t = await r.text(); throw new Error('上传失败 ' + r.status + ' ' + t.slice(0, 160)); }
      setSyncStatus('✅ 已上传云端（保留近 ' + retain + ' 天，共 ' + keep.length + ' 天）');
      toast('已上传到 GitHub');
    } catch (e) { console.error(e); setSyncStatus('❌ ' + e.message, true); toast('上传失败'); }
  }

  async function downloadCloud() {
    const tokEl = document.getElementById('nn-sync-token');
    const token = (tokEl && tokEl.value || '').trim();
    if (!token) { setSyncStatus('请先填写 GitHub Token', true); return; }
    localStorage.setItem(TOKEN_KEY, token);
    try {
      setSyncStatus('正在从 GitHub 下载…');
      const cur = await ghGetFile(token);
      if (!cur) throw new Error('云端还没有数据，请先上传');
      const d = cur.data;
      if (!d || !Array.isArray(d.history)) throw new Error('数据格式不对');
      localStorage.setItem('nnHistory', JSON.stringify(d.history));
      localStorage.setItem('nnFavorites', JSON.stringify(Array.isArray(d.favorites) ? d.favorites : []));
      setSyncStatus('✅ 已下载，正在刷新…');
      setTimeout(() => location.reload(), 500);
    } catch (e) { console.error(e); setSyncStatus('❌ ' + e.message, true); toast('下载失败'); }
  }

  // ---------- 渲染拆文功能 ----------
  function renderFeature(f) {
    if (!rootEl || typeof f.render !== 'function') return;
    const content = document.createElement('div');
    content.className = 'feature-inner';
    rootEl.appendChild(content);
    try { f.render(content, { App: window.App, navigate: function () {} }); }
    catch (e) { content.innerHTML = '<p class="error">功能渲染出错：' + escapeHtml(String(e)) + '</p>'; console.error(e); }
  }
  function registerFeature(feature) {
    if (!feature || !feature.id) { console.warn('[App] 功能缺少 id，已忽略', feature); return; }
    features.push(feature);
    if (booted) renderFeature(feature); // 若框架已启动，立即渲染（兼容脚本加载顺序）
  }

  // ---------- 启动 ----------
  function boot() {
    if (booted) return;
    booted = true;
    rootEl = document.getElementById('feature');

    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const expBtn = document.getElementById('btn-export');
    if (expBtn) expBtn.addEventListener('click', exportData);
    const impBtn = document.getElementById('btn-import');
    const fileEl = document.getElementById('import-file');
    if (impBtn && fileEl) {
      impBtn.addEventListener('click', () => fileEl.click());
      fileEl.addEventListener('change', () => {
        if (fileEl.files && fileEl.files[0]) importData(fileEl.files[0]);
        fileEl.value = '';
      });
    }

    // 云同步
    const syncBtn = document.getElementById('btn-sync');
    if (syncBtn) syncBtn.addEventListener('click', openSync);
    const syncClose = document.getElementById('nn-sync-close');
    if (syncClose) syncClose.addEventListener('click', closeSync);
    const syncMaskEl = document.getElementById('nn-sync-mask');
    if (syncMaskEl) syncMaskEl.addEventListener('click', (e) => { if (e.target === syncMaskEl) closeSync(); });
    const syncUp = document.getElementById('nn-sync-up');
    if (syncUp) syncUp.addEventListener('click', uploadCloud);
    const syncDown = document.getElementById('nn-sync-down');
    if (syncDown) syncDown.addEventListener('click', downloadCloud);

    applyTheme(getPreferredTheme());
    features.forEach(renderFeature);
  }

  const api = {
    registerFeature, navigate: function () {}, getFeatures: () => features,
    toast, escapeHtml, formatCount, confirm: confirmDialog, prompt: promptDialog, closeModal,
    exportData, importData,
    icon: function (name, cls) {
      return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="#ic-' + name + '"/></svg>';
    },
  };
  window.App = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // PWA：支持「添加到主屏幕」离线使用
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 注册失败', e)); });
  }
})();
