/**
 * 小说拆文 · 云端同步模块
 * ------------------------------------------------------------
 * 职责：把个人热度趋势历史（nnHistory）+ 收藏（nnFavorites）推到 GitHub 公开仓库
 *       data/nn-user-history.json。token 仅存本机 localStorage，不进入代码。
 * 依赖：window.App（由 app.js 提供 escapeHtml / toast 等基础 API）。
 * 本文件只负责「同步」一件事，框架核心见 app.js，避免两者职责混杂。
 */
(function () {
  'use strict';

  const App = window.App;
  if (!App) { console.error('[sync] 需要先加载 app.js'); return; }

  // ---------- 配置 ----------
  const GH = { owner: 'shvanten', repo: 'novel-notes', path: 'data/nn-user-history.json' };
  const TOKEN_KEY = 'nnGhToken';
  const RETAIN_KEY = 'nnSyncRetain';   // 自动同步使用的保留时长偏好
  const AUTOSYNC_KEY = 'nnAutoSync';   // '0' 表示关闭自动同步，其余均为开启

  let syncMask = null;
  let syncTimer = null;                // 自动静默同步的防抖定时器
  let syncBusy = false;                // 防止并发 PUT 冲突（409）

  // ---------- 偏好读取（带默认值，避免脏数据） ----------
  function getSyncToken() { return (localStorage.getItem(TOKEN_KEY) || '').trim(); }
  function getRetainDays() {
    const v = parseInt(localStorage.getItem(RETAIN_KEY) || '180', 10);
    return [30, 180, 365].indexOf(v) >= 0 ? v : 180;
  }
  function getAutoSync() { return localStorage.getItem(AUTOSYNC_KEY) !== '0'; } // 默认开启

  // ---------- GitHub 请求工具 ----------
  function ghHeaders(token) {
    return { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' };
  }
  // UTF-8 安全的 base64（书名/标签可能含中文）
  function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64dec(b64) { return decodeURIComponent(escape(atob(b64.replace(/\s/g, '')))); }
  function setSyncStatus(msg, isErr) {
    const el = document.getElementById('nn-sync-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('err', !!isErr);
  }

  // ---------- 面板开关 ----------
  function openSync() {
    syncMask = document.getElementById('nn-sync-mask');
    if (!syncMask) return;
    const tok = document.getElementById('nn-sync-token');
    if (tok) tok.value = localStorage.getItem(TOKEN_KEY) || '';
    setSyncStatus('');
    syncMask.classList.add('open');
  }
  function closeSync() { if (syncMask) syncMask.classList.remove('open'); }

  // 读取远端文件；404 视为「还没数据」，返回 null
  async function ghGetFile(token) {
    const r = await fetch('https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + GH.path, { headers: ghHeaders(token) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('读取失败 ' + r.status);
    const j = await r.json();
    return { sha: j.sha || null, data: JSON.parse(b64dec(j.content || '')) };
  }

  // ---------- 核心上传 ----------
  // 给定 token + 保留天数，把本地 nnHistory + 收藏推到 GitHub。
  // silent=true 时完全静默（不打 toast、不写面板状态），仅在 console 记录。
  async function pushCloud(token, retain, silent) {
    if (syncBusy) return;              // 上一个 PUT 还在进行，跳过本次避免 409
    try {
      syncBusy = true;
      const all = JSON.parse(localStorage.getItem('nnHistory') || '[]');
      const cut = new Date(); cut.setDate(cut.getDate() - retain);
      const keep = Array.isArray(all) ? all.filter((s) => { const d = new Date(s.date); return isNaN(d) || d >= cut; }) : [];
      const payload = {
        _kind: 'nn-user-history',
        updatedAt: new Date().toISOString(),
        retainDays: retain,
        history: keep,                       // 个人热度趋势历史（公开资料）
        favorites: JSON.parse(localStorage.getItem('nnFavorites') || '[]')
      };
      const cur = await ghGetFile(token);    // 拿 sha（若文件已存在）
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
      if (silent) console.log('[sync] 自动静默同步完成，已上传 ' + keep.length + ' 天趋势');
      else { setSyncStatus('✅ 已上传云端（保留近 ' + retain + ' 天，共 ' + keep.length + ' 天）'); App.toast('已上传到 GitHub'); }
    } catch (e) {
      console.error('[sync] 同步失败：', e);
      if (!silent) { setSyncStatus('❌ ' + e.message, true); App.toast('上传失败'); }
    } finally {
      syncBusy = false;
    }
  }

  // ---------- 手动上传：读取面板里的 token 与保留时长 ----------
  async function uploadCloud() {
    const tokEl = document.getElementById('nn-sync-token');
    const retEl = document.getElementById('nn-sync-retain');
    const token = (tokEl && tokEl.value || '').trim();
    if (!token) { setSyncStatus('请先填写 GitHub Token', true); return; }
    localStorage.setItem(TOKEN_KEY, token);
    const retain = parseInt((retEl && retEl.value) || '180', 10);
    localStorage.setItem(RETAIN_KEY, String(retain));
    setSyncStatus('正在上传到 GitHub（保留近 ' + retain + ' 天）…');
    await pushCloud(token, retain, false);
  }

  // ---------- 自动静默同步 ----------
  // 每次本地 nnHistory / 收藏变化后调用（见 notes.js 的 nnSaveHist / nnSaveFav）。
  // 仅当已填写 token 且未关闭自动同步时触发；防抖 2.5s，避免高频写入 GitHub。
  function syncAuto() {
    if (!getAutoSync()) return;
    if (!navigator.onLine) return;
    const token = getSyncToken();
    if (!token) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncTimer = null; pushCloud(token, getRetainDays(), true); }, 2500);
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
    } catch (e) { console.error(e); setSyncStatus('❌ ' + e.message, true); App.toast('下载失败'); }
  }

  // ---------- 面板事件绑定（原先散落在 app.js 的 boot 中，现归本模块自管） ----------
  function initSyncPanel() {
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

    // 保留时长：变化时记住偏好（自动同步也会沿用）
    const retainSel = document.getElementById('nn-sync-retain');
    if (retainSel) {
      retainSel.value = String(getRetainDays());
      retainSel.addEventListener('change', () => localStorage.setItem(RETAIN_KEY, retainSel.value));
    }
    // 自动静默同步开关
    const autoEl = document.getElementById('nn-sync-auto');
    if (autoEl) {
      autoEl.checked = getAutoSync();
      autoEl.addEventListener('change', () => localStorage.setItem(AUTOSYNC_KEY, autoEl.checked ? '1' : '0'));
    }
  }

  // 挂到 App 上，供 notes.js 在收藏 / 趋势变化时调用自动同步
  App.syncAuto = syncAuto;
  App.pushCloud = pushCloud;

  // DOM 就绪后再绑定面板（脚本在 body 末尾加载，通常已就绪，这里兜底）
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSyncPanel);
  else initSyncPanel();
})();
