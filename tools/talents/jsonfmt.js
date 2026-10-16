'use strict';
// JSON text in the data files' own style: 2-space indent, and anything that fits in 80 columns stays on
// one line ({ "id": "core", "name": "Stray" } with spaces inside braces, ["a", "b"] without).
(function (root) {
  function inline(v) {
    if (Array.isArray(v)) return '[' + v.map(inline).join(', ') + ']';
    if (v && typeof v === 'object') {
      const ks = Object.keys(v).filter((k) => v[k] !== undefined);
      return ks.length ? '{ ' + ks.map((k) => JSON.stringify(k) + ': ' + inline(v[k])).join(', ') + ' }' : '{}';
    }
    return JSON.stringify(v);
  }
  // reserved: what else shares the line (the key in front, a comma after)
  function fmt(v, indent, reserved, max) {
    const one = inline(v);
    if (one === undefined) return one;
    if (indent.length + reserved + one.length <= max || v === null || typeof v !== 'object') return one;
    const next = indent + '  ';
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      return '[\n' + v.map((x, i) => next + fmt(x, next, i < v.length - 1 ? 1 : 0, max)).join(',\n') + '\n' + indent + ']';
    }
    const ks = Object.keys(v).filter((k) => v[k] !== undefined);
    if (!ks.length) return '{}';
    return '{\n' + ks.map((k, i) => { const key = JSON.stringify(k) + ': '; return next + key + fmt(v[k], next, key.length + (i < ks.length - 1 ? 1 : 0), max); }).join(',\n') + '\n' + indent + '}';
  }
  const pretty = (v, max = 80) => fmt(v, '', 0, max) + '\n';
  if (typeof module !== 'undefined' && module.exports) module.exports = pretty;
  else root.prettyJSON = pretty;
})(this);
