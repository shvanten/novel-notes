/**
 * 小说拆文：
 * - 自己创建「书」(长篇 / 短篇)
 * - 每本书 7 个 tab：标题分析 / 导语分析 / 核心梗分析 / 人设分析 / 付费节点分析 / 摘抄 / 其他分析
 * - 每条 item 支持「文字」+「多页手写」(向量笔触：多色笔 / 荧光笔 / 橡皮擦 / 套索选择 / 撤回还原)
 * - 编辑/添加弹层沾满一页，全屏可写
 * - 顶部 tab：📚 我的拆书 / 📑 全部摘抄 / 💡 全部分析 / 📈 榜单
 */
App.registerFeature({
  id: 'notes',
  title: '拆文',
  desc: '小说拆文便签',
  icon: '📝',
  color: '#b08bbf',
  render(container) {
    const KEY = 'novelnotes.v1';

    // ---------- 7 个 tab 配置 ----------
    const TABS = [
      { key: 'title',    short: '标题',     full: '标题分析',     field: 'titleAnalysis' },
      { key: 'tagline',  short: '导语',     full: '导语分析',     field: 'taglineAnalysis' },
      { key: 'hook',     short: '核心梗',   full: '核心梗分析',   field: 'hookAnalysis' },
      { key: 'chars',    short: '人设',     full: '人设分析',     field: 'charsAnalysis' },
      { key: 'payNode',  short: '付费节点', full: '付费节点分析', field: 'payNodeAnalysis' },
      { key: 'quotes',   short: '摘抄',     full: '摘抄',         field: 'quotes' },
      { key: 'other',    short: '其他',     full: '其他分析',     field: 'otherAnalysis' },
    ];
    const FIELDS = TABS.map((t) => t.field);
    const fieldOf = (k) => (TABS.find((t) => t.key === k) || {}).field;
    const labelOf = (k) => (TABS.find((t) => t.key === k) || {}).full || k;
    const fullList = TABS.map((t) => t.full).join('/');

    // ---------- 存储 ----------
    // book = { id, title, type, emoji,
    //   titleAnalysis, taglineAnalysis, hookAnalysis, charsAnalysis,
    //   payNodeAnalysis, otherAnalysis, quotes: [ {id,text,drawings:[{id,strokes,thumb,img}],createdAt} ],
    //   createdAt }
    function ensureArrays(b) {
      FIELDS.forEach((f) => { b[f] = Array.isArray(b[f]) ? b[f] : []; });
      b.type = (b.type === 'long' || b.type === 'short') ? b.type : 'short';
      b.emoji = b.emoji || '📕';
    }
    // 单条 item：旧 {text,img} -> {text,drawings}
    function migrateItem(it) {
      if (!it || typeof it !== 'object') return { id: 'i' + Math.random().toString(36).slice(2, 8), text: '', drawings: [], createdAt: Date.now() };
      if ('img' in it && !('drawings' in it)) {
        it.drawings = it.img ? [{ id: 'd' + Math.random().toString(36).slice(2, 8), strokes: [], img: it.img, thumb: it.img }] : [];
        delete it.img;
      }
      if (!Array.isArray(it.drawings)) it.drawings = [];
      if (!it.text) it.text = '';
      if (!it.id) it.id = 'i' + Math.random().toString(36).slice(2, 8);
      if (!it.createdAt) it.createdAt = Date.now();
      it.drawings.forEach((d) => {
        if (!Array.isArray(d.strokes)) d.strokes = [];
        if (!d.id) d.id = 'd' + Math.random().toString(36).slice(2, 8);
        d.strokes.forEach((s) => { if (!s.tool) s.tool = 'pen'; if (!s.color) s.color = '#274027'; if (!s.width) s.width = 3; });
      });
      return it;
    }
    function migrate(old) {
      if (!old || typeof old !== 'object') return { books: [] };
      if (Array.isArray(old.books)) {
        old.books.forEach((b) => {
          const wrap = (s) => s && String(s).trim()
            ? [{ id: 'm' + Math.random().toString(36).slice(2, 8), text: String(s), drawings: [], createdAt: Date.now() }]
            : [];
          b.titleAnalysis   = b.titleAnalysis   || [];
          b.taglineAnalysis = b.taglineAnalysis || wrap(b.tagline);
          b.hookAnalysis    = b.hookAnalysis    || wrap(b.hook);
          b.charsAnalysis   = b.charsAnalysis   || wrap(b.chars);
          b.payNodeAnalysis = b.payNodeAnalysis || [];
          b.otherAnalysis   = b.otherAnalysis   || (Array.isArray(b.analyses)
            ? b.analyses.map((a) => ({ id: a.id || ('m' + Math.random().toString(36).slice(2, 8)), text: a.text || '', drawings: [], createdAt: a.createdAt || Date.now() }))
            : []);
          b.quotes          = Array.isArray(b.quotes) ? b.quotes : [];
          FIELDS.forEach((f) => { b[f] = (b[f] || []).map(migrateItem); });
          delete b.tagline; delete b.hook; delete b.chars; delete b.analyses;
          ensureArrays(b);
        });
        return old;
      }
      // 极旧的 {cats,types,notes} 结构
      const oldCats = Array.isArray(old.cats) ? old.cats : [];
      const oldNotes = Array.isArray(old.notes) ? old.notes : [];
      const now = Date.now();
      const byCat = {};
      oldNotes.forEach((n) => { if (n.catId) (byCat[n.catId] = byCat[n.catId] || []).push(n); });
      const books = oldCats.map((c) => {
        const name = String(c.name || '').replace(/^[《]/, '').replace(/[》]$/, '');
        const qs = (byCat[c.id] || []).map((n) => ({
          id: n.id || ('q' + Math.random().toString(36).slice(2, 8)),
          text: n.text || '', drawings: [], createdAt: n.createdAt || now,
        }));
        const empty = { titleAnalysis: [], taglineAnalysis: [], hookAnalysis: [], charsAnalysis: [], payNodeAnalysis: [], otherAnalysis: [] };
        return Object.assign({
          id: 'b' + Math.random().toString(36).slice(2, 10),
          title: name || '未命名', type: 'short', emoji: '📕',
          quotes: qs, createdAt: now,
        }, empty);
      });
      const orphans = oldNotes.filter((n) => !n.catId);
      if (orphans.length) {
        const empty = { titleAnalysis: [], taglineAnalysis: [], hookAnalysis: [], charsAnalysis: [], payNodeAnalysis: [], otherAnalysis: [] };
        books.push(Object.assign({
          id: 'b' + Math.random().toString(36).slice(2, 10),
          title: '随手记录', type: 'short', emoji: '📓',
          quotes: orphans.map((n) => ({ id: n.id || ('q' + Math.random().toString(36).slice(2, 8)), text: n.text || '', drawings: [], createdAt: n.createdAt || now })),
          createdAt: now,
        }, empty));
      }
      return { books };
    }
    function load() {
      try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) return migrate(d); } catch (e) {}
      return { books: [] };
    }
    function save() {
      localStorage.setItem(KEY, JSON.stringify(data));
    }
    let data = load();

    const uid = (p) => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    function getBook(id) { return data.books.find((b) => b.id === id); }

    // ---------- 手写笔色 ----------
    const PEN_COLORS = ['#274027', '#1f3a8a', '#b82929', '#c47a16', '#2f7d32', '#8a2b8a', '#222222', '#0d6b6b'];

    // ---------- 状态 ----------
    let view = 'books';           // books | detail | rank | summary | allQuotes | allAnalyses
    let currentBookId = null;
    let suppressPaint = false;
    let activeTabKey = 'title';   // 记录最后一次停留的分页，重绘后恢复，避免保存后跳回标题
    let activeRankKey = null;     // 当前选中的榜单（在 summary 视图下用于顶部导航）
    let summaryData = null;       // 标签分析缓存（rankData 变时重建）

    // ---------- 骨架：左侧导航 + 右侧详情 ----------
    container.innerHTML =
      '<div class="nn">' +
      '  <button class="nn-menu-btn" id="nn-menu" type="button" aria-label="导航">☰</button>' +
      '  <div class="nn-mask-side" id="nn-mask-side"></div>' +
      '  <div class="nn-split">' +
      '    <aside class="nn-side" id="nn-side">' +
      '      <div class="nn-side-head">小说拆文</div>' +
      '      <div class="nn-side-group">' +
      '        <button class="nn-side-btn on" data-view="books" type="button">' +
      '          <span class="nn-side-icon">' + App.icon('book') + '</span><span>我的拆书</span>' +
      '        </button>' +
      '        <div class="nn-side-list" id="nn-side-books"></div>' +
      '        <button class="nn-side-new" id="nn-side-new" type="button">＋ 新建书</button>' +
      '      </div>' +
      '      <div class="nn-side-group">' +
      '        <button class="nn-side-btn" data-view="rank" type="button">' +
      '          <span class="nn-side-icon">' + App.icon('chart') + '</span><span>榜单</span>' +
      '        </button>' +
      '      </div>' +
      '      <div class="nn-side-sep"></div>' +
      '      <button class="nn-side-btn flat" data-view="allQuotes" type="button">' +
      '        <span class="nn-side-icon">' + App.icon('doc') + '</span><span>全部摘抄</span>' +
      '      </button>' +
      '      <button class="nn-side-btn flat" data-view="allAnalyses" type="button">' +
      '        <span class="nn-side-icon">' + App.icon('bulb') + '</span><span>全部分析</span>' +
      '      </button>' +
      '    </aside>' +
      '    <main class="nn-main" id="nn-main"></main>' +
      '  </div>' +
      '  <button class="nn-fab" id="nn-fab" type="button" aria-label="新建">＋</button>' +
      '</div>';

    const mainEl = container.querySelector('#nn-main');
    const sideEl = container.querySelector('#nn-side');
    const sideBooksEl = container.querySelector('#nn-side-books');
    const fabEl = container.querySelector('#nn-fab');
    const menuBtn = container.querySelector('#nn-menu');
    const maskSide = container.querySelector('#nn-mask-side');

    // 侧边栏点击：切换视图
    container.querySelectorAll('.nn-side-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const v = b.dataset.view;
        if (!v) return;
        if (v !== 'detail') currentBookId = null;
        if (v !== 'rank' && v !== 'summary') activeRankKey = null;
        view = v;
        paintSide();
        paint();
        // 移动端点击后收起侧边栏
        if (window.innerWidth < 768) sideEl.classList.remove('open');
      });
    });
    container.querySelector('#nn-side-new').addEventListener('click', (e) => {
      e.stopPropagation();
      openBookEditor(null);
    });
    fabEl.addEventListener('click', () => openBookEditor(null));
    menuBtn.addEventListener('click', () => {
      sideEl.classList.toggle('open');
    });
    maskSide.addEventListener('click', () => sideEl.classList.remove('open'));

    // 侧边栏高亮 + 书本列表（侧栏始终展示所有书）
    function paintSide() {
      container.querySelectorAll('.nn-side-btn').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
      const showBooks = (view === 'books' || view === 'detail');
      sideBooksEl.style.display = showBooks ? '' : 'none';
      container.querySelector('#nn-side-new').style.display = showBooks ? '' : 'none';
      sideBooksEl.innerHTML = data.books.map((b) => {
        const on = (view === 'detail' && b.id === currentBookId) ? ' on' : '';
        return '<button class="nn-side-book' + on + '" data-bid="' + b.id + '" type="button">' +
          '<span class="nn-side-book-e">' + (b.emoji || '📕') + '</span>' +
          '<span class="nn-side-book-t">' + App.escapeHtml(b.title) + '</span>' +
          '</button>';
      }).join('');
      sideBooksEl.querySelectorAll('.nn-side-book').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          currentBookId = b.dataset.bid;
          activeTabKey = 'title';
          view = 'detail';
          paintSide();
          paint();
          if (window.innerWidth < 768) sideEl.classList.remove('open');
        });
      });
    }

    // ---------- 我的书（书架） ----------
    function paintBooks() {
      const books = data.books;
      const cards = books.length
        ? books.map((b) => {
            const tint = b.type === 'long' ? 'long' : 'short';
            const total = TABS.reduce((s, t) => s + (b[t.field] || []).length, 0);
            return '<div class="nn-book" data-bid="' + b.id + '">' +
                    '  <div class="nn-book-cover">' +
                    '    <div class="nn-book-spine"></div>' +
                    '    <div class="nn-book-front">' +
                    '      <div class="nn-book-title">' + App.escapeHtml(b.title) + '</div>' +
                    '      <div class="nn-book-type nn-book-type-' + tint + '">' + (tint === 'long' ? App.icon('book') + ' 长篇' : App.icon('note') + ' 短篇') + '</div>' +
                    '    </div>' +
                    '    <div class="nn-book-back"></div>' +
                    '  </div>' +
                    '  <div class="nn-book-meta">' +
                    '    <span>共 ' + total + ' 条</span>' +
                    '  </div>' +
                    '</div>';
          }).join('')
        : '<div class="nn-shelf-empty">' +
          '  <div class="nn-shelf-emoji">' + App.icon('book') + '</div>' +
          '  <p class="muted">开拆吧！</p>' +
          '</div>';
      mainEl.innerHTML = '<div class="nn-shelf">' + cards + '</div>';

      mainEl.querySelectorAll('.nn-book').forEach((card) => {
          card.addEventListener('click', () => {
            if (card.classList.contains('opening')) return;
            card.classList.add('opening');
            const bid = card.dataset.bid;
            setTimeout(() => {
              view = 'detail';
              currentBookId = bid;
              activeTabKey = 'title';
              paint();
            }, 620);
          });
      });
    }

    // ---------- 书籍详情：7 tab 横滑 ----------
    function paintDetail() {
      const b = getBook(currentBookId);
      if (!b) { view = 'books'; paintBooks(); return; }
      const tint = b.type === 'long' ? 'long' : 'short';
      const total = TABS.reduce((s, t) => s + (b[t.field] || []).length, 0);

      const pages = TABS.map((t, i) => {
        const arr = b[t.field] || [];
        const list = arr.length
          ? arr.map((it) => itemRow(t.key, it, b.id)).join('')
          : '<p class="muted nn-empty-inline">还没有内容，点「＋ 添加」开始记录。</p>';
        return '<div class="nn-pp" data-pp="' + t.key + '">' +
               '  <div class="nn-pp-section-head">' +
               '    <span>' + App.escapeHtml(t.full) + '</span>' +
               '    <button class="btn sm" data-add="' + t.key + '" type="button">＋ 添加</button>' +
               '  </div>' +
               '  <div class="nn-section-list">' + list + '</div>' +
               '</div>';
      }).join('');

      const tabsBtns = TABS.map((t, i) =>
        '<button class="nn-page-tab' + (i === 0 ? ' on' : '') + '" data-tab="' + t.key + '" type="button">' + App.escapeHtml(t.short) + '</button>'
      ).join('');
      const dots = TABS.map((t, i) =>
        '<span class="nn-page-pager-dot' + (i === 0 ? ' on' : '') + '" data-go="' + i + '"></span>'
      ).join('');

      mainEl.innerHTML =
        '<div class="nn-page">' +
        '  <div class="nn-page-bar">' +
        '    <button class="btn ghost sm nn-back-btn" id="nn-back" type="button">← 书架</button>' +
        '    <span class="nn-pp-book-tag nn-book-type-' + tint + '">' + (tint === 'long' ? App.icon('book') + ' 长篇' : App.icon('note') + ' 短篇') + '</span>' +
        '    <div class="nn-book-title-mini">' + App.escapeHtml(b.title) + '</div>' +
        '    <button class="btn sm ghost" id="nn-edit-book" type="button">编辑</button>' +
        '    <button class="btn sm danger" id="nn-del-book" type="button">删除</button>' +
        '  </div>' +
        '  <div class="nn-book-heat">' +
        '    <div class="nn-book-heat-head">' +
        '      <span class="nn-book-heat-title">' + App.icon('chart') + ' 排名趋势</span>' +
        '      ' + nnSegHtml('nn-book-heat-seg', nnBookPeriod) +
        '      <button class="nn-fav-star' + (nnIsKept(b.title) ? ' on' : '') + '" data-fav-star="' + App.escapeHtml(b.title) + '" type="button" title="收藏后即使下榜也永久保留该书的历史数据">' +
                 App.icon('star') + '<span class="nn-fav-star-t">' + (nnIsKept(b.title) ? '已收藏' : '收藏') + '</span></button>' +
        '    </div>' +
        '    <div class="nn-line-wrap" id="nn-book-line"></div>' +
        '  </div>' +
        '  <div class="nn-page-tabs" id="nn-page-tabs">' + tabsBtns + '</div>' +
        '  <div class="nn-pages" id="nn-pages">' + pages + '</div>' +
        '  <div class="nn-page-pager" id="nn-page-pager">' + dots + '</div>' +
        '</div>';

      // 热度趋势卡：周期切换 + 收藏（收藏后下榜也保留历史）
      function paintBookTrend() {
        const el = mainEl.querySelector('#nn-book-line');
        if (el) el.innerHTML = nnLineChart(nnBookSeries(b.title, nnBookPeriod), { invert: true, rankMax: 9, fmt: (v) => '排名 ' + v });
      }
      nnBindSeg(mainEl, 'nn-book-heat-seg', (p) => { nnBookPeriod = p; paintBookTrend(); });
      const favBtn = mainEl.querySelector('[data-fav-star]');
      if (favBtn) {
        favBtn.addEventListener('click', () => {
          const t = favBtn.dataset.favStar;
          const i = nnFavorites.indexOf(t);
          if (i >= 0) nnFavorites.splice(i, 1); else nnFavorites.push(t);
          nnSaveFav();
          const on = favBtn.classList.toggle('on');
          const label = favBtn.querySelector('.nn-fav-star-t');
          if (label) label.textContent = on ? '已收藏' : '收藏';
          App.toast(on ? '已收藏，历史数据将永久保留' : '已取消收藏');
        });
      }
      paintBookTrend();

      const titlePage = mainEl.querySelector('.nn-pp[data-pp="title"]');
      if (titlePage) {
        titlePage.innerHTML =
          '<div class="nn-pp-title-card">' +
          '  <h2 class="nn-pp-book-title">' + App.escapeHtml(b.title) + '</h2>' +
          '  <span class="nn-book-type nn-book-type-' + tint + '">' + (tint === 'long' ? App.icon('book') + ' 长篇' : App.icon('note') + ' 短篇') + '</span>' +
          '  <p class="muted nn-pp-meta">共 ' + total + ' 条内容 · 7 个维度</p>' +
          '  <div class="nn-pp-section-head" style="margin-top:14px">' +
          '    <span>标题分析</span>' +
          '    <button class="btn sm" data-add="title" type="button">＋ 添加</button>' +
          '  </div>' +
          '  <div class="nn-section-list">' +
          ((b.titleAnalysis || []).length
            ? b.titleAnalysis.map((it) => itemRow('title', it, b.id)).join('')
            : '<p class="muted nn-empty-inline">还没有标题分析，点「＋ 添加」开始。</p>') +
          '  </div>' +
          '</div>';
      }

      mainEl.querySelector('#nn-back').addEventListener('click', () => {
        view = 'books'; currentBookId = null;
        paintSide(); paint();
      });
      mainEl.querySelector('#nn-edit-book').addEventListener('click', () => openBookEditor(b));
      mainEl.querySelector('#nn-del-book').addEventListener('click', () => {
        const sum = TABS.map((t) => (b[t.field] || []).length + ' ' + t.short).join(' · ');
        App.confirm('删除这本书', '《' + b.title + '》\n' + sum + '\n\n删除后无法恢复，继续？', () => {
          data.books = data.books.filter((x) => x.id !== b.id);
          save();
          view = 'books'; currentBookId = null;
          paintSide(); paint();
          App.toast('已删除');
        });
      });

      const pagesEl = mainEl.querySelector('#nn-pages');
      const tabBtns = mainEl.querySelectorAll('.nn-page-tab');
      const pagerDots = mainEl.querySelectorAll('.nn-page-pager-dot');
      function goTo(i) {
        const w = pagesEl.clientWidth || 1;
        pagesEl.scrollTo({ left: i * w, behavior: 'smooth' });
      }
      pagesEl.addEventListener('scroll', () => {
        const i = Math.round(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth));
        if (TABS[i]) activeTabKey = TABS[i].key;
        tabBtns.forEach((bb, idx) => bb.classList.toggle('on', idx === i));
        pagerDots.forEach((d, idx) => d.classList.toggle('on', idx === i));
      });
      tabBtns.forEach((bb, i) => bb.addEventListener('click', () => { activeTabKey = TABS[i].key; goTo(i); }));
      pagerDots.forEach((d) => d.addEventListener('click', () => { const i = +d.dataset.go; if (TABS[i]) activeTabKey = TABS[i].key; goTo(i); }));

      mainEl.querySelectorAll('[data-add]').forEach((btn) => {
        btn.addEventListener('click', () => openItemEditor(b, btn.dataset.add, null, paintDetail));
      });
      mainEl.querySelectorAll('[data-iedit]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [k, iid] = btn.dataset.iedit.split('|');
          const field = fieldOf(k);
          const it = (b[field] || []).find((x) => x.id === iid);
          if (it) openItemEditor(b, k, it, paintDetail);
        });
      });
      mainEl.querySelectorAll('[data-idel]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [k, iid] = btn.dataset.idel.split('|');
          const field = fieldOf(k);
          const name = labelOf(k);
          App.confirm('删除' + name, '确认删除这条' + name + '？', () => {
            b[field] = (b[field] || []).filter((x) => x.id !== iid);
            save(); paintDetail();
            App.toast('已删除');
          });
        });
      });
      bindViewers();

      // 重绘后恢复到上次停留的分页（保存/删除操作后不再跳回标题）
      const restoreIdx = Math.max(0, TABS.findIndex((t) => t.key === activeTabKey));
      if (restoreIdx > 0) {
        setTimeout(() => {
          const w = pagesEl.clientWidth || 1;
          pagesEl.scrollLeft = restoreIdx * w;
          tabBtns.forEach((bb, idx) => bb.classList.toggle('on', idx === restoreIdx));
          pagerDots.forEach((d, idx) => d.classList.toggle('on', idx === restoreIdx));
        }, 0);
      }
    }

    // 单条 item 渲染：支持 文字 / 多页手写 / 两者
    function itemRow(key, it, bookId) {
      const textHtml = it.text
        ? '<div class="nn-item-text">' + App.escapeHtml(it.text) + '</div>' : '';
      const drawHtml = drawThumbsHtml(it, key, bookId);
      const hasText = !!it.text, hasDraw = (it.drawings || []).length > 0;
      const tag = (hasText && hasDraw) ? '图文' : (hasDraw ? '手写' : '文字');
      return '<div class="nn-item">' +
              '  <div class="nn-item-meta">' +
              '    <span class="nn-item-tag">' + tag + '</span>' +
              '    <span class="muted">' + fmtDate(it.createdAt) + '</span>' +
              '  </div>' +
                drawHtml + textHtml +
              '  <div class="nn-item-ops">' +
              '    <button class="nn-op" data-iedit="' + key + '|' + it.id + '" type="button" aria-label="编辑">✏️</button>' +
              '    <button class="nn-op" data-idel="' + key + '|' + it.id + '" type="button" aria-label="删除">✕</button>' +
              '  </div>' +
              '</div>';
    }

    // 手写缩略图区
    function drawThumbsHtml(it, key, bookId) {
      const draws = it.drawings || [];
      if (!draws.length) return '';
      return '<div class="nn-item-draws">' + draws.map((d, i) => {
        const src = d.thumb || d.img || '';
        return '<div class="nn-draw-thumb" data-vd="' + key + '|' + bookId + '|' + it.id + '|' + i + '">' +
          (src ? '<img src="' + src + '" alt="手写" />' : '<div class="nn-draw-empty">✍️</div>') +
          '</div>';
      }).join('') + '</div>';
    }

    // 绑定所有「查看手写大图」
    function bindViewers() {
      mainEl.querySelectorAll('[data-vd]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const [k, bid, iid, idx] = el.dataset.vd.split('|');
          openDrawingViewer(k, bid, iid, +idx);
        });
      });
    }

    // ---------- 手写大图查看（向量渲染） ----------
    function openDrawingViewer(key, bookId, itemId, idx) {
      const b = getBook(bookId); if (!b) return;
      const field = fieldOf(key);
      const it = (b[field] || []).find((x) => x.id === itemId); if (!it) return;
      const d = (it.drawings || [])[idx]; if (!d) return;
      const wrap = document.createElement('div');
      wrap.className = 'nn-mask';
      wrap.innerHTML =
        '<div class="nn-img-viewer">' +
        '  <button class="nn-img-close" type="button">✕</button>' +
        '  <div class="nn-viewer-canvas-wrap"><canvas id="nn-viewer-canvas"></canvas></div>' +
        '</div>';
      document.body.appendChild(wrap);
      const cv = wrap.querySelector('#nn-viewer-canvas');
      function size() {
        const r = wrap.querySelector('.nn-viewer-canvas-wrap').getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        cv.width = Math.max(1, Math.floor(r.width * dpr));
        cv.height = Math.max(1, Math.floor(r.height * dpr));
        cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
        const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderStrokesTo(c, r.width, r.height, d, () => {});
      }
      setTimeout(size, 30);
      window.addEventListener('resize', size);
      function close() { window.removeEventListener('resize', size); wrap.remove(); }
      wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.matches('.nn-img-close')) close(); });
    }

    // 把一个 drawing（strokes/img）渲染到任意 2d 上下文（逻辑尺寸 W,H）
    const imgCache = {};
    function getImg(src, cb) {
      if (imgCache[src]) { if (imgCache[src].complete) cb(imgCache[src]); return; }
      const im = new Image();
      im.onload = () => { imgCache[src] = im; cb(im); };
      im.src = src;
    }
    function renderStrokesTo(ctx, W, H, d, onImg) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fdfbf5'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      function drawStrokes() {
        (d.strokes || []).forEach((s) => {
          if (!s.pts || s.pts.length === 0) return;
          ctx.beginPath();
          ctx.strokeStyle = s.color || '#274027';
          ctx.lineWidth = s.width || 3;
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.globalAlpha = s.tool === 'marker' ? 0.42 : 1;
          ctx.moveTo(s.pts[0][0], s.pts[0][1]);
          for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0], s.pts[i][1]);
          ctx.stroke();
          ctx.globalAlpha = 1;
        });
      }
      if (d.img) {
        getImg(d.img, (im) => {
          const ratio = Math.min(W / im.width, H / im.height);
          const w = im.width * ratio, h = im.height * ratio;
          ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
          drawStrokes();
          if (onImg) onImg();
        });
      } else {
        drawStrokes();
      }
    }

    // ---------- 添加/编辑：文字 + 多页手写（向量笔触） ----------
    function clonePages(arr) {
      return (arr || []).map((p) => ({
        id: p.id || uid('d'),
        strokes: (p.strokes || []).map((s) => ({
          pts: (s.pts || []).map((pt) => [pt[0], pt[1]]),
          color: s.color || '#274027',
          width: s.width || 3,
          tool: s.tool || 'pen',
        })),
        thumb: p.thumb || '',
        img: p.img || '',
        undo: [], redo: [],
      }));
    }

    function openItemEditor(book, key, existing, onDone) {
      const isNew = !existing;
      const field = fieldOf(key);
      const tab = TABS.find((t) => t.key === key) || {};
      const fullName = tab.full || key;
      const hint = key === 'quotes' ? '抄录精彩的句子、好词好句……' : '拆解这一维度的写作要点、技巧、节奏……';

      let pages = clonePages(existing ? existing.drawings : []);
      if (!pages.length) pages.push({ id: uid('d'), strokes: [], thumb: '', img: '', undo: [], redo: [] });
      let curText = existing ? (existing.text || '') : '';
      let mode = curText || pages[0].strokes.length ? (curText ? 'text' : 'draw') : 'text';

      openDrawEditor({
        title: (isNew ? '添加' : '编辑') + '·' + fullName,
        hint: hint,
        text: curText,
        pages: pages,
        onSave: (text, finalPages) => {
          const t = (text || '').trim();
          // 存盘时去掉 undo/redo 历史，减小体积、避免 localStorage 超额
          const kept = finalPages
            .filter((p) => (p.strokes && p.strokes.length) || p.img)
            .map((p) => ({ id: p.id, strokes: p.strokes || [], thumb: p.thumb || '', img: p.img || '' }));
          if (!t && !kept.length) { App.toast('文字和手写不能都为空'); return; }
          if (isNew) {
            (book[field] = book[field] || []).push({ id: uid(key), text: t, drawings: kept, createdAt: Date.now() });
          } else {
            existing.text = t; existing.drawings = kept;
          }
          try { save(); }
          catch (e) { console.error(e); App.toast('本地保存失败：存储空间可能已满，请删掉一些手写图片'); }
          (onDone || paintDetail)();
          App.toast(isNew ? '已添加' : '已更新');
        },
      });
    }

    // ---------- 全屏手写编辑器（多色 / 荧光 / 橡皮 / 套索 / 撤回还原 / 多页） ----------
    function openDrawEditor({ title, hint, text, pages, onSave }) {
      const wrap = document.createElement('div');
      wrap.className = 'nn-mask';
      wrap.innerHTML =
        '<div class="nn-sheet nn-sheet-full">' +
        '  <div class="nn-sheet-bar">' +
        '    <button class="btn ghost sm" data-close type="button">取消</button>' +
        '    <div class="nn-sheet-title">' + App.escapeHtml(title) + '</div>' +
        '    <button class="btn sm" id="fe-save" type="button">保存</button>' +
        '  </div>' +
        '  <div class="nn-edit-tabs">' +
        '    <button class="nn-edit-tab on" data-mode="text" type="button">⌨️ 文字</button>' +
        '    <button class="nn-edit-tab" data-mode="draw" type="button">✍️ 手写</button>' +
        '  </div>' +
        '  <div class="nn-edit-area">' +
        '    <div class="nn-edit-pane nn-edit-text" data-pane="text">' +
        (hint ? '<p class="muted nn-edit-hint">' + App.escapeHtml(hint) + '</p>' : '') +
        '      <textarea id="fe-text" placeholder="可留空"></textarea>' +
        '    </div>' +
        '    <div class="nn-edit-pane nn-edit-draw" data-pane="draw" hidden>' +
        '      <div class="hw">' +
        '        <div class="hw-row hw-tools">' +
        '          <button class="hw-tool on" data-tool="pen" type="button">🖊 笔</button>' +
        '          <button class="hw-tool" data-tool="marker" type="button">🖍 荧光</button>' +
        '          <button class="hw-tool" data-tool="eraser" type="button">🧽 橡皮</button>' +
        '          <button class="hw-tool" data-tool="lasso" type="button">⭕ 套索</button>' +
        '          <button class="hw-tool" id="hw-undo" type="button">↶ 撤回</button>' +
        '          <button class="hw-tool" id="hw-redo" type="button">↷ 还原</button>' +
        '        </div>' +
        '        <div class="hw-row hw-colors" id="hw-colors"></div>' +
        '        <div class="hw-row hw-opt">' +
        '          <label class="muted">粗细</label>' +
        '          <input type="range" id="hw-width" min="1" max="14" value="3" />' +
        '          <span id="hw-width-v" class="muted">3</span>' +
        '          <button class="hw-tool ghost" id="hw-clear" type="button">🗑 清空本页</button>' +
        '          <button class="hw-tool danger" id="hw-del-sel" type="button" hidden>🗑 删除选中</button>' +
        '          <span id="hw-tip" class="muted"></span>' +
        '        </div>' +
        '        <div class="nn-draw-wrap"><canvas id="fe-canvas"></canvas></div>' +
        '        <div class="hw-pages" id="hw-pages"></div>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(wrap);

      const ta = wrap.querySelector('#fe-text');
      ta.value = text || '';
      const canvas = wrap.querySelector('#fe-canvas');
      const ctx = canvas.getContext('2d');
      const colorsEl = wrap.querySelector('#hw-colors');
      const widthEl = wrap.querySelector('#hw-width');
      const widthV = wrap.querySelector('#hw-width-v');
      const tipEl = wrap.querySelector('#hw-tip');
      const delSelBtn = wrap.querySelector('#hw-del-sel');

      let tool = 'pen';
      let curColor = PEN_COLORS[0];
      let curWidth = 3;
      let pageIndex = 0;
      let selected = new Set();
      let lassoPts = [];

      // 颜色色板
      colorsEl.innerHTML = PEN_COLORS.map((c, i) =>
        '<button class="hw-color' + (i === 0 ? ' on' : '') + '" data-c="' + c + '" type="button" style="background:' + c + '"></button>'
      ).join('');
      colorsEl.querySelectorAll('.hw-color').forEach((b) => {
        b.addEventListener('click', () => {
          curColor = b.dataset.c;
          colorsEl.querySelectorAll('.hw-color').forEach((x) => x.classList.toggle('on', x === b));
        });
      });

      function page() { return pages[pageIndex]; }
      function snapshot() {
        return page().strokes.map((s) => ({ pts: s.pts.map((p) => [p[0], p[1]]), color: s.color, width: s.width, tool: s.tool }));
      }
      function commit(prev) { page().undo.push(prev); page().redo = []; updateUndoRedo(); }
      function applyStrokes(arr) { page().strokes = arr; selected.clear(); hideDelSel(); redraw(); updateUndoRedo(); }
      function updateUndoRedo() {
        wrap.querySelector('#hw-undo').disabled = page().undo.length === 0;
        wrap.querySelector('#hw-redo').disabled = page().redo.length === 0;
      }
      function showDelSel() { delSelBtn.hidden = selected.size === 0; tipEl.textContent = selected.size ? ('已选 ' + selected.size + ' 笔 · 拖动可移动') : ''; }
      function hideDelSel() { delSelBtn.hidden = true; tipEl.textContent = ''; }

      // ---------- 画布尺寸 ----------
      function resizeCanvas() {
        const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.floor(r.width * dpr));
        canvas.height = Math.max(1, Math.floor(r.height * dpr));
        canvas.style.width = r.width + 'px';
        canvas.style.height = r.height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        redraw();
      }

      function drawBgGrid() {
        const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
        ctx.clearRect(0, 0, r.width, r.height);
        ctx.fillStyle = '#fdfbf5'; ctx.fillRect(0, 0, r.width, r.height);
        ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 1;
        for (let x = 0; x < r.width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, r.height); ctx.stroke(); }
        for (let y = 0; y < r.height; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(r.width, y); ctx.stroke(); }
      }
      function drawImgFit(im) {
        const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
        const ratio = Math.min(r.width / im.width, r.height / im.height);
        const w = im.width * ratio, h = im.height * ratio;
        ctx.drawImage(im, (r.width - w) / 2, (r.height - h) / 2, w, h);
      }
      // 平滑路径：把采样点之间用二次贝塞尔曲线串起来（中点为锚点，相邻点为控制点）
      function strokeSmooth(s) {
        const pts = s.pts;
        if (!pts || pts.length === 0) return;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        if (pts.length === 1) { ctx.stroke(); return; }
        if (pts.length === 2) { ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke(); return; }
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last[0], last[1]);
        ctx.stroke();
      }
      function drawStrokes() {
        (page().strokes || []).forEach((s, idx) => {
          if (!s.pts || s.pts.length === 0) return;
          ctx.strokeStyle = s.color || '#274027';
          ctx.lineWidth = s.width || 3;
          ctx.globalAlpha = s.tool === 'marker' ? 0.42 : 1;
          strokeSmooth(s);
          ctx.globalAlpha = 1;
          if (selected.has(idx)) {
            const bb = bbox(s);
            ctx.save();
            ctx.strokeStyle = '#e0533a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
            ctx.strokeRect(bb.x - 4, bb.y - 4, bb.w + 8, bb.h + 8);
            ctx.restore();
          }
        });
      }
      function drawLasso() {
        if (lassoPts.length < 2) return;
        ctx.save();
        ctx.strokeStyle = '#6a7ec4'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(lassoPts[0][0], lassoPts[0][1]);
        for (let i = 1; i < lassoPts.length; i++) ctx.lineTo(lassoPts[i][0], lassoPts[i][1]);
        ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
      function redraw() {
        drawBgGrid();
        const p = page();
        if (p.img) {
          getImg(p.img, (im) => { drawImgFit(im); drawStrokes(); drawLasso(); });
        }
        drawStrokes();
        drawLasso();
      }

      // ---------- 几何工具 ----------
      function bbox(s) {
        let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
        s.pts.forEach((p) => { if (p[0] < minx) minx = p[0]; if (p[1] < miny) miny = p[1]; if (p[0] > maxx) maxx = p[0]; if (p[1] > maxy) maxy = p[1]; });
        return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
      }
      function distToSeg(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const l2 = dx * dx + dy * dy;
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      }
      function pointInPoly(x, y, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
          if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
      }
      function strokeInPoly(s, poly) { return s.pts.some((p) => pointInPoly(p[0], p[1], poly)); }
      function pointInStrokeBBox(x, y, s, m) {
        const b = bbox(s);
        return x >= b.x - m && x <= b.x + b.w + m && y >= b.y - m && y <= b.y + b.h + m;
      }

      // ---------- 画笔事件 ----------
      // MIN_STEP：相邻采样点的最小距离（像素）。小于这个距离的点直接丢弃，避免堆点数。
      // STEP：插值步长。距离 > STEP 时自动插入中间点，确保曲线丝滑。
      const MIN_STEP = 2;
      const STEP = 3.5;
      let drawing = false, lastX = 0, lastY = 0, curStroke = null, drawPrev = null;
      // drawnTo：画布上"已经画到的位置"。用它和最新点画一段贝塞尔，实时绘制也不会出现折痕。
      let drawnTo = null;
      let erasing = false, erasingChanged = false, erasePrev = null;
      let lassoing = false;
      let dragging = false, dragPrev = null, dragMoved = false, dragPrevSnap = null;

      function pos(e) {
        const r = canvas.getBoundingClientRect();
        const t = (e.touches && e.touches[0]) || e;
        return { x: t.clientX - r.left, y: t.clientY - r.top };
      }

      // 距离太近直接丢弃 + 距离太远自动插值
      function pushSmoothPoint(stroke, x, y) {
        const last = stroke.pts[stroke.pts.length - 1];
        if (last) {
          const dx = x - last[0], dy = y - last[1];
          const d = Math.hypot(dx, dy);
          if (d < MIN_STEP) return false;
          const steps = Math.max(1, Math.ceil(d / STEP));
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            stroke.pts.push([last[0] + dx * t, last[1] + dy * t]);
          }
        } else {
          stroke.pts.push([x, y]);
        }
        return true;
      }

      function start(e) {
        e.preventDefault();
        const p = pos(e);
        if (tool === 'pen' || tool === 'marker') {
          drawing = true; lastX = p.x; lastY = p.y; drawPrev = snapshot();
          const w = tool === 'marker' ? Math.max(8, curWidth * 3) : curWidth;
          curStroke = { pts: [[p.x, p.y]], color: curColor, width: w, tool: tool };
          drawnTo = [p.x, p.y];
        } else if (tool === 'eraser') {
          erasing = true; erasingChanged = false; erasePrev = snapshot();
          lastX = p.x; lastY = p.y;
        } else if (tool === 'lasso') {
          lassoing = true; lassoPts = [[p.x, p.y]];
        } else if (tool === 'move') {
          // 点中已选中的笔画 -> 拖动
          let hit = -1;
          page().strokes.forEach((s, i) => { if (selected.has(i) && pointInStrokeBBox(p.x, p.y, s, 6)) hit = i; });
          if (hit >= 0) {
            dragging = true; dragMoved = false; dragPrev = p; dragPrevSnap = snapshot();
          } else {
            // 点空白处 -> 取消选择
            selected.clear(); hideDelSel(); redraw(); tool = 'pen'; setToolUI();
          }
        }
      }
      function move(e) {
        if (!drawing && !erasing && !lassoing && !dragging) return;
        e.preventDefault();
        const p = pos(e);
        if (drawing && curStroke) {
          const accepted = pushSmoothPoint(curStroke, p.x, p.y);
          if (!accepted) return;
          const newPt = curStroke.pts[curStroke.pts.length - 1];
          const prevPt = curStroke.pts.length >= 2 ? curStroke.pts[curStroke.pts.length - 2] : newPt;
          ctx.strokeStyle = curStroke.color; ctx.lineWidth = curStroke.width;
          ctx.globalAlpha = curStroke.tool === 'marker' ? 0.42 : 1;
          // 从上次画到的位置到新点，用"上一个采样点"作控制点，画一段二次贝塞尔
          ctx.beginPath();
          ctx.moveTo(drawnTo[0], drawnTo[1]);
          ctx.quadraticCurveTo(prevPt[0], prevPt[1], newPt[0], newPt[1]);
          ctx.stroke();
          ctx.globalAlpha = 1;
          drawnTo = [newPt[0], newPt[1]];
          lastX = newPt[0]; lastY = newPt[1];
        } else if (erasing) {
          const er = Math.max(10, curWidth * 2 + 6);
          let removed = false;
          const strokes = page().strokes;
          for (let i = strokes.length - 1; i >= 0; i--) {
            if (strokes[i].pts.some((pt) => distToSeg(pt[0], pt[1], lastX, lastY, p.x, p.y) < er)) {
              strokes.splice(i, 1); removed = true;
            }
          }
          if (removed) { erasingChanged = true; redraw(); }
          lastX = p.x; lastY = p.y;
        } else if (lassoing) {
          lassoPts.push([p.x, p.y]); redraw();
        } else if (dragging) {
          const dx = p.x - dragPrev.x, dy = p.y - dragPrev.y;
          if (Math.abs(dx) > 0 || Math.abs(dy) > 0) dragMoved = true;
          page().strokes.forEach((s, i) => { if (selected.has(i)) s.pts.forEach((pt) => { pt[0] += dx; pt[1] += dy; }); });
          dragPrev = p; redraw();
        }
      }
      function end(e) {
        if (drawing) {
          drawing = false;
          if (curStroke) {
            // 入栈（已经在 pushSmoothPoint 里做过插值）
            if (curStroke.pts.length > 1) { page().strokes.push(curStroke); commit(drawPrev); }
            curStroke = null;
            drawnTo = null;
            redraw();
          }
        } else if (erasing) {
          erasing = false;
          if (erasingChanged) commit(erasePrev);
        } else if (lassoing) {
          lassoing = false;
          if (lassoPts.length >= 3) {
            selected = new Set();
            page().strokes.forEach((s, i) => { if (strokeInPoly(s, lassoPts)) selected.add(i); });
            if (selected.size) { tool = 'move'; setToolUI(); }
          }
          lassoPts = []; redraw(); showDelSel();
        } else if (dragging) {
          dragging = false;
          if (dragMoved) commit(dragPrevSnap);
        }
      }

      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);
      canvas.addEventListener('touchcancel', end);

      // 粗细
      widthEl.addEventListener('input', () => { curWidth = +widthEl.value; widthV.textContent = curWidth; });

      // 工具切换
      function setToolUI() {
        wrap.querySelectorAll('.hw-tool[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
        if (tool !== 'move') hideDelSel(); else showDelSel();
      }
      wrap.querySelectorAll('.hw-tool[data-tool]').forEach((b) => {
        b.addEventListener('click', () => {
          tool = b.dataset.tool;
          if (tool !== 'lasso') lassoPts = [];
          if (tool !== 'move') { selected.clear(); }
          setToolUI(); redraw();
        });
      });

      // 撤回 / 还原
      wrap.querySelector('#hw-undo').addEventListener('click', () => {
        const p = page();
        if (!p.undo.length) return;
        p.redo.push(snapshot());
        applyStrokes(p.undo.pop());
      });
      wrap.querySelector('#hw-redo').addEventListener('click', () => {
        const p = page();
        if (!p.redo.length) return;
        p.undo.push(snapshot());
        applyStrokes(p.redo.pop());
      });
      // 清空本页
      wrap.querySelector('#hw-clear').addEventListener('click', () => {
        const p = page();
        if (!p.strokes.length) return;
        App.confirm('清空本页', '清空当前页所有笔触？', () => { commit(snapshot()); p.strokes = []; selected.clear(); hideDelSel(); redraw(); });
      });
      // 删除选中
      delSelBtn.addEventListener('click', () => {
        if (!selected.size) return;
        const p = page();
        App.confirm('删除选中', '删除选中的 ' + selected.size + ' 笔？', () => {
          const prev = snapshot();
          p.strokes = p.strokes.filter((_, i) => !selected.has(i));
          selected.clear(); commit(prev); hideDelSel(); redraw();
        });
      });

      // ---------- 多页 ----------
      function makeThumb(p) {
        const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
        if (r.width < 2) { p.thumb = p.img || ''; return; }
        const off = document.createElement('canvas');
        off.width = canvas.width; off.height = canvas.height;
        const octx = off.getContext('2d');
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderStrokesTo(octx, r.width, r.height, p, () => {});
        const tw = 120, th = Math.max(1, Math.round(tw * r.height / Math.max(1, r.width)));
        const tc = document.createElement('canvas'); tc.width = tw; tc.height = th;
        tc.getContext('2d').drawImage(off, 0, 0, tw, th);
        p.thumb = tc.toDataURL('image/png');
      }
      function renderPages() {
        const el = wrap.querySelector('#hw-pages');
        el.innerHTML = pages.map((p, i) =>
          '<div class="hw-page' + (i === pageIndex ? ' on' : '') + '" data-pi="' + i + '">' +
          (p.thumb ? '<img src="' + p.thumb + '" alt="页' + (i + 1) + '" />' : '<div class="hw-page-empty">✍️</div>') +
          '<span class="hw-page-no">' + (i + 1) + '</span>' +
          (pages.length > 1 ? '<button class="hw-page-del" data-del="' + i + '" type="button">✕</button>' : '') +
          '</div>'
        ).join('') +
        '<button class="hw-page hw-page-add" id="hw-page-add" type="button">＋</button>';
        el.querySelectorAll('.hw-page[data-pi]').forEach((b) => {
          b.addEventListener('click', (e) => {
            if (e.target.closest('.hw-page-del')) return;
            switchPage(+b.dataset.pi);
          });
        });
        el.querySelectorAll('.hw-page-del').forEach((b) => {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            const i = +b.dataset.del;
            App.confirm('删除此页', '删除第 ' + (i + 1) + ' 页手写？', () => {
              if (pages.length <= 1) { pages[0].strokes = []; pages[0].thumb = ''; }
              else { pages.splice(i, 1); if (pageIndex >= pages.length) pageIndex = pages.length - 1; }
              selected.clear(); hideDelSel(); redraw(); renderPages(); updateUndoRedo();
            });
          });
        });
        el.querySelector('#hw-page-add').addEventListener('click', () => {
          pages.push({ id: uid('d'), strokes: [], thumb: '', img: '', undo: [], redo: [] });
          pageIndex = pages.length - 1; selected.clear(); hideDelSel(); redraw(); renderPages(); updateUndoRedo();
        });
      }
      function switchPage(i) {
        if (i === pageIndex || i < 0 || i >= pages.length) return;
        makeThumb(page());
        pageIndex = i;
        selected.clear(); hideDelSel();
        redraw(); renderPages(); updateUndoRedo();
      }

      // 模式切换
      const modeBtns = wrap.querySelectorAll('.nn-edit-tab');
      const panes = wrap.querySelectorAll('.nn-edit-pane');
      function setMode(m) {
        mode = m;
        modeBtns.forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
        panes.forEach((p) => p.hidden = (p.dataset.pane !== m));
        if (m === 'draw') setTimeout(resizeCanvas, 30);
        if (m === 'text') setTimeout(() => ta.focus(), 30);
      }
      modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

      function close() {
        window.removeEventListener('mouseup', end);
        window.removeEventListener('resize', resizeCanvas);
        wrap.remove();
      }
      wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.matches('[data-close]')) close(); });

      // 保存
      wrap.querySelector('#fe-save').addEventListener('click', () => {
        makeThumb(page());
        if (mode === 'draw') makeThumb(page());
        close();
        try { onSave(ta.value, pages); } catch (e) { console.error(e); App.toast('保存失败'); }
      });

      setMode(mode);
      setTimeout(() => { if (mode === 'draw') resizeCanvas(); else ta.focus(); }, 60);
      renderPages(); updateUndoRedo();
    }

    // ---------- 新建/编辑书（弹层） ----------
    function openBookEditor(existing) {
      const isNew = !existing;
      const wrap = document.createElement('div');
      wrap.className = 'nn-mask';
      let curType = existing ? existing.type : 'short';
      wrap.innerHTML =
        '<div class="nn-sheet">' +
        '  <h3>' + (isNew ? '新建一本' : '编辑书') + '</h3>' +
        '  <input id="nb-title" type="text" maxlength="20" placeholder="书名（10字以内最佳）" value="' + (existing ? App.escapeHtml(existing.title) : '') + '" />' +
        '  <div>' +
        '    <p class="muted nb-h">类型</p>' +
        '    <div class="nb-type">' +
        '      <button class="nb-type-btn' + (curType === 'short' ? ' on' : '') + '" data-t="short" type="button">' + App.icon('note') + ' 短篇</button>' +
        '      <button class="nb-type-btn' + (curType === 'long' ? ' on' : '') + '" data-t="long" type="button">' + App.icon('book') + ' 长篇</button>' +
        '    </div>' +
        '  </div>' +
        '  <div class="nn-e-btns">' +
        '    <button class="btn ghost" data-close type="button">取消</button>' +
        '    <button class="btn" id="nb-ok" type="button">' + (isNew ? '创建' : '保存') + '</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(wrap);
      const titleI = wrap.querySelector('#nb-title');
      wrap.querySelector('.nb-type').addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]'); if (!b) return;
        curType = b.dataset.t;
        wrap.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
      });
      function close() { wrap.remove(); }
      wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.matches('[data-close]')) close(); });
      wrap.querySelector('#nb-ok').addEventListener('click', () => {
        const t = titleI.value.trim();
        if (!t) { App.toast('请输入书名'); return; }
        if (isNew) {
          const empty = { titleAnalysis: [], taglineAnalysis: [], hookAnalysis: [], charsAnalysis: [], payNodeAnalysis: [], otherAnalysis: [] };
          data.books.push(Object.assign({
            id: uid('b'), title: t, type: curType, emoji: '📕',
            quotes: [], createdAt: Date.now(),
          }, empty));
        } else {
          existing.title = t; existing.type = curType;
        }
        save(); close();
        paint();
        App.toast(isNew ? '已创建' : '已更新');
      });
      setTimeout(() => titleI.focus(), 60);
    }

    // ---------- 知乎榜单 ----------
    const RANK = [
      { t: '承珠冠', a: '李迟迟', tag: '古言', d: '命中注定的弑君者 vs 忠犬追随者。' },
      { t: '你已有取死之道', a: '海的鸽子', tag: '古言·爽文', d: '追妻火葬场女主 vs 一言不合就被鲨的男主们。' },
      { t: '吃人心的小妖怪', a: '女巫', tag: '志怪', d: '心软小妖怪 vs 淳朴善良村民。' },
      { t: '山回路转不见鸡', a: '旺旺大队长', tag: '仙侠·种田', d: '捡个男人只为种地的女主。' },
      { t: '阿缨', a: '鸠森', tag: '古言', d: '真心错付落魄贵女 vs 纨绔但护短小狗弟弟。' },
      { t: '沙洲秘事', a: '应不染', tag: '悬疑·IP榜', d: '入选 2026「最具转化价值文学IP推荐榜」。' },
      { t: '死到临头', a: '咸良', tag: '悬疑', d: '作者前作改编电影《恶意》票房 2.54 亿。' },
      { t: '照殿红', a: '盐选热门', tag: '脑洞·短篇', d: '女主手握照殿红四次穿越的时空闭环设定。' },
    ];
    // 不在「榜单」页展示、也不参与热度聚合的榜单（前端过滤即可，不动 rank.json）。
    // 说明：全网热议高分佳作已按用户要求加入榜单展示（黑马指数按榜单位置折算热度，与推荐/热度榜口径一致）；仅「新书榜」口径不同，继续隐藏。
    const HIDDEN_LIST_NAMES = new Set(['新书榜']);
    function filterRankLists(lists) {
      return (lists || []).filter((L) => !HIDDEN_LIST_NAMES.has(L.name));
    }
    let rankData = {
      updatedAt: '2026-07-30（内置快照）',
      lists: filterRankLists([
        { name: '热度榜', items: RANK.slice(0, 5) },
        { name: '新书榜', items: RANK.slice(5, 8) },
        { name: '推荐榜', items: RANK.slice(0, 3).concat(RANK.slice(6, 8)) },
      ]),
    };
    fetch('data/rank.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && Array.isArray(j.lists) && j.lists.length) {
          rankData = Object.assign({}, j, { lists: filterRankLists(j.lists) });
          summaryData = null; // 榜单数据变了，总结需要重算
          if (view === 'rank' || view === 'summary') paint();
        }
      })
      .catch(() => {})
      // 无论 rank.json 拉取成功与否，都用最终的 rankData 建立/更新今日快照
      .then(() => { nnInitHistory(); });

    // ---------- 热度历史：每日快照 + 收藏保留 / 下榜清理 ----------
    const HIST_KEY = 'nnHistory';
    const FAV_KEY = 'nnFavorites';
    const HIST_MAX = 400;
    let nnHistory = [];
    let nnFavorites = [];
    let nnHistReady = false;
    let nnHistLoading = false;
    let nnCurTag = '';          // 当前查看的标签
    let nnCurPeriod = 'day';    // 标签趋势周期：day | week | month
    let nnBookPeriod = 'day';   // 书本趋势周期

    function nnLoadFav() {
      try { nnFavorites = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { nnFavorites = []; }
      if (!Array.isArray(nnFavorites)) nnFavorites = [];
    }
    function nnSaveFav() {
      try { localStorage.setItem(FAV_KEY, JSON.stringify(nnFavorites)); } catch (e) {}
      if (window.App && window.App.syncAuto) window.App.syncAuto(); // 收藏变化 → 自动静默同步
    }
    function nnLoadHist() {
      try { nnHistory = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch (e) { nnHistory = []; }
      if (!Array.isArray(nnHistory)) nnHistory = [];
    }
    function nnSaveHist() {
      try { localStorage.setItem(HIST_KEY, JSON.stringify(nnHistory.slice(-HIST_MAX))); } catch (e) {}
      if (window.App && window.App.syncAuto) window.App.syncAuto(); // 趋势快照变化 → 自动静默同步
    }
    function nnToday() {
      const d = new Date();
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    // 当前仍在榜的书名集合
    function nnOnChart() {
      const s = {};
      (rankData.lists || []).forEach((L) => { (L.items || []).forEach((it) => { s[it.t] = 1; }); });
      return s;
    }
    // 收藏过、或已加入书架的书：历史永久保留
    function nnIsKept(title) {
      if (nnFavorites.indexOf(title) >= 0) return true;
      return (data.books || []).some((b) => b.title === title);
    }
    // 用当前 rankData 写入 / 覆盖今天的快照（同一天多次打开只保留最新一份）
    function nnEnsureToday() {
      const lists = (rankData.lists || []).map((L) => ({
        name: L.name,
        items: (L.items || []).map((it) => ({ t: it.t, a: it.a, tag: it.tag, d: it.d })),
      }));
      if (!lists.length) return;
      const t = nnToday();
      const last = nnHistory.length ? nnHistory[nnHistory.length - 1] : null;
      if (last && last.date === t) last.lists = lists;
      else nnHistory.push({ date: t, lists: lists });
    }
    // 未收藏且已下榜的书：从历史里剔除，避免 localStorage 无限膨胀
    function nnPurgeDropped() {
      const onChart = nnOnChart();
      nnHistory.forEach((snap) => {
        snap.lists = (snap.lists || []).map((L) => ({
          name: L.name,
          items: (L.items || []).filter((it) => onChart[it.t] || nnIsKept(it.t)),
        }));
      });
    }
    function nnApplySnapshot() {
      nnEnsureToday();
      nnPurgeDropped();
      nnHistory = nnHistory.slice(-HIST_MAX);
      nnSaveHist();
    }
    function nnInitHistory() {
      if (nnHistReady) { nnApplySnapshot(); return; }
      if (nnHistLoading) return;               // 归档还在拉，回来后会统一 apply
      nnLoadHist(); nnLoadFav();
      if (nnHistory.length) { nnHistReady = true; nnApplySnapshot(); return; }
      // 首次运行：用仓库里的全局归档做基线，让趋势图一上来就有数据
      nnHistLoading = true;
      fetch('data/rank-history.json', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (Array.isArray(j) && j.length) nnHistory = j.slice(-HIST_MAX); })
        .catch(() => {})
        .then(() => {
          nnHistLoading = false;
          nnHistReady = true;
          nnApplySnapshot();
          if (view === 'rank' || view === 'summary' || view === 'detail') paint();
        });
    }

    // 先把本地副本读出来，保证首屏（书籍详情的收藏星标等）状态正确
    nnLoadHist();
    nnLoadFav();

    // ---------- 聚合：日 / 周 / 月 ----------
    function nnWeekLabel(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      const day = (d.getDay() + 6) % 7;        // 周一为一周开始
      d.setDate(d.getDate() - day);
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      return { key: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), label: (d.getMonth() + 1) + '/' + d.getDate() };
    }
    function nnMonthLabel(dateStr) {
      const p = dateStr.split('-');
      return { key: p[0] + '-' + p[1], label: p[0] + '-' + p[1] };
    }
    // rows: [{date, value}]，value 可能为 null（当天不在榜）
    // useMax=true 时同一周/月取峰值（单本书的热度），否则求和（标签总热度）
    function nnGroup(rows, mode, useMax) {
      if (mode === 'day') {
        // 保留 null：当天不在榜就不画点/不连线（排名图里 0 会被画到图顶，误导）
        return rows.map((r) => ({ label: r.date.slice(5), value: r.value }));
      }
      const buckets = {};
      const order = [];
      rows.forEach((r) => {
        const k = mode === 'week' ? nnWeekLabel(r.date) : nnMonthLabel(r.date);
        if (!buckets[k.key]) { buckets[k.key] = { label: k.label, vals: [] }; order.push(k.key); }
        buckets[k.key].vals.push(r.value);
      });
      return order.sort().map((key) => {
        const vals = buckets[key].vals.filter((v) => v != null);
        let value = 0;
        if (vals.length) {
          value = useMax
            ? Math.max.apply(null, vals)
            : Math.round(vals.reduce((s, v) => s + v, 0) / vals.length); // 求和会随天数放大，这里取均值更可比
        }
        return { label: buckets[key].label, value: value };
      });
    }
    function nnTagSeries(tag, mode) {
      const rows = nnHistory.map((snap) => {
        let v = 0;
        (snap.lists || []).forEach((L) => {
          if (HIDDEN_LIST_NAMES.has(L.name)) return;
          (L.items || []).forEach((it, idx) => {
            const p = parseTag(it.tag);
            if (p.tags.indexOf(tag) >= 0) v += nnHeatWeight(idx + 1, L.items.length);
          });
        });
        return { date: snap.date, value: v };
      });
      return nnGroup(rows, mode, false);
    }
    function nnBookSeries(title, mode) {
      // 返回《书名》在各主榜中的「排名位置」（取最优/最小名次）。1=榜首，数字越大名次越低。
      const rows = nnHistory.map((snap) => {
        let found = false, rank = 0;
        (snap.lists || []).forEach((L) => {
          if (HIDDEN_LIST_NAMES.has(L.name)) return;
          (L.items || []).forEach((it, idx) => {
            if (it.t === title) { const r = idx + 1; if (!found || r < rank) { found = true; rank = r; } }
          });
        });
        return { date: snap.date, value: found ? rank : null };
      });
      return nnGroup(rows, mode, true);
    }

    // ---------- SVG 折线图（面积 + 折线 + 数据点 + 悬浮提示） ----------
    function nnLineChart(series, opts) {
      const invert = !!(opts && opts.invert);                 // 排名模式：1 在顶部，越大越靠下（名次越低）
      const fmt = (opts && opts.fmt) || (App.formatCount || ((v) => v));
      if (!series || !series.length) return '<p class="muted nn-line-empty">暂无数据，历史会从每天打开时开始累积。</p>';
      const W = 680, H = 220, padL = 52, padR = 12, padT = 14, padB = 26;
      const iw = W - padL - padR, ih = H - padT - padB;
      // 排名轴固定 1（榜首，顶部）~ rankMax（末位，底部），把 1~rankMax 所有排位完整画进图里
      let rankMax = (opts && opts.rankMax) || 9;
      series.forEach((s) => { if (s && s.value != null && s.value > rankMax) rankMax = s.value; });
      let minV, maxV;
      if (invert) { minV = 1; maxV = rankMax; }
      else { minV = 0; maxV = 1; series.forEach((s) => { if (s && s.value != null && s.value > maxV) maxV = s.value; }); }
      const n = series.length;
      const X = (i) => (n <= 1 ? padL + iw / 2 : padL + iw * i / (n - 1));
      const Y = (v) => invert
        ? padT + ih * (maxV === minV ? 0 : (v - minV) / (maxV - minV))
        : padT + ih * (1 - v / maxV);
      // 仅有效点（value != null）参与折线：null（当晚不在榜）处折线断开，不画点与线
      const valid = series.map((s, i) => ({ i, x: X(i), y: Y(s.value), s })).filter((p) => p.s.value != null);
      let line = '', area = '';
      if (valid.length) {
        let seg = [];
        const flush = () => {
          if (seg.length < 2) { seg = []; return; }   // 单点不连线/面积
          const segLine = seg.map((p, k) => (k ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
          line += (line ? ' ' : '') + segLine;
          const base = padT + ih;
          area += 'M' + seg[0].x.toFixed(1) + ' ' + base +
            ' ' + seg.map((p) => 'L' + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ') +
            ' L' + seg[seg.length - 1].x.toFixed(1) + ' ' + base + ' Z ';
          seg = [];
        };
        valid.forEach((p, k) => { if (k && p.i !== valid[k - 1].i + 1) flush(); seg.push(p); });
        flush();
      }

      let grid = '', yt = '';
      if (invert) {
        // 排名轴：按每个整数排位 1~rankMax 用同一套 Y() 画参考线并标注其排位值，
        // 这样数据点/折线落在 Y(rank) 时必然精准压在对应参考线上。
        // （旧写法用 0..rankMax 等分 + 四舍五入标注，导致标注"2"的线其实在 1.889 处，
        //  与 rank=2 数据点所在的 padT+ih/8 错开，标点对不上线。）
        for (let r = 1; r <= rankMax; r++) {
          const gy = Y(r);
          grid += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '" class="nn-gridline"/>';
          yt += '<text x="' + (padL - 6) + '" y="' + (gy + 4).toFixed(1) + '" class="nn-axis-y">' + fmt(r) + '</text>';
        }
      } else {
        const ticks = 4;
        for (let g = 0; g <= ticks; g++) {
          const gy = padT + ih * g / ticks;
          const gv = Math.round(maxV * (1 - g / ticks));
          grid += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '" class="nn-gridline"/>';
          yt += '<text x="' + (padL - 6) + '" y="' + (gy + 4).toFixed(1) + '" class="nn-axis-y">' + fmt(gv) + '</text>';
        }
      }
      // x 轴：每个数据点都对应其日期标签（日期多时旋转避免重叠）
      let xl = '';
      const rotate = n > 10;
      const xBaseY = H - (rotate ? 4 : 8);
      series.forEach((s, i) => {
        const x = X(i);
        const lbl = App.escapeHtml(s.label);
        xl += rotate
          ? '<text x="' + x.toFixed(1) + '" y="' + xBaseY + '" class="nn-axis-x" text-anchor="end" transform="rotate(-40 ' + x.toFixed(1) + ' ' + xBaseY + ')">' + lbl + '</text>'
          : '<text x="' + x.toFixed(1) + '" y="' + xBaseY + '" class="nn-axis-x" text-anchor="middle">' + lbl + '</text>';
      });
      // 数据点：圆点 cy 精确等于折线经过的 y 坐标（null 不画）
      let dots = '';
      valid.forEach((p) => {
        dots += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" class="nn-dot">' +
          '<title>' + App.escapeHtml(p.s.label) + '：' + fmt(p.s.value) + '</title></circle>';
      });
      return '<svg class="nn-line" viewBox="0 0 ' + W + ' ' + H + '" role="img">' +
        '<defs><linearGradient id="nnGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/>' +
        '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/></linearGradient></defs>' +
        grid + yt + xl +
        '<path d="' + area + '" fill="url(#nnGrad)" class="nn-area"/>' +
        '<path d="' + line + '" fill="none" class="nn-line-path"/>' +
        dots +
        '</svg>';
    }
    // 周期切换段控件
    function nnSegHtml(id, cur) {
      return '<div class="nn-seg" id="' + id + '">' +
        [['day', '日'], ['week', '周'], ['month', '月']].map((p) =>
          '<button data-period="' + p[0] + '"' + (cur === p[0] ? ' class="on"' : '') + ' type="button">' + p[1] + '</button>'
        ).join('') +
        '</div>';
    }
    function nnBindSeg(scope, id, onPick) {
      const seg = scope.querySelector('#' + id);
      if (!seg) return;
      seg.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          btn.classList.add('on');
          onPick(btn.dataset.period);
        });
      });
    }
    // 单本书的热度趋势弹窗（榜单条目点开）
    function nnOpenBookTrend(title) {
      if (!title) return;
      const overlay = document.createElement('div');
      overlay.className = 'nn-modal-mask';
      overlay.innerHTML =
        '<div class="nn-modal" role="dialog" aria-modal="true">' +
        '  <div class="nn-modal-head"><b>《' + App.escapeHtml(title) + '》排名趋势</b>' +
        '    <button class="nn-modal-x" type="button" aria-label="关闭">×</button></div>' +
        '  ' + nnSegHtml('nn-modal-seg', 'day') +
        '  <div class="nn-line-wrap" id="nn-modal-line"></div>' +
        '  <div class="nn-modal-meta">仅统计主榜（不含「新书榜」）· 未在榜的日期按 0 计。' +
        (nnIsKept(title) ? '该书已收藏，历史将永久保留。' : '收藏或加入书架后，下榜也会保留历史。') +
        '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      const draw = (p) => {
        const el = overlay.querySelector('#nn-modal-line');
        if (el) el.innerHTML = nnLineChart(nnBookSeries(title, p), { invert: true, rankMax: 9, fmt: (v) => '排名 ' + v });
      };
      draw('day');
      nnBindSeg(overlay, 'nn-modal-seg', draw);
      overlay.querySelector('.nn-modal-x').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    function paintRank() {
      // 顶部一行 tab：每个榜单一个 + 「总结」
      const lists = rankData.lists || [];
      if (!activeRankKey || (activeRankKey !== '__summary' && !lists.find((L) => L.name === activeRankKey))) {
        activeRankKey = lists[0] ? lists[0].name : '热度榜';
      }
      const navHtml = lists.map((L) =>
        '<button class="nn-nav-rank-btn' + (L.name === activeRankKey ? ' on' : '') +
        '" data-rank="' + App.escapeHtml(L.name) + '" type="button">' +
        App.escapeHtml(L.name) + '<i class="nn-nav-rank-count">' + (L.items ? L.items.length : 0) + '</i>' +
        '</button>'
      ).join('') +
        '<button class="nn-nav-rank-btn' + (activeRankKey === '__summary' ? ' on' : '') +
        '" data-rank="__summary" type="button">📊 总结</button>';

      if (activeRankKey === '__summary') {
        // 顶部导航选了「总结」→ 直接渲染总结
        paintSummary(navHtml);
        return;
      }

      const cur = lists.find((L) => L.name === activeRankKey) || lists[0] || { name: '榜单', items: [] };
      const listHtml = (cur.items || []).map((r, i) =>
        '<div class="nn-rank-item" data-open="' + App.escapeHtml(r.t) + '" title="点击查看《' + App.escapeHtml(r.t) + '》排名趋势">' +
        '  <div class="nn-rank-no">' + (i + 1) + '</div>' +
        '  <div class="nn-rank-main">' +
        '    <div class="nn-rank-title">《' + App.escapeHtml(r.t) + '》' +
          (r.tag ? '<span class="nn-rank-tag">' + App.escapeHtml(parseTag(r.tag).tags.join(' · ')) + '</span>' + rankMetricBadge(cur.name, r.tag)
          : '') + '</div>' +
        '    <div class="nn-rank-author muted">' + App.escapeHtml(r.a || '') + '</div>' +
        '    <div class="nn-rank-desc">' + App.escapeHtml(r.d || '') + '</div>' +
        '  </div>' +
        '  <button class="nn-chip sm nn-rank-fav" data-fav="' + App.escapeHtml(r.t) + '" type="button">收藏为书</button>' +
        '</div>'
      ).join('');

      mainEl.innerHTML =
        '<div class="nn-rank">' +
        '  <div class="nn-nav-rank" id="nn-nav-rank">' + navHtml + '</div>' +
        '  <p class="muted nn-rank-tip">知乎盐言故事 · <b>' + App.escapeHtml(cur.name) + '</b> · 更新于 ' + App.escapeHtml(rankData.updatedAt || '—') + '。点条目看排名趋势，点「收藏为书」创建拆文本。</p>' +
        '  <div class="nn-rank-list">' + listHtml + '</div>' +
        '</div>';

      // 顶部 tab 切换
      mainEl.querySelectorAll('.nn-nav-rank-btn').forEach((b) => {
        b.addEventListener('click', (e) => {
          const cur = e.currentTarget;
          activeRankKey = cur.getAttribute('data-rank') || cur.dataset.rank;
          paintRank();
        });
      });
      // 点条目 → 该书热度趋势弹窗
      mainEl.querySelectorAll('.nn-rank-item').forEach((it) => {
        it.addEventListener('click', () => nnOpenBookTrend(it.dataset.open));
      });
      // 收藏为书
      mainEl.querySelectorAll('[data-fav]').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation(); // 别冒泡到条目，否则会同时弹出趋势图
          const name = b.dataset.fav;
          const empty = { titleAnalysis: [], taglineAnalysis: [], hookAnalysis: [], charsAnalysis: [], payNodeAnalysis: [], otherAnalysis: [] };
          data.books.push(Object.assign({
            id: uid('b'), title: name, type: 'short', emoji: '📕',
            quotes: [], createdAt: Date.now(),
          }, empty));
          save();
          App.toast('已创建《' + name + '》到书架');
          paintSide();
        })
      );
    }

    // ---------- 总结：标签热度趋势 + 各标签热度比较 ----------
    // 解析 tag 字段（仅提取标签名 + 点赞量数字，点赞量不作为热度统计）：
    //   - "言情·警察 · 66.4 万赞"       -> tags=["言情","警察"], likes=664000, scoreLabel="66.4 万赞"
    //   - "93.4 黑马指数 · 言情·青梅竹马" -> tags=["言情","青梅竹马"], likes=93.4, scoreLabel="93.4 黑马指数"
    //   - "古言·爽文"                    -> tags=["古言","爽文"], likes=0
    //   - "古言"                          -> tags=["古言"], likes=0
    // 重要：likes 是参考性的点赞/收藏等数字，**不作为热度**。热度只看榜单位置。
    const SCORE_UNIT_RE = /(\d+(?:\.\d+)?)\s*(万|亿|千)?\s*(赞|热度|收藏|评论|书|黑马指数|黑马|指数)?/g;
    function parseTag(tag) {
      if (!tag) return { tags: [], likes: 0, scoreLabel: '' };
      const txt = String(tag).trim();
      // 1) 抽点赞量等参考数字（不做为热度）
      let likes = 0;
      let scoreLabel = '';
      const m = txt.match(/(\d+(?:\.\d+)?)\s*(万|亿|千)?\s*(赞|热度|收藏|评论|书|黑马指数|黑马|指数)?/);
      if (m && m[1]) {
        let n = parseFloat(m[1]) || 0;
        if (m[2] === '万') n *= 10000;
        else if (m[2] === '亿') n *= 100000000;
        else if (m[2] === '千') n *= 1000;
        // 注意："黑马指数" / "黑马" / "指数" 本身不算量级，数字就是原始分
        likes = n;
        scoreLabel = m[0].trim();
      }
      // 2) 抽标签：先把所有"数字+(单位)"片段删掉，再按分隔符切
      const labelPart = txt
        .replace(SCORE_UNIT_RE, ' ')
        .replace(/[·\/、,，]/g, ' ')
        .trim();
      const tags = labelPart
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => s && !/^\d+(?:\.\d+)?$/.test(s)); // 过滤掉孤立数字
      return { tags, likes, scoreLabel };
    }

    // 榜单卡片上的「指标徽章」：按榜单类型标注指标含义，避免把点赞量/热度混淆。
    //   - 推荐榜 / 口碑榜  -> 赞（点赞量）
    //   - 热度榜          -> 热度
    //   - 全网热议高分佳作 -> 黑马指数
    //   - 其它            -> 从 scoreLabel 自带单位推断
    // 注意：趋势图一律按排位（nnHeatWeight），该徽章数值仅作展示，不计入热度。
    function rankMetricBadge(listName, tag) {
      const p = parseTag(tag);
      const sl = p.scoreLabel;
      if (!sl) return '';
      let cat = '';
      if (listName === '推荐榜' || listName === '口碑榜') cat = '赞';
      else if (listName === '热度榜') cat = '热度';
      else if (listName === '全网热议高分佳作') cat = '黑马';
      else {
        const m = sl.match(/(赞|热度|收藏|评论|黑马指数|黑马|指数)/);
        if (m) cat = m[1].indexOf('黑马') >= 0 ? '黑马' : m[1];
      }
      const num = sl.replace(/(赞|热度|收藏|评论|书|黑马指数|黑马|指数)\s*$/, '').trim() || sl;
      const cls = 'nn-rank-metric ' + (cat === '热度' ? 'cat-heat' : cat === '赞' ? 'cat-like' : cat === '黑马' ? 'cat-index' : 'cat-raw');
      const tip = cat === '热度' ? '热度值（趋势图按排位计算，不采用此数值）'
        : cat === '赞' ? '点赞量（不计入热度统计）'
        : cat === '黑马' ? '黑马指数（参考）'
        : '参考数据（不计入热度）';
      const text = cat ? (cat + ' ' + num) : num;
      return ' <span class="' + cls + '" title="' + tip + '">' + App.escapeHtml(text) + '</span>';
    }

    // 基于榜单位置计算热度（越大越靠前热度越高）。
    // 例：榜单 36 本，第 1 本 → 36；最后一本 → 1；榜单越大权重越高（合理）。
    function nnHeatWeight(rank, total) {
      return Math.max(1, (total || 0) - (rank || 0) + 1);
    }

    function buildSummary() {
      const lists = rankData.lists || [];
      // 1) 全榜书数
      const totalItems = lists.reduce((s, L) => s + (L.items ? L.items.length : 0), 0);
      // 2) 全榜总热度分（按榜单位置权重累加，不再累计点赞量）
      let totalScore = 0;
      // 3) 标签维度累计
      const tagCount = {};    // 标签 -> 出现次数
      const tagScore = {};    // 标签 -> 热度累计（按位置权重）
      const tagLists = {};    // 标签 -> 在哪些榜单出现
      const tagRanks = {};    // 标签 -> [各榜单名次] 用于趋势比较
      lists.forEach((L) => {
        (L.items || []).forEach((it, i) => {
          const { tags, likes } = parseTag(it.tag);  // likes 仅为参考信息
          const weight = nnHeatWeight(i + 1, L.items.length);
          totalScore += weight;
          tags.forEach((tg) => {
            tagCount[tg] = (tagCount[tg] || 0) + 1;
            tagScore[tg] = (tagScore[tg] || 0) + weight;
            (tagLists[tg] = tagLists[tg] || new Set()).add(L.name);
            (tagRanks[tg] = tagRanks[tg] || []).push({ list: L.name, rank: i + 1, total: L.items.length, likes, weight });
          });
        });
      });
      // 排序
      const tagRows = Object.keys(tagCount).map((tg) => ({
        tag: tg,
        count: tagCount[tg],
        score: tagScore[tg],
        lists: Array.from(tagLists[tg] || []),
        ranks: tagRanks[tg] || [],
      })).sort((a, b) => b.score - a.score);
      return { totalItems, totalScore, tagRows };
    }

    function paintSummary(prebuiltNav) {
      if (!summaryData) summaryData = buildSummary();
      const { totalItems, totalScore, tagRows } = summaryData;
      const maxScore = tagRows.length ? tagRows[0].score : 1;
      const nav = prebuiltNav || '';
      // 折线图默认选中热度第一的标签；若之前选的标签已不在榜则回退
      const topTags = tagRows.slice(0, 12).map((r) => r.tag);
      if (!nnCurTag || topTags.indexOf(nnCurTag) < 0) nnCurTag = topTags[0] || '';

      // 各榜单的标签贡献（按榜单分组计算占比）— 趋势
      const lists = rankData.lists || [];
      const trendRows = lists.map((L) => {
        const counts = {};
        let total = 0;
        (L.items || []).forEach((it) => {
          const { tags } = parseTag(it.tag);
          tags.forEach((tg) => { counts[tg] = (counts[tg] || 0) + 1; total++; });
        });
        // 选 top3 标签
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([t, c]) => ({ t, c, pct: total ? Math.round(c / total * 100) : 0 }));
        return { name: L.name, total: L.items ? L.items.length : 0, top };
      });

      // 趋势（各榜单的标签占比）
      const trendHtml = trendRows.map((tr) => {
        const segs = tr.top.map((s, i) =>
          '<span class="nn-trend-seg" style="flex:' + s.c +
          ';background:' + ['#6fa860', '#7aa6c2', '#c47a16'][i % 3] +
          '" title="' + App.escapeHtml(s.t) + ' · ' + s.c + '次(' + s.pct + '%)"></span>'
        ).join('') + '<span class="nn-trend-seg rest" style="flex:' + Math.max(0, tr.total - tr.top.reduce((s, x) => s + x.c, 0)) + '"></span>';
        return '<div class="nn-trend-row">' +
          '  <span class="nn-trend-name">' + App.escapeHtml(tr.name) + '</span>' +
          '  <span class="nn-trend-bar">' + segs + '</span>' +
          '  <span class="nn-trend-tags">' + tr.top.map((s) => '<i>' + App.escapeHtml(s.t) + ' ' + s.pct + '%</i>').join(' ') + '</span>' +
          '</div>';
      }).join('');

      // 顶部导航（如果在榜单页内）
      const navHtml = nav
        ? '<div class="nn-nav-rank">' + nav + '</div>'
        : '';

      mainEl.innerHTML =
        '<div class="nn-sum">' +
        navHtml +
        '  <div class="nn-sum-hero">' +
        '    <div class="nn-sum-hero-cell"><span class="muted">在榜书数</span><b>' + totalItems + '</b></div>' +
        '    <div class="nn-sum-hero-cell"><span class="muted">总热度</span><b>' + App.formatCount(totalScore) + '</b></div>' +
        '    <div class="nn-sum-hero-cell"><span class="muted">标签数</span><b>' + tagRows.length + '</b></div>' +
        '  </div>' +
        '  <h3 class="nn-sum-h">近期各榜单的标签热度趋势 <span class="muted">（每个榜单内标签占比 · 当前快照）</span></h3>' +
        '  <div class="nn-trend">' + (trendHtml || '<p class="muted">暂无榜单数据</p>') + '</div>' +
        '  <div class="nn-trend-chart-card">' +
        '    <h3 class="nn-sum-h">标签热度趋势 <span class="muted">（折线 · 日 / 周 / 月）</span></h3>' +
        '    <div class="nn-trend-ctrl">' +
        '      <div class="nn-tag-chips" id="nn-tag-chips">' +
               tagRows.slice(0, 12).map((r) =>
                 '<button class="nn-tag-chip' + (r.tag === nnCurTag ? ' on' : '') +
                 '" data-tag="' + App.escapeHtml(r.tag) + '" type="button">' + App.escapeHtml(r.tag) + '</button>'
               ).join('') +
        '      </div>' +
        '      ' + nnSegHtml('nn-period-seg', nnCurPeriod) +
        '    </div>' +
        '    <div class="nn-line-wrap" id="nn-tag-line"></div>' +
        '  </div>' +
        '  <h3 class="nn-sum-h">完整标签排行 <span class="muted">（按热度倒序 · 条形显示相对热度）</span></h3>' +
        '  <div class="nn-sum-table">' +
            tagRows.map((r, i) => {
              const pct = maxScore ? Math.max(2, Math.round(r.score / maxScore * 100)) : 0;
              return '<div class="nn-sum-table-row">' +
                '  <span class="nn-sum-t-no">' + (i + 1) + '</span>' +
                '  <span class="nn-sum-tag">' + App.escapeHtml(r.tag) + '</span>' +
                '  <span class="nn-sum-bar"><i style="width:' + pct + '%"></i></span>' +
                '  <span class="muted">' + r.count + ' 次 · 跨 ' + r.lists.length + ' 个榜</span>' +
                '  <span class="nn-sum-c">' + App.formatCount(r.score) + '</span>' +
                '</div>';
            }).join('') +
        '  </div>' +
        '</div>';

      // 标签热度趋势：切标签 / 切周期
      function paintTagTrend() {
        const el = mainEl.querySelector('#nn-tag-line');
        if (el) el.innerHTML = nnLineChart(nnTagSeries(nnCurTag, nnCurPeriod));
      }
      mainEl.querySelectorAll('#nn-tag-chips .nn-tag-chip').forEach((c) => {
        c.addEventListener('click', () => {
          mainEl.querySelectorAll('#nn-tag-chips .nn-tag-chip').forEach((x) => x.classList.remove('on'));
          c.classList.add('on');
          nnCurTag = c.dataset.tag;
          paintTagTrend();
        });
      });
      nnBindSeg(mainEl, 'nn-period-seg', (p) => { nnCurPeriod = p; paintTagTrend(); });
      paintTagTrend();

      if (nav) {
        // 在榜单页内部：绑定顶部 tab
        mainEl.querySelectorAll('.nn-nav-rank-btn').forEach((b) => {
          b.addEventListener('click', () => {
            activeRankKey = b.dataset.rank;
            if (activeRankKey === '__summary') {
              paintSummary(nav);
            } else {
              paintRank();
            }
          });
        });
      }
    }

    // ---------- 全部摘抄 / 全部分析（不分书） ----------
    function paintAll(kind, label, emoji) {
      const all = [];
      data.books.forEach((b) => {
        TABS.forEach((t) => {
          if (kind === 'quotes' ? t.key !== 'quotes' : t.key === 'quotes') return;
          (b[t.field] || []).forEach((it) => all.push({ book: b, tab: t, item: it }));
        });
      });
      all.sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0));

      const rows = all.length
        ? all.map(({ book, tab, item }) => {
            const textHtml = item.text ? '<div class="nn-item-text">' + App.escapeHtml(item.text) + '</div>' : '';
            const drawHtml = drawThumbsHtml(item, tab.key, book.id);
            const hasText = !!item.text, hasDraw = (item.drawings || []).length > 0;
            const tag = (hasText && hasDraw) ? '图文' : (hasDraw ? '手写' : '文字');
            return '<div class="nn-item nn-item-all" data-bid="' + book.id + '">' +
                   '  <div class="nn-item-meta">' +
                   '    <span class="nn-item-tag">' + App.escapeHtml(tab.full) + '</span>' +
                   '    <span class="nn-item-from" data-goto="' + book.id + '">' + App.escapeHtml(book.title) + '</span>' +
                   '    <span class="muted">' + fmtDate(item.createdAt) + '</span>' +
                   '  </div>' +
                     drawHtml + textHtml +
                   '  <div class="nn-item-ops">' +
                   '    <button class="nn-op" data-iedit="' + tab.key + '|' + book.id + '|' + item.id + '" type="button" aria-label="编辑">✏️</button>' +
                   '    <button class="nn-op" data-idel="' + tab.key + '|' + book.id + '|' + item.id + '" type="button" aria-label="删除">✕</button>' +
                   '  </div>' +
                   '</div>';
          }).join('')
        : '<div class="nn-shelf-empty"><div class="nn-shelf-emoji">' + emoji + '</div>' +
          '<p class="muted">还没有' + label + '。点「我的拆书」进入任意一本书，添加内容。</p></div>';

      mainEl.innerHTML =
        '<div class="nn-all">' +
        '  <p class="muted nn-all-tip">共 ' + all.length + ' 条' + label + '（按时间倒序，点书名跳到该书）</p>' +
        '  <div class="nn-section-list">' + rows + '</div>' +
        '</div>';

      mainEl.querySelectorAll('[data-goto]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          view = 'detail'; currentBookId = el.dataset.goto; paint();
        });
      });
      mainEl.querySelectorAll('[data-iedit]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const parts = btn.dataset.iedit.split('|');
          const k = parts[0], bid = parts[1], iid = parts[2];
          const b = getBook(bid); if (!b) return;
          const field = fieldOf(k);
          const it = (b[field] || []).find((x) => x.id === iid);
          if (it) openItemEditor(b, k, it, paint);
        });
      });
      mainEl.querySelectorAll('[data-idel]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const parts = btn.dataset.idel.split('|');
          const k = parts[0], bid = parts[1], iid = parts[2];
          const b = getBook(bid); if (!b) return;
          const field = fieldOf(k);
          const name = labelOf(k);
          App.confirm('删除' + name, '确认删除这条' + name + '？', () => {
            b[field] = (b[field] || []).filter((x) => x.id !== iid);
            save(); paint(); App.toast('已删除');
          });
        });
      });
      bindViewers();
    }

    function fmtDate(t) {
      if (!t) return '';
      const d = new Date(t);
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function paint() {
      // FAB 只在「我的书/详情」下显示（创建新书）
      fabEl.style.display = (view === 'books' || view === 'detail') ? '' : 'none';
      if (view === 'books') paintBooks();
      else if (view === 'detail') paintDetail();
      else if (view === 'rank') paintRank();
      else if (view === 'summary') paintSummary();
      else if (view === 'allQuotes') paintAll('quotes', '摘抄', '📑');
      else if (view === 'allAnalyses') paintAll('analyses', '分析', '💡');
    }
    paintSide();
    paint();
  }
});
