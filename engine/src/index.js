'use strict';
/** Public surface of the offline engine. Everything else is internal. */
const { Engine, DEFAULTS } = require('./engine');
const { Lexicon } = require('./lexicon');
const { normalizeLatin, normalizePersian, stripZwnj } = require('./normalize');
const { createChannel, DEFAULT_PARAMS } = require('./channel');

const host = require('./host');

module.exports = { host, Engine, Lexicon, DEFAULTS, DEFAULT_PARAMS, createChannel, normalizeLatin, normalizePersian, stripZwnj };
