'use strict';
/**
 * Host API: the whole engine as a handful of functions that take and return PLAIN STRINGS.
 *
 * Why: every non-JS host (Swift JSContext, Kotlin/Rhino, C++ …) bridges strings trivially and objects painfully. A macOS
 * input method, an iOS keyboard or the website all call exactly this, so there is one behaviour to tune and test.
 *
 *   FarsiIME.host.init(lexiconTsv, bigramsTsv, aliasesTsv, optionsJson) -> '{"words":292057}'   (once, ≈0.5 s; the TSVs are the files in engine/dist/)
 *   FarsiIME.host.candidates(latin, prevText, max)                      -> '[{"text":"سلام","kind":"lex","score":-4.713}, …]'
 *   FarsiIME.host.learn(latin, persian)                                  remember a choice
 *   FarsiIME.host.exportUserData() / importUserData(json)                persist / restore learned choices ('[["salam|سلام",2], …]')
 *   FarsiIME.host.setUserAliases(text)                                   "latin<TAB>persian|persian2" lines
 *   FarsiIME.host.setOptions(json)                                       e.g. '{"zwnj":"auto"}' — anything in engine DEFAULTS
 * `prevText` may be '' / null; the engine takes the last Persian word of it as context.
 */
const { Engine } = require('./engine');

let engine = null;
const need = () => { if (!engine) throw new Error('FarsiIME.host.init() has not been called'); return engine; };
const nz = s => (s === null || s === undefined || s === '' ? null : String(s));

function init(lexiconTsv, bigramsTsv, aliasesTsv, optionsJson) {
  const opts = optionsJson ? JSON.parse(optionsJson) : {};
  engine = Engine.fromTSV(String(lexiconTsv), opts);
  if (nz(aliasesTsv)) engine.setAliases(String(aliasesTsv));
  if (nz(bigramsTsv)) engine.setBigrams(String(bigramsTsv));
  return JSON.stringify({ words: engine.lex.words.length });
}

function candidates(latin, prevText, max) {
  const r = need().candidates(String(latin), { max: max > 0 ? max : 9, prev: nz(prevText) });
  return JSON.stringify(r.map(c => ({ text: c.text, kind: c.kind, score: Math.round(c.score * 1000) / 1000 })));
}

function learn(latin, persian) { need().learn(String(latin), String(persian)); }
function exportUserData() { return JSON.stringify(need().exportUserData()); }
function importUserData(json) { need().importUserData(JSON.parse(json || '[]')); }
function setUserAliases(text) { need().setUserAliases(String(text || '')); }
function setOptions(json) { need().setOptions(JSON.parse(json || '{}')); }

module.exports = { init, candidates, learn, exportUserData, importUserData, setUserAliases, setOptions };
