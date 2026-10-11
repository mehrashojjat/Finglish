/**
 * IMEController — turns a plain <textarea> into a transliterating input method.
 *
 * Key rules (the Mac keyboard's Session.swift is the Swift twin; tests/e2e/smoke.js is the executable form of this list):
 *   - typing Latin letters starts a "composition"; the candidate list floats under the caret, the typed Latin is its header
 *   - Space / Enter / 1-9 : commit the highlighted / numbered candidate AND add a space
 *   - ↓ ↑ : move the highlight   PageDown / PageUp : next / previous page   Esc : discard the composition
 *   - Backspace : delete a Latin letter       , ; ? : become ، ؛ ؟       0-9 : Persian digits
 *   - the typed Latin is a PINNED LAST ROW of the list, numbered 0 (key `0` commits it, exactly as typed incl. capitals), so
 *     1..N stay for Persian words and English gets its own key
 *   - Shift+Space types a half-space (نیم‌فاصله, U+200C) like a Persian keyboard: it commits the highlighted word WITHOUT a space
 *     and then adds the half-space (می + ⇧Space + خواهم = می‌خواهم); with nothing being typed it just inserts one.
 *     Inside text that is kept literal (e-mails, links) it acts as a plain Space.
 *   - there is no Persian on/off switch: English is typed with `0` (the pinned "as typed" row) or by leaving the page
 *   - inline preview of the highlighted candidate, Tab / ← / → also move the highlight, page sizes 5-9
 *   - EXPERIMENT, setting `onlySpaceCommits` (default in app.js, checkbox in Settings): signs (@ . - _ / : , ? …) no longer end
 *     the word; only Space / Enter / 0 commit. Two cases:
 *       • signs only AFTER the letters ("salam?", "khoobi!!"): still a Persian word — the list keeps offering Persian candidates for
 *         the letters, every row shows the word WITH the signs (سلام؟), and Space commits that; `0` commits the English as typed.
 *       • letters/digits AFTER a sign ("me@example.com", "a.b", links): nothing to convert — the engine is not asked, the list
 *         shows only the pinned "as typed" row; digits 1-9 then extend the word instead of picking.
 * The controller does not know the engine: `host.provider(latin, textBefore)` returns the list of candidates.
 */
