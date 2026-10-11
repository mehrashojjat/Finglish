'use strict';
/** Input / output normalisation. Persian side mirrors tools/fa_text.py (keep in sync). */
const { ZWNJ } = require('./alphabet');

/** Latin side: what the user typed -> [a-z']+ with 3+ repeats squeezed to 2 ("khoooobi" -> "khoobi"). */
function normalizeLatin(s) {
  s = String(s).toLowerCase()
    .replace(/[’‘`´ʼʻ]/g, "'")
    .normalize('NFKD').replace(/[̀-ͯ]/g, '');       // á -> a
  s = s.replace(/[^a-z']/g, '');
  return s.replace(/(.)\1{2,}/g, '$1$1');
}

const MAP = { 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ە': 'ه', 'ۀ': 'ه', 'ة': 'ه' };
const STRIP = /[ً-ٰٟـ‎‏‪-‮⁦-⁩﻿]/g;
function normalizePersian(s) {
  return String(s).normalize('NFKC').replace(STRIP, '').replace(/[يىكەۀة]/g, c => MAP[c] || c);
}

const stripZwnj = s => s.split(ZWNJ).join('');

module.exports = { normalizeLatin, normalizePersian, stripZwnj };
