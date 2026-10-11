/**
 * App wiring: settings, loading the offline engine, learning, the editor buttons.
 * Everything runs in this page: there is no server, no other engine and no network use of any kind (tests/audit_offline.js proves it).
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const ta = $('editor');
  const FA = document.documentElement.lang === 'fa';                                  // the page is Persian (/) or English (/en/)
  const num = n => n.toLocaleString(FA ? 'fa-IR' : 'en-US');
  const TXT = FA ? { learned: n => num(n) + ' مورد یاد گرفته', none: 'هنوز چیزی یاد نگرفته', copied: 'کپی شد', words: n => n ? num(n) + ' کلمه' : 'صفر کلمه' }      // never a lone ۰: it looks like a dot
                 : { learned: n => n + (n === 1 ? ' thing learned' : ' things learned'), none: 'Nothing learned yet', copied: 'Copied', words: n => n + (n === 1 ? ' word' : ' words') };

  // ------------------------------------------------------------------ settings (persisted per browser)
  const DEFAULT_SETTINGS = {
    pageSize: 6, inlinePreview: true, maxCandidates: 18, showLatin: true, autoSpace: true,
    persianDigits: true, mapPunct: true, context: true, learn: true, zwnj: 'off',
    // Only Space (Enter, 0) ends a word; signs like @ . - / stay in it. Users can untick it under Settings
    // (their choice is remembered and wins over this default).
    onlySpaceCommits: true,
  };
  const settings = Object.assign({}, DEFAULT_SETTINGS);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  // (an older saved settings object may still carry keys of removed features — mode, enabled, fallback, debug, compare — they are simply never read)
  try { Object.assign(settings, JSON.parse(store.get('fa-ime-settings') || '{}')); } catch (e) { /* ignore */ }
  const saveSettings = () => store.set('fa-ime-settings', JSON.stringify(settings));

  // ------------------------------------------------------------------ the engine
  let engine = null;

  function candidates(buf, before) {
    if (!engine) return [];
    const r = engine.candidates(buf, { max: settings.maxCandidates, prev: settings.context ? before : null });
    return r.map(c => ({ text: c.text, kind: c.kind, score: c.kind === 'alias' ? undefined : c.score, cost: c.cost, logp: c.logp }));
  }

  // ------------------------------------------------------------------ learning
  const LEARN_KEY = 'fa-ime-learned';
  function loadLearned() {
    try { engine.importUserData(JSON.parse(store.get(LEARN_KEY) || '[]')); } catch (e) { /* ignore */ }
    updateLearnCount();
  }
  let saveTimer = 0;
  function saveLearned() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = engine.exportUserData();
      store.set(LEARN_KEY, JSON.stringify(data.slice(-5000)));
    }, 400);
  }
  function updateLearnCount() {
    $('learnCount').textContent = engine ? (engine.user.size ? TXT.learned(engine.user.size) : TXT.none) : '';      // never a lone ۰: it looks like a dot
  }

  // ------------------------------------------------------------------ IME controller
  const ime = new IMEController(ta, $('popup'), {
    settings,
    provider: candidates,
    onCommit(buf, cand) {
      if (settings.learn && engine) { engine.learn(buf, cand.text); saveLearned(); updateLearnCount(); }
    },
  });

  // ------------------------------------------------------------------ settings controls
  const bind = (id, key, num) => {
    const el = $('s-' + id);
    if (el.type === 'checkbox') el.checked = !!settings[key];
    else el.value = String(settings[key]);
    el.addEventListener('change', () => {
      settings[key] = el.type === 'checkbox' ? el.checked : (num ? +el.value : el.value);
      saveSettings();
    });
  };
  bind('pageSize', 'pageSize', true); bind('inlinePreview', 'inlinePreview'); bind('showLatin', 'showLatin'); bind('autoSpace', 'autoSpace');
  bind('persianDigits', 'persianDigits'); bind('mapPunct', 'mapPunct'); bind('context', 'context'); bind('learn', 'learn');
  bind('onlySpaceCommits', 'onlySpaceCommits');
  $('s-zwnj').checked = settings.zwnj === 'auto';        // stored as 'off' | 'auto' (the engine option), shown as a checkbox
  $('s-zwnj').addEventListener('change', () => {
    settings.zwnj = $('s-zwnj').checked ? 'auto' : 'off';
    saveSettings();
    if (engine) engine.setOptions({ zwnj: settings.zwnj });
  });
  const applySignsHelp = () => { $('key-signs').hidden = !settings.onlySpaceCommits; };
  $('s-onlySpaceCommits').addEventListener('change', applySignsHelp);
  applySignsHelp();

  $('clearLearn').addEventListener('click', () => { if (engine) { engine.importUserData([]); store.set(LEARN_KEY, '[]'); updateLearnCount(); } });
  $('clear').addEventListener('click', () => { ime.finish(); ta.value = ''; updateCount(); ta.focus(); });
  $('copy').addEventListener('click', async () => {
    ime.finish();
    try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand('copy'); }
    const b = $('copy'); const t = b.textContent; b.textContent = TXT.copied; setTimeout(() => { b.textContent = t; }, 1100);
  });
  function updateCount() { const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0; $('count').textContent = TXT.words(n); }
  ta.addEventListener('input', updateCount);
  ta.value = store.get('fa-ime-text') || '';
  ta.addEventListener('input', () => store.set('fa-ime-text', ta.value));
  updateCount();

  // ------------------------------------------------------------------ boot
  // The page shows nothing about loading. It says "ready" only to the tests (body[data-engine]); a failure is the one thing worth showing.
  function boot() {
    if (typeof FarsiIME === 'undefined' || !window.FARSI_LEXICON) {
      document.body.dataset.engine = 'error';
      const e = $('boot-error'); e.textContent = 'Engine files are missing — run: npm run bundle'; e.hidden = false;
      return;
    }
    engine = FarsiIME.Engine.fromTSV(window.FARSI_LEXICON, { zwnj: settings.zwnj });
    window.FARSI_LEXICON = null;                 // free the 4 MB string
    if (window.FARSI_ALIASES) { engine.setAliases(window.FARSI_ALIASES); window.FARSI_ALIASES = null; }
    if (window.FARSI_BIGRAMS) { engine.setBigrams(window.FARSI_BIGRAMS); window.FARSI_BIGRAMS = null; }
    loadLearned();
    window.__engine = engine;                    // handy in the console (and used by the parity test)
    document.body.dataset.engine = 'ready';
    ta.focus();
  }
  setTimeout(boot, 30);                          // let the page paint first
  window.__ime = ime;
})();
