// 故事迴圈 v0 的純邏輯：書光計算、幕的解鎖、小頁形態、下一門檻。
// 瀏覽器與 Node 都能載入；不碰 DOM、不碰 localStorage。
import { SCENES, FORMS } from './script.js';

export { SCENES, FORMS };

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

export function isValidToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

// 孩子資料檔（story/data/<token>.json）的最小驗證；回傳正規化後的物件，失敗時丟 Error。
export function validateChildData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_DATA');
  if (raw.schemaVersion !== 1) throw new Error('UNSUPPORTED_SCHEMA');
  if (typeof raw.nickname !== 'string' || !raw.nickname.trim() || raw.nickname.length > 20) throw new Error('INVALID_NICKNAME');
  if (typeof raw.importedAt !== 'string' || !Number.isFinite(Date.parse(raw.importedAt))) throw new Error('INVALID_IMPORTED_AT');
  if (!Array.isArray(raw.books)) throw new Error('INVALID_BOOKS');
  const books = dedupeBooks(raw.books);
  return { schemaVersion: 1, nickname: raw.nickname.trim(), importedAt: raw.importedAt, books };
}

// 同一本書（同一個 id）只算一次；保留第一筆。略過沒有 id 的列。
export function dedupeBooks(books) {
  const seen = new Set();
  const out = [];
  for (const b of books ?? []) {
    if (!b || typeof b !== 'object') continue;
    const id = String(b.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: typeof b.title === 'string' && b.title.trim() ? b.title.trim() : null,
      passedAt: typeof b.passedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.passedAt) ? b.passedAt : null,
      dateFrom: b.dateFrom === 'official' ? 'official' : 'sync',
      historical: b.historical === true,
    });
  }
  return out;
}

// 書光：每通過一本「新」書 1 份（REQ-07）。歷史收藏（baseline 時已有的書）進書架但不給書光。
export function countBookLights(books) {
  return dedupeBooks(books).filter(b => !b.historical).length;
}

// 幕的實際門檻：依故事順序只增不減，所以取自己與前一幕的最大值。
export function sceneRequirements() {
  let running = 0;
  return SCENES.map(scene => {
    running = Math.max(running, scene.requires);
    return { id: scene.id, chapter: scene.chapter, title: scene.title, requires: running };
  });
}

// unlocked：書光夠不夠（REQ-11 的「累積書光 >= N」）。
// reachable：順序到了沒（REQ-07「按故事順序解鎖」、REQ-11「前一幕完成」）：序章 4 幕永遠可達；
//   第一章第一幕可達；其餘要前一幕已完成。已完成的幕永遠可達（重看不受影響）。
// 能進入＝unlocked 且 reachable。
export function sceneStatus(bookLights, completedSceneIds = []) {
  const n = Math.max(0, Math.floor(Number(bookLights) || 0));
  const done = new Set(completedSceneIds);
  const reqs = sceneRequirements();
  return reqs.map((s, i) => {
    const prev = reqs[i - 1];
    const reachable = s.chapter === 'prologue' || done.has(s.id) || !prev || prev.chapter !== s.chapter || done.has(prev.id);
    return {
      ...s,
      unlocked: n >= s.requires,
      reachable,
      missing: Math.max(0, s.requires - n),
    };
  });
}

export function isUnlocked(sceneId, bookLights, completedSceneIds = []) {
  const s = sceneStatus(bookLights, completedSceneIds).find(x => x.id === sceneId);
  return Boolean(s?.unlocked && s.reachable);
}

// 下一個尚未解鎖的門檻；全部解鎖時回 null。
export function nextThreshold(bookLights) {
  const locked = sceneStatus(bookLights).filter(s => !s.unlocked);
  if (!locked.length) return null;
  const first = locked[0];
  return { sceneId: first.id, title: first.title, needed: first.requires, missing: first.missing };
}

// 小頁形態（REQ-08）：依「完成的場景」解鎖，不依書光數；且只承認目前仍解鎖的場景，
// 所以主辦人更正資料使書光下降時會跟著回退（v0 刻意如此，與 REQ-08「撤回不降形態」的實作預設不同）。
export function partnerForm(bookLights, completedSceneIds = []) {
  const done = new Set(completedSceneIds);
  let form = 1;
  for (const f of FORMS) {
    if (f.form === 1) continue;
    if (done.has(f.unlockedBy) && isUnlocked(f.unlockedBy, bookLights, completedSceneIds)) form = Math.max(form, f.form);
  }
  return form;
}

export function formInfo(form) {
  return FORMS.find(f => f.form === form) ?? FORMS[0];
}

// 「繼續故事」要開哪一幕：第一個已解鎖但還沒完成的幕；都完成時停在最後一個已解鎖的幕。
export function resumeSceneId(bookLights, completedSceneIds = []) {
  const done = new Set(completedSceneIds);
  const status = sceneStatus(bookLights);
  const next = status.find(s => s.unlocked && !done.has(s.id));
  if (next) return next.id;
  const unlocked = status.filter(s => s.unlocked);
  return unlocked.length ? unlocked.at(-1).id : status[0].id;
}

// 首頁用的總覽。
export function summarize(data, completedSceneIds = []) {
  const books = dedupeBooks(data.books);
  const bookLights = countBookLights(books);
  const form = partnerForm(bookLights, completedSceneIds);
  return {
    nickname: data.nickname,
    importedAt: data.importedAt,
    books,
    bookLights,
    newBooks: books.filter(b => !b.historical),
    historicalBooks: books.filter(b => b.historical),
    form,
    formInfo: formInfo(form),
    next: nextThreshold(bookLights),
    scenes: sceneStatus(bookLights, completedSceneIds),
    resumeSceneId: resumeSceneId(bookLights, completedSceneIds),
  };
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replace(/-/g, '/');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}
