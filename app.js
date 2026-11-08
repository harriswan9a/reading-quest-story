// 讀本頁的畫面邏輯。資料來自 data/<token>.json；規則全部在 logic.js。
import { SCENES, FORMS, CHAPTERS, COMMON_LINES, OFFICIAL_SEARCH_URL } from './script.js';
import { isValidToken, validateChildData, summarize, sceneStatus, formatDate, isUnlocked } from './logic.js';

const FACES = { 1: '📄', 2: '🌱', 3: '🕊️' };
const $view = document.getElementById('view');
const $nav = document.getElementById('nav');

const state = {
  token: null,
  data: null,          // 驗證過的孩子資料
  local: { completed: [], displayStyle: null, lastScene: null, badge: false },
  page: 'home',
  scene: null,         // { id, step, chosen: {}, explored: [] }
};

// ───────── 本機進度（只存在這支手機的瀏覽器） ─────────
const storageKey = () => `rq-story:${state.token}`;
function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) ?? 'null');
    if (raw && typeof raw === 'object') {
      state.local.completed = Array.isArray(raw.completed) ? raw.completed.filter(id => SCENES.some(s => s.id === id)) : [];
      state.local.displayStyle = typeof raw.displayStyle === 'string' ? raw.displayStyle : null;
      state.local.lastScene = typeof raw.lastScene === 'string' ? raw.lastScene : null;
      state.local.badge = raw.badge === true;
    }
  } catch { /* 無法讀取時當作全新 */ }
}
function saveLocal() {
  try { localStorage.setItem(storageKey(), JSON.stringify(state.local)); } catch { /* 私密視窗等情況忽略 */ }
}
function markCompleted(sceneId) {
  if (state.local.completed.includes(sceneId)) return false;
  state.local.completed.push(sceneId);
  saveLocal();
  return true;
}

// ───────── 小工具 ─────────
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}
const render = (...nodes) => { $view.replaceChildren(...nodes.flat().filter(n => n !== null && n !== undefined && n !== false)); window.scrollTo({ top: 0 }); };
const summary = () => summarize(state.data, state.local.completed);
const sceneById = id => SCENES.find(s => s.id === id);
const speakerName = s => (s === '玩家' ? state.data.nickname : s);

// ───────── 狀態頁 ─────────
function showState(icon, title, detail, action) {
  $nav.hidden = true;
  render(el('div', { class: 'state' },
    el('p', { class: 'big', 'aria-hidden': 'true' }, icon),
    el('h2', {}, title),
    detail ? el('p', { class: 'muted' }, detail) : null,
    action ? el('div', { class: 'row' }, action) : null,
  ));
}