(function (root) {
  'use strict';

  const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const FA = typeof document !== 'undefined' && document.documentElement.lang === 'fa';      // the page is Persian (/) or English (/en/)
  const PUNCT = { ',': '،', ';': '؛', '?': '؟' };
  const ZWNJ = '\u200c';                                  // the half-space
  const MIRROR_PROPS = ['direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY', 'borderTopWidth',
    'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom',
    'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily',
    'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize'];

  /** Viewport-relative position of the caret at `index` inside a textarea (mirror-div technique). */
  function caretCoords(ta, index) {
    const cs = getComputedStyle(ta);
    const div = document.createElement('div');
    for (const p of MIRROR_PROPS) div.style[p] = cs[p];
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.top = '0';
    div.style.left = '-9999px';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.overflow = 'hidden';
    div.textContent = ta.value.substring(0, index);
    const marker = document.createElement('span');
    marker.textContent = '​';
    div.appendChild(marker);
    div.appendChild(document.createTextNode(ta.value.substring(index) || '.'));
    document.body.appendChild(div);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    const r = ta.getBoundingClientRect();
    const out = {
      left: r.left + marker.offsetLeft + parseFloat(cs.borderLeftWidth) - ta.scrollLeft,
      top: r.top + marker.offsetTop + parseFloat(cs.borderTopWidth) - ta.scrollTop,
      height: lh,
    };
    document.body.removeChild(div);
    return out;
  }

  class IMEController {
    /**
     * @param {HTMLTextAreaElement} ta
     * @param {HTMLElement} popup
     * @param {{settings:object, provider:function, onCommit?:function}} host
     */
    constructor(ta, popup, host) {
      this.ta = ta;
      this.popup = popup;
      this.host = host;
      this.comp = null;
      // undo/redo: the browser's own stack does not see our programmatic edits, so we keep one (one step per word)
      this.hist = [];
      this.redoStack = [];
      this.nativeTs = 0;
      this.lastProgrammatic = true;
      ta.addEventListener('beforeinput', () => {
        if (this.comp) return;
        const now = Date.now();
        if (this.lastProgrammatic || now - this.nativeTs > 800) this.pushHist();
        this.nativeTs = now;
        this.lastProgrammatic = false;
      });
      ta.addEventListener('keydown', e => this.onKeydown(e));
      ta.addEventListener('blur', () => this.finish());
      ta.addEventListener('scroll', () => this.comp && this.place());
      document.addEventListener('selectionchange', () => this.onSelectionChange());
      popup.addEventListener('mousedown', e => this.onPopupMouse(e));
      window.addEventListener('resize', () => this.comp && this.place());
    }

    get s() { return this.host.settings; }
    get composing() { return !!this.comp; }

    // ------------------------------------------------------------------ keyboard
    onKeydown(e) {
      if (e.isComposing) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' || (k === 'y' && e.ctrlKey)) {       // our own undo stack (one step per word)
          e.preventDefault();
          if (this.comp) { this.cancel(); return; }
          if (k === 'y' || e.shiftKey) this.redo(); else this.undo();
          return;
        }
        if (this.comp) this.finish();
        return;
      }
      if (e.altKey) return;                       // Option+key makes special characters on macOS
      if (this.comp) this.keyComposing(e); else this.keyIdle(e);
    }

    keyIdle(e) {
      const k = e.key;
      if (k === ' ' && e.shiftKey) { e.preventDefault(); this.insert(ZWNJ); return; }      // Shift+Space: half-space, as on a Persian keyboard
      if (/^[a-zA-Z]$/.test(k)) { e.preventDefault(); this.begin(k); return; }
      if (this.s.mapPunct && PUNCT[k]) { e.preventDefault(); this.insert(PUNCT[k]); return; }
      if (this.s.persianDigits && /^[0-9]$/.test(k)) { e.preventDefault(); this.insert(PERSIAN_DIGITS[+k]); }
    }

    keyComposing(e) {
      const k = e.key, c = this.comp, ps = this.s.pageSize;
      if (/^[a-zA-Z']$/.test(k)) { e.preventDefault(); this.setRaw(c.raw + k); this.refresh(); return; }
      if (this.s.onlySpaceCommits) {
        const sign = /^[\x21-\x7E]$/.test(k) && !/^[0-9]$/.test(k);      // printable ASCII that is not a letter / digit
        if (sign || (/^[1-9]$/.test(k) && this.isLiteral(c.raw))) { e.preventDefault(); this.setRaw(c.raw + k); this.refresh(); return; }
      }
      switch (k) {
        case 'Backspace':
          e.preventDefault();
          if (c.raw.length > 1) { this.setRaw(c.raw.slice(0, -1)); this.refresh(); } else this.cancel();
          return;
        case 'Delete': e.preventDefault(); return;
        case ' ': e.preventDefault(); this.commit(c.sel, e.shiftKey && !this.isLiteral(c.raw) ? ZWNJ : ' '); return;   // Shift+Space = word + half-space, no space
        case 'Enter': e.preventDefault(); this.commit(c.sel, ' '); return;
        case 'Escape': e.preventDefault(); this.cancel(); return;
        case 'Tab': e.preventDefault(); this.move(e.shiftKey ? -1 : 1); return;
        case 'ArrowDown': case 'ArrowRight': e.preventDefault(); this.move(1); return;
        case 'ArrowUp': case 'ArrowLeft': e.preventDefault(); this.move(-1); return;
        case 'PageDown': e.preventDefault(); if (c.cands.length) this.select(Math.min(c.cands.length - 1, (c.page + 1) * ps)); return;
        case 'PageUp': e.preventDefault(); if (c.cands.length) this.select(Math.max(0, (c.page - 1) * ps)); return;
        default:
      }
      if (/^[1-9]$/.test(k)) {
        e.preventDefault();
        const i = c.page * ps + (+k - 1);
        if (i < c.cands.length) this.commit(i, this.s.autoSpace ? ' ' : '');
        return;
      }
      if (k === '0' && this.s.showLatin) {          // 0 = the typed Latin, as typed (the pinned last row)
        e.preventDefault();
        this.commit(c.cands.length, this.s.autoSpace ? ' ' : '');
        return;
      }
      if (k.length === 1) {                      // punctuation, '0', anything printable: commit, then type it
        const mapped = this.s.mapPunct && PUNCT[k];
        if (mapped || (this.s.persianDigits && /^[0-9]$/.test(k))) {
          e.preventDefault();
          this.commit(c.sel, mapped || PERSIAN_DIGITS[+k]);
        } else {
          this.commit(c.sel, '');                // the browser then inserts the key itself, after the committed word
        }
        return;
      }
      if (/^(Home|End|Shift|CapsLock|Control|Meta|Alt)$/.test(k)) return;   // modifiers: ignore
      this.finish();                            // any other key (F-keys, …): commit and let it act
    }

    // ------------------------------------------------------------------ undo / redo
    snapshot() { return { v: this.ta.value, s: this.ta.selectionStart, e: this.ta.selectionEnd }; }

    pushHist() {
      const sn = this.snapshot();
      const top = this.hist[this.hist.length - 1];
      if (top && top.v === sn.v && top.s === sn.s && top.e === sn.e) return;
      this.hist.push(sn);
      if (this.hist.length > 300) this.hist.shift();
      this.redoStack = [];
    }

    restore(sn) {
      const ta = this.ta;
      ta.value = sn.v;
      ta.setSelectionRange(sn.s, sn.e);
      this.lastProgrammatic = true;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }

    undo() {
      const prev = this.hist.pop();
      if (!prev) return;
      this.redoStack.push(this.snapshot());
      this.restore(prev);
    }

    redo() {
      const next = this.redoStack.pop();
      if (!next) return;
      this.hist.push(this.snapshot());
      this.restore(next);
    }

    // ------------------------------------------------------------------ composition lifecycle
    begin(ch) {
      const ta = this.ta;
      this.pushHist();
      this.lastProgrammatic = true;
      const start = ta.selectionStart, end = ta.selectionEnd;
      ta.setRangeText('', start, end, 'start');
      this.comp = { raw: ch, buf: ch.toLowerCase(), start, len: 0, cands: [], sel: 0, page: 0 };
      this.refresh();
    }

    insert(text) {
      const ta = this.ta;
      this.pushHist();
      this.lastProgrammatic = true;
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }

    setProvisional(text) {
      const c = this.comp;
      if (this.s.inlinePreview === false) text = '';
      this.ta.setRangeText(text, c.start, c.start + c.len, text ? 'select' : 'end');
      c.len = text.length;
    }

    /**
     * Split what was typed into the Finglish letters (`head`) and what follows them (`tail`), for the experiment `onlySpaceCommits`.
     * literal = true when letters or digits come AFTER a sign (e-mail, link): then it is text to keep, not Finglish to convert.
     * A tail made only of signs ("?", "!!", ".") stays attached to the Persian word instead.
     */
    parts(raw) {
      const head = /^[A-Za-z']*/.exec(raw)[0], tail = raw.slice(head.length);
      if (!this.s.onlySpaceCommits || !tail) return { head: raw, tail: '', literal: false };
      return { head, tail, literal: /[A-Za-z0-9]/.test(tail) };
    }

    isLiteral(raw) { return this.parts(raw).literal; }

    /** The signs typed after the word, as they will appear after the Persian word (? → ؟ when Persian punctuation is on). */
    tailText(raw) {
      const p = this.parts(raw);
      if (p.literal || !p.tail) return '';
      return this.s.mapPunct ? Array.from(p.tail).map(ch => PUNCT[ch] || ch).join('') : p.tail;
    }

    refresh() {
      const c = this.comp;
            const p = this.parts(c.raw);
      if (p.literal) { this.apply([]); return; }                  // nothing to convert: the engine is not asked
      const buf = p.head.toLowerCase();                           // only the letters are converted (the signs stay as typed)
      let r;
      try { r = this.host.provider(buf, this.ta.value.slice(0, c.start)); } catch (err) { r = []; console.error(err); }
      this.apply(r || []);
    }

    /** The typed text exactly as typed (capitals kept: it may be English); `buf` is its lower-case form for the engines. */
    setRaw(raw) {
      this.comp.raw = raw;
      this.comp.buf = raw.toLowerCase();
    }

    /** Number of selectable rows: the Persian candidates, plus the pinned Latin row (index = cands.length). */
    total() { return this.comp.cands.length + (this.s.showLatin ? 1 : 0); }

    /** Candidate at index i; the index just past the Persian ones is the typed Latin (also the fallback). */
    candAt(i) {
      const c = this.comp;
      const cand = c.cands[i];
      if (!cand) return { text: c.raw, kind: 'latin' };
      return Object.assign({}, cand, { base: cand.text, text: cand.text + this.tailText(c.raw) });   // what will be inserted: word + signs
    }

    apply(list) {
      const c = this.comp;
      c.cands = list.slice();
      c.sel = 0; c.page = 0;
      this.setProvisional(this.candAt(0).text);
      this.render();
    }

    move(d) {
      const n = this.total();
      if (n) this.select((this.comp.sel + d + n) % n);
    }

    select(i) {
      const c = this.comp;
      if (!this.total()) return;
      c.sel = i;
      if (i < c.cands.length) c.page = Math.floor(i / this.s.pageSize);   // the Latin row belongs to every page
      this.setProvisional(this.candAt(i).text);
      this.render();
    }

    commit(i, suffix) {
      const c = this.comp;
      const cand = this.candAt(i);
      const head = this.parts(c.raw).head.toLowerCase();         // the letters that were converted (what learning remembers)
      this.ta.setRangeText(cand.text + (suffix || ''), c.start, c.start + c.len, 'end');
      this.end();
      if (cand.kind !== 'latin' && this.host.onCommit) this.host.onCommit(head, { text: cand.base, kind: cand.kind });
      this.ta.dispatchEvent(new Event('input', { bubbles: true }));
    }

    cancel() {
      const c = this.comp;
      this.ta.setRangeText('', c.start, c.start + c.len, 'end');
      this.end();
    }

    /** Commit whatever is currently highlighted (focus loss, shortcuts, mode change, Persian typing switched off). */
    finish() {
      if (this.comp) this.commit(this.comp.sel, '');
    }

    /** Stop composing but leave the text in the box as is (user clicked elsewhere). */
    abandon() { if (this.comp) this.end(); }

    end() {
      this.comp = null;
      this.popup.hidden = true;
    }

    onSelectionChange() {
      const c = this.comp;
      if (!c || document.activeElement !== this.ta) return;
      if (this.ta.selectionStart !== c.start || this.ta.selectionEnd !== c.start + c.len) this.abandon();
    }

    onPopupMouse(e) {
      e.preventDefault();                          // keep focus (and the selection) in the textarea
      const li = e.target.closest('[data-i]');
      if (li && this.comp) { this.commit(+li.dataset.i, this.s.autoSpace ? ' ' : ''); this.ta.focus(); return; }
      const nav = e.target.closest('[data-nav]');
      if (nav && this.comp) {
        const ps = this.s.pageSize, c = this.comp;
        this.select(nav.dataset.nav === 'next' ? Math.min(c.cands.length - 1, (c.page + 1) * ps) : Math.max(0, (c.page - 1) * ps));
      }
    }

    // ------------------------------------------------------------------ popup rendering
    render() {
      const c = this.comp, p = this.popup;
      if (!c) { p.hidden = true; return; }
      const ps = this.s.pageSize;
      const pages = Math.max(1, Math.ceil(c.cands.length / ps));
      p.textContent = '';
      const head = document.createElement('div');
      head.className = 'cp-head';
      const buf = document.createElement('span');
      buf.className = 'cp-buf';
      buf.textContent = c.raw;
      head.appendChild(buf);
      const mode = document.createElement('span');
      mode.className = 'cp-mode';
      mode.textContent = this.isLiteral(c.raw) ? (FA ? 'همان‌طور که تایپ شد' : 'as typed') : '';
      head.appendChild(mode);
      p.appendChild(head);
      const ol = document.createElement('ol');
      ol.className = 'cp-list';
      const first = c.page * ps;
      c.cands.slice(first, first + ps).forEach((cand, k) => {
        const li = document.createElement('li');
        const idx = first + k;
        li.dataset.i = idx;
        li.className = (idx === c.sel ? 'sel ' : '') + 'k-' + cand.kind;
        const n = document.createElement('span'); n.className = 'cp-n'; n.textContent = this.s.persianDigits ? PERSIAN_DIGITS[k + 1] + '.' : (k + 1) + '.';
        const t = document.createElement('span'); t.className = 'cp-t'; t.textContent = this.candAt(idx).text;
        li.appendChild(n); li.appendChild(t);
        if (this.s.debug && cand.score !== undefined) {
          const d = document.createElement('span'); d.className = 'cp-d';
          d.textContent = cand.score.toFixed(1);
          li.appendChild(d);
        }
        ol.appendChild(li);
      });
      p.appendChild(ol);
      if (this.s.showLatin) {                      // the pinned last row: the typed Latin, key 0
        const row = document.createElement('div');
        row.className = 'cp-latin' + (c.sel === c.cands.length ? ' sel' : '');
        row.dataset.i = c.cands.length;
        row.title = FA ? 'نگه داشتن متن انگلیسی همان‌طور که تایپ شده (کلید صفر)' : 'Keep the English exactly as typed (key 0)';
        const n0 = document.createElement('span'); n0.className = 'cp-n'; n0.textContent = this.s.persianDigits ? PERSIAN_DIGITS[0] + '.' : '0.';
        const t0 = document.createElement('span'); t0.className = 'cp-t'; t0.textContent = c.raw;
        row.appendChild(n0); row.appendChild(t0);
        p.appendChild(row);
      }
      if (pages > 1) {
        const foot = document.createElement('div');
        foot.className = 'cp-foot';
        const prev = document.createElement('button'); prev.type = 'button'; prev.dataset.nav = 'prev'; prev.textContent = '‹'; prev.disabled = c.page === 0;
        const next = document.createElement('button'); next.type = 'button'; next.dataset.nav = 'next'; next.textContent = '›'; next.disabled = c.page >= pages - 1;
        const lab = document.createElement('span'); lab.textContent = (c.page + 1) + ' / ' + pages;
        foot.appendChild(prev); foot.appendChild(lab); foot.appendChild(next);
        p.appendChild(foot);
      }
      p.hidden = false;
      this.place();
    }

    place() {
      const c = this.comp, p = this.popup;
      if (!c || p.hidden) return;
      const pos = caretCoords(this.ta, c.start);
      p.style.left = '0px'; p.style.top = '0px';
      const w = p.offsetWidth, h = p.offsetHeight;
      const rtl = getComputedStyle(this.ta).direction === 'rtl';
      let x = rtl ? pos.left - w : pos.left;
      let y = pos.top + pos.height + 4;
      x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
      if (y + h > window.innerHeight - 8) y = Math.max(8, pos.top - h - 4);
      p.style.left = Math.round(x) + 'px';
      p.style.top = Math.round(y) + 'px';
    }
  }

  root.IMEController = IMEController;
})(window);
