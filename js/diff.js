/* 逐词对齐：把"学员朗读的识别文本"与"目标文本"做词级 diff，
 * 输出 match / wrong(读错) / missing(漏读) 三类标注。
 * 纯函数模块，浏览器与 Node 通用（Node 下用于单元测试）。 */
(function (root) {
  'use strict';

  // 归一化：小写、统一撇号、去掉首尾标点
  function normalize(word) {
    return (word || '')
      .toLowerCase()
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
  }

  // 把一段文本切成 token：{ raw, norm }，保留段落信息由调用方处理
  function tokenize(text) {
    var tokens = [];
    String(text || '').split(/\s+/).forEach(function (raw) {
      if (raw) tokens.push({ raw: raw, norm: normalize(raw) });
    });
    return tokens;
  }

  // LCS 对齐，然后对相邻的"漏读+多余"配对成 wrong（替换对）
  function align(targetTokens, spokenTokens) {
    var n = targetTokens.length, m = spokenTokens.length;
    var dp = [];
    for (var i = 0; i <= n; i++) { dp.push(new Array(m + 1).fill(0)); }
    for (var i2 = n - 1; i2 >= 0; i2--) {
      for (var j2 = m - 1; j2 >= 0; j2--) {
        dp[i2][j2] = targetTokens[i2].norm === spokenTokens[j2].norm
          ? dp[i2 + 1][j2 + 1] + 1
          : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
      }
    }

    var ops = [];
    var i3 = 0, j3 = 0;
    while (i3 < n && j3 < m) {
      if (targetTokens[i3].norm === spokenTokens[j3].norm) {
        ops.push({ type: 'match', target: targetTokens[i3], spoken: spokenTokens[j3], ti: i3 });
        i3++; j3++;
      } else if (dp[i3 + 1][j3] >= dp[i3][j3 + 1]) {
        ops.push({ type: 'missing', target: targetTokens[i3], ti: i3 });
        i3++;
      } else {
        ops.push({ type: 'extra', spoken: spokenTokens[j3] });
        j3++;
      }
    }
    while (i3 < n) { ops.push({ type: 'missing', target: targetTokens[i3], ti: i3 }); i3++; }
    while (j3 < m) { ops.push({ type: 'extra', spoken: spokenTokens[j3] }); j3++; }

    // 后处理：把 extra（多出来的识别词）与相邻 missing 中拼写最相近的配成 wrong（读成了别的词）。
    // 典型场景：连读 "cup of"→"cupof"、"coffee" 识别成 "toffee"。
    var merged = ops.slice();
    var changed = true;
    while (changed) {
      changed = false;
      for (var k = 0; k < merged.length; k++) {
        if (merged[k].type !== 'extra') continue;
        var cands = [], idx, count;
        // 向左/向右各扫描一段连续 missing（最多 3 个），取拼写最相近的配对
        idx = k - 1; count = 0;
        while (idx >= 0 && merged[idx].type === 'missing' && count < 3) {
          cands.push({ idx: idx, op: merged[idx], dist: similarity(merged[idx].target.norm, merged[k].spoken.norm) });
          idx--; count++;
        }
        idx = k + 1; count = 0;
        while (idx < merged.length && merged[idx].type === 'missing' && count < 3) {
          cands.push({ idx: idx, op: merged[idx], dist: similarity(merged[idx].target.norm, merged[k].spoken.norm) });
          idx++; count++;
        }
        cands.sort(function (a, b) { return a.dist - b.dist; });
        if (cands.length && cands[0].dist <= 3) {
          var best = cands[0];
          merged[best.idx] = { type: 'wrong', target: best.op.target, spoken: merged[k].spoken, ti: best.op.ti };
          merged.splice(k, 1);
          changed = true;
          break;
        }
      }
    }
    return merged;
  }

  // 相似度：0 相同；前缀包含（连读合并）算 1；否则取编辑距离（上限截断）
  function similarity(a, b) {
    if (a === b) return 0;
    if (a.indexOf(b) === 0 || b.indexOf(a) === 0) return 1;
    return levenshtein(a, b, 4);
  }

  function levenshtein(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    var prev = [], curr = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (j = 1; j <= b.length; j++) {
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      var tmp = prev; prev = curr; curr = tmp;
    }
    return prev[b.length];
  }

  function compare(targetText, spokenText) {
    var target = tokenize(targetText);
    var spoken = tokenize(spokenText);
    var ops = align(target, spoken);
    var match = 0, wrong = [], missing = [], extra = [];
    ops.forEach(function (op) {
      if (op.type === 'match') match++;
      else if (op.type === 'wrong') wrong.push(op);
      else if (op.type === 'missing') missing.push(op);
      else extra.push(op);
    });
    var score = target.length ? Math.round((match / target.length) * 100) : 0;
    return {
      ops: ops, target: target, spoken: spoken,
      score: score, matched: match,
      wrong: wrong, missing: missing, extra: extra
    };
  }

  var api = { normalize: normalize, tokenize: tokenize, align: align, compare: compare };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WordDiff = api;
})(typeof window !== 'undefined' ? window : globalThis);