// ───────── 導覽 ─────────
function setNav(page) {
  state.page = page;
  $nav.hidden = false;
  for (const b of $nav.querySelectorAll('button')) {
    if (b.dataset.page === page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
}
function openOfficial() {
  window.open(OFFICIAL_SEARCH_URL, '_blank', 'noopener,noreferrer');
}
function go(page) {
  setNav(page);
  if (page === 'home') renderHome();
  else if (page === 'story') renderStoryList();
  else if (page === 'shelf') renderShelf();
}
$nav.addEventListener('click', e => {
  const b = e.target.closest('button[data-page]');
  if (b) go(b.dataset.page);
});

// ───────── 首頁 ─────────
function renderHome() {
  const s = summary();
  const dots = Array.from({ length: 3 }, (_, i) => el('span', { class: i < s.bookLights ? 'on' : '', 'aria-hidden': 'true' }, i < s.bookLights ? '✦' : ''));
  let nextText;
  if (s.next) nextText = s.bookLights === 0 && s.newBooks.length === 0
    ? '讀完一本書、通過認證，同步後就有書光。'
    : `再 ${s.next.missing} 份書光，就能打開〈${s.next.title}〉。`;
  else nextText = '第一章全部打開了！書光會一直留著。';

  render(
    el('section', { class: 'card partner', 'aria-label': '小頁' },
      el('div', { class: 'partner-face', 'aria-hidden': 'true' }, FACES[s.form]),
      el('h2', {}, `${s.nickname}，歡迎回來。`),
      el('p', { class: 'muted' }, `小頁現在是「${s.formInfo.name}」。`),
    ),
    el('section', { class: 'card soft', 'aria-label': '書光' },
      el('div', { class: 'lights' }, el('span', { class: 'num' }, String(s.bookLights)), el('span', {}, '份書光')),
      el('div', { class: 'lights-bar' }, dots, s.bookLights > 3 ? el('span', { class: 'on' }, `+${s.bookLights - 3}`) : null),
      el('p', {}, nextText),
      el('p', { class: 'muted' }, `書光更新：${formatDate(s.importedAt)}`),
    ),
    el('button', { class: 'btn-brand btn-wide', onclick: () => openScene(s.resumeSceneId) }, '繼續故事'),
    el('section', { class: 'card', 'aria-label': '小頁的樣子' },
      el('h2', {}, '小頁的樣子'),
      el('div', { class: 'forms' }, FORMS.map(f => el('div', { class: f.form <= s.form ? '' : 'locked' },
        el('span', { class: 'face', 'aria-hidden': 'true' }, f.form <= s.form ? FACES[f.form] : '❔'),
        f.name,
        el('small', {}, f.form <= s.form ? '已解鎖' : f.hint),
      ))),
      state.local.badge ? el('p', { class: 'muted', style: 'margin-top:10px' }, '徽章：願意傾聽的尋書人') : null,
    ),
  );
}

// ───────── 故事清單 ─────────
function renderStoryList() {
  const s = summary();
  const done = new Set(state.local.completed);
  const groups = ['prologue', 'chapter1'].map(ch => el('section', { class: 'chapter' },
    el('h2', {}, CHAPTERS[ch].title),
    el('div', { class: 'scenes' }, s.scenes.filter(x => x.chapter === ch).map((x, i) => el('button', {
      class: `scene-btn${x.unlocked && x.reachable ? '' : ' locked'}${done.has(x.id) ? ' done' : ''}`,
      'aria-disabled': x.unlocked && x.reachable ? null : 'true',
      onclick: () => (x.unlocked && x.reachable ? openScene(x.id) : showLocked(x)),
    },
      el('span', { class: 't' }, el('span', { class: 'no', 'aria-hidden': 'true' }, done.has(x.id) ? '✓' : String(i + 1)), x.title),
      !x.unlocked ? el('span', { class: 'need' }, `還需要 ${x.missing} 份書光`)
        : !x.reachable ? el('span', { class: 'need' }, '先看完上一幕')
          : el('span', { class: 'muted' }, done.has(x.id) ? '看過了' : ''),
    ))),
  ));
  render(el('h2', { class: 'sr-only' }, '故事'), ...groups);
}

function showLocked(x) {
  render(
    el('section', { class: 'card soft' },
      el('h2', {}, x.title),
      el('p', { style: 'margin-top:8px' }, x.unlocked ? '故事要照順序看。先看完上一幕，這一幕就會打開。' : `這一幕還需要 ${x.missing} 份書光。`),
      x.unlocked ? null : el('div', { class: 'lines', style: 'margin-top:12px' }, lineNode({ s: '小頁', t: COMMON_LINES.notEnoughLight })),
      el('div', { class: 'row' },
        el('button', { onclick: () => go('story') }, '回故事清單'),
        el('button', { class: 'btn-explore', onclick: () => go('shelf') }, '看我的書架'),
      ),
    ),
  );
}

// ───────── 劇情播放 ─────────
function openScene(id) {
  const s = summary();
  if (!isUnlocked(id, s.bookLights, state.local.completed)) { go('story'); return; }
  setNav('story');
  state.scene = { id, step: 1, chosen: {}, explored: [] };
  state.local.lastScene = id;
  saveLocal();
  renderScene();
}

function isResolved(node, idx) {
  if ('choice' in node || 'pick' in node) return state.scene.chosen[idx] !== undefined;
  if ('action' in node) return state.scene.chosen[idx] === true;
  if ('hotspots' in node) return node.hotspots.some((h, i) => h.advance && state.scene.explored.includes(`${idx}:${i}`));
  return true;
}

function lineNode(node) {
  if ('n' in node) return node.kind === 'guide' ? el('p', { class: 'guide' }, node.n) : el('p', { class: 'narr' }, node.n);
  if ('screen' in node) return el('div', { class: 'screen' }, node.screen);
  const me = node.s === '玩家';
  return el('div', { class: `line${me ? ' me' : ''}${node.s === '小頁' ? ' xiaoye' : ''}` },
    el('span', { class: 'who' }, speakerName(node.s), node.note ? el('span', { class: 'note' }, `（${node.note}）`) : null),
    el('p', { class: 'bubble' }, node.t),
  );
}

function interactiveNode(node, idx) {
  const sc = state.scene;
  if ('choice' in node) {
    const chosen = sc.chosen[idx];
    return el('div', { class: 'stack' },
      el('div', { class: 'options', role: 'group', 'aria-label': '你的選擇' }, node.choice.map((opt, i) => el('button', {
        'aria-pressed': chosen === undefined ? null : String(chosen === i),
        disabled: chosen !== undefined && chosen !== i,
        onclick: () => { if (chosen === undefined) { sc.chosen[idx] = i; renderScene(); } },
      }, opt.label))),
      chosen === undefined ? null : el('div', { class: 'lines' }, node.choice[chosen].lines.map(lineNode)),
    );
  }
  if ('pick' in node) {
    const chosen = sc.chosen[idx];
    return el('div', { class: 'stack' },
      el('p', { class: 'narr' }, '選一個展示臺的樣式。'),
      el('div', { class: 'options', role: 'group', 'aria-label': '展示臺樣式' }, node.options.map((label, i) => el('button', {
        'aria-pressed': chosen === undefined ? null : String(chosen === i),
        disabled: chosen !== undefined && chosen !== i,
        onclick: () => { if (chosen === undefined) { sc.chosen[idx] = i; state.local[node.pick] = label; saveLocal(); renderScene(); } },
      }, label))),
    );
  }
  if ('action' in node) {
    const done = sc.chosen[idx] === true;
    return el('div', { class: 'stack' },
      done ? null : el('div', { class: 'options' }, el('button', { class: 'btn-explore', onclick: () => { sc.chosen[idx] = true; renderScene(); } }, node.action)),
      done ? el('div', { class: 'lines' }, node.lines.map(lineNode)) : null,
    );
  }
  if ('hotspots' in node) {
    return el('div', { class: 'stack' },
      el('p', { class: 'narr' }, '看看四周。'),
      el('div', { class: 'options', role: 'group', 'aria-label': '可以看的地方' }, node.hotspots.map((h, i) => {
        const key = `${idx}:${i}`, seen = sc.explored.includes(key);
        return el('div', {},
          el('button', { 'aria-expanded': String(seen), onclick: () => { if (!seen) { sc.explored.push(key); renderScene(); } } }, `${seen ? '✓ ' : ''}${h.label}`),
          seen ? el('p', { class: 'hotspot-text' }, h.text) : null,
        );
      })),
    );
  }
  if ('links' in node) {
    return el('div', { class: 'options' }, node.links.map(l => {
      if (l.go === 'official') return el('button', { class: 'btn-explore', onclick: openOfficial }, `${l.label}（另開官方網站）`);
      return el('button', { onclick: () => followLink(l.go) }, l.label);
    }));
  }
  return lineNode(node);
}

function followLink(go_) {
  if (go_ === 'shelf') go('shelf');
  else if (go_ === 'home') go('home');
  else if (go_ === 'next') nextScene();
  else if (go_.startsWith('scene:')) openScene(go_.slice(6));
}

function nextScene() {
  const i = SCENES.findIndex(s => s.id === state.scene.id);
  const next = SCENES[i + 1];
  if (!next) { go('home'); return; }
  const s = summary();
  if (isUnlocked(next.id, s.bookLights, state.local.completed)) openScene(next.id); else go('story');
}

function renderScene() {
  const sc = state.scene;
  const scene = sceneById(sc.id);
  const idx = SCENES.indexOf(scene);
  const total = scene.lines.length;
  const visible = scene.lines.slice(0, sc.step);
  const lastResolved = visible.every((n, i) => isResolved(n, i));
  const finished = sc.step >= total && lastResolved;
  const hasLinks = scene.lines.some(n => 'links' in n);

  if (finished) {
    markCompleted(scene.id);
    if (scene.badge && !state.local.badge) { state.local.badge = true; saveLocal(); }
  }
  const s = summary();
  const prev = SCENES[idx - 1], next = SCENES[idx + 1];
  const nextStatus = next ? sceneStatus(s.bookLights, state.local.completed).find(x => x.id === next.id) : null;

  const controls = [];
  if (!finished) {
    controls.push(el('button', { class: 'btn-brand btn-wide', disabled: !lastResolved, onclick: () => { sc.step = Math.min(total, sc.step + 1); renderScene(); } }, lastResolved ? '下一句' : '先選一個'));
  } else {
    if (scene.unlocksForm && scene.unlocksForm > 1 && state.local.completed.includes(scene.id)) {
      controls.push(el('p', { class: 'reward' }, `小頁變成「${FORMS.find(f => f.form === scene.unlocksForm).name}」了！`));
    }
    if (scene.badge) controls.push(el('p', { class: 'reward' }, `你得到徽章：${scene.badge}`));
    if (next && !nextStatus.unlocked) {
      controls.push(el('div', { class: 'wait' },
        el('p', {}, `下一幕〈${next.title}〉還需要 ${nextStatus.missing} 份書光。`),
        el('p', { class: 'muted' }, `小頁：${COMMON_LINES.notEnoughLight}`),
      ));
    }
    if (!hasLinks) {
      const pair = el('div', { class: 'pair' });
      pair.append(prev ? el('button', { onclick: () => openScene(prev.id) }, '上一幕') : el('button', { onclick: () => go('home') }, '回首頁'));
      if (next && nextStatus.unlocked && nextStatus.reachable) pair.append(el('button', { class: 'btn-brand', onclick: () => openScene(next.id) }, '下一幕'));
      else pair.append(el('button', { class: 'btn-explore', onclick: () => go(next ? 'shelf' : 'home') }, next ? '看我的書架' : '回首頁'));
      controls.push(pair);
    } else if (prev) {
      controls.push(el('div', { class: 'pair' }, el('button', { onclick: () => openScene(prev.id) }, '上一幕')));
    }
  }
  render(
    el('div', { class: 'scene-head' },
      el('h2', {}, scene.title),
      el('span', { class: 'muted' }, `${CHAPTERS[scene.chapter].title.replace(/〈.*〉/, '')} ${idx < 4 ? idx + 1 : idx - 3}/${idx < 4 ? 4 : 8}`),
    ),
    scene.bg ? el('p', { class: 'bg' }, scene.bg) : null,
    el('div', { class: 'lines' }, visible.map((n, i) => interactiveNode(n, i))),
    el('div', { class: 'controls' }, ...controls),
  );
  // 新句子出現時捲到最下面，讓孩子看到剛出現的那一句。
  const last = $view.querySelector('.lines > :last-child');
  if (last && sc.step > 1) last.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

// ───────── 書架 ─────────
function renderShelf() {
  const s = summary();
  const byDate = (a, b) => String(b.passedAt ?? '').localeCompare(String(a.passedAt ?? ''));
  const items = [...s.newBooks.sort(byDate), ...s.historicalBooks.sort(byDate)];
  const dateText = b => (b.passedAt ? `${b.dateFrom === 'official' ? '通過' : '同步'} ${formatDate(b.passedAt)}` : `匯入 ${formatDate(s.importedAt)}`);
  render(
    el('div', { class: 'shelf-head' },
      el('h2', {}, '我的書架'),
      el('span', { class: 'muted' }, `共 ${items.length} 本`),
    ),
    el('p', { class: 'muted', style: 'margin:6px 0 14px' }, s.newBooks.length
      ? `有書光標記的 ${s.newBooks.length} 本，就是你的書光。`
      : '書光會從這裡來：讀完一本書、通過認證，再請主辦人同步。'),
    items.length ? el('div', { class: 'stack' }, items.map(b => el('div', { class: `book ${b.historical ? 'old' : 'new'}` },
      el('span', { class: `badge ${b.historical ? '' : 'light'}` }, b.historical ? '以前讀的' : '✦ 書光'),
      el('h3', {}, b.title ?? '（書名待補）'),
      el('p', {}, dateText(b)),
    ))) : el('p', { class: 'empty' }, '書架還空空的。讀完一本書、通過認證後，請主辦人幫你同步。'),
    el('div', { class: 'row' }, el('button', { class: 'btn-explore', onclick: openOfficial }, '到官方網站找書（另開官方網站）')),
  );
}

// ───────── 載入 ─────────
async function boot() {
  const token = location.hash.slice(1);
  if (!token) { showState('🔑', '這個連結少了鑰匙。', '請問主辦人要你的專屬連結。'); return; }
  if (!isValidToken(token)) { showState('🔑', '這個連結不太對。', '請問主辦人再給你一次連結。'); return; }
  state.token = token;
  showState('📖', '正在打開書境……');
  let raw;
  try {
    const res = await fetch(`data/${encodeURIComponent(token)}.json`, { cache: 'no-store' });
    if (res.status === 404) { showState('🔍', '找不到你的資料。', '請問主辦人是不是還沒放上去。', el('button', { onclick: boot }, '再試一次')); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } catch {
    showState('📡', '現在連不上。', '等一下再試一次。', el('button', { onclick: boot }, '再試一次'));
    return;
  }
  try { state.data = validateChildData(raw); } catch {
    showState('🧩', '資料看起來壞掉了。', '請主辦人重新匯入一次。');
    return;
  }
  loadLocal();
  go('home');
}

window.addEventListener('hashchange', () => location.reload());
boot();
