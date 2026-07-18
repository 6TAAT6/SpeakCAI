// ===== 音素→字母模式映射 =====
// 用于将 ISE 返回的音素分数映射到用户文本中的单词，实现发音高亮。
// 每个音素对应其常见的英文字母拼写模式。

interface PhoneScore {
  phoneme: string;
  score: number;
}

interface WordScore {
  word: string;
  score: number; // 0-100, -1 表示无数据
  weakPhonemes: string[];
}

// 音素 → 正则（匹配单词中的子串）
const PHONEME_GRAPHEME: Record<string, RegExp> = {
  // 元音
  iy: /(ea|ee|ie|ei|e_e|ey|i_e)/i,
  ih: /(i[^ghn]|y[^aeiou]|e[^e])/i,
  ae: /(a[^eiruwy])/i,
  aa: /(o[^aeiouwy]|a[^eiy]|au|aw|al)/i,
  ao: /(aw|au|or|ore|our|oar|oor|ough)/i,
  uh: /(oo[^r]|ou|u[^aeiorwxy])/i,
  uw: /(oo|ou|u_e|ue|ui|ew|o[^aeiouw])/i,
  eh: /(e[^aeiouwyr]|ea[^r])/i,
  er: /(er|ir|ur|ear|or[^aeiouw])/i,
  ah: /(u[^aeiow]|o[^aeiouwyr]|ou[^g]|oo)/i,
  ey: /(ai|ay|a_e|ea|ei|ey|a[^eiruwy])/i,
  ay: /(ai|ay|i_e|ie|igh|y_e|y)/i,
  oy: /(oi|oy)/i,
  aw: /(ow|ou)/i,
  ow: /(ow|oa|o_e|oe|ough|o[^aeiouwyr])/i,

  // 辅音
  p: /\bp|\bp{2}|p\b|pp/i,
  b: /\bb|bb/i,
  t: /\bt|t{2}|\bt{2}|t\b|tt/i,
  d: /\bd|dd/i,
  k: /\bk|ck|c[^eiy]|ch(?!e|i)|qu/i,
  g: /\bg|gg|gh/i,
  f: /\bf|ff|ph|gh\b/i,
  v: /\bv|vv|\bv\b/i,
  th: /th/i,
  dh: /th[^aeiou]/i,
  s: /\bs|ss|c[iey]/i,
  z: /\bz|zz|s[eiy]/i,
  sh: /sh|ch[ao]|ti[oa]n|s[si]on/i,
  zh: /s[io]n|ge\b|si[oa]n/i,
  ch: /ch|tch|tu[re]/i,
  jh: /\bj|ge|gi|dge/i,
  l: /\bl|ll/i,
  r: /\br|rr|wr|rh/i,
  m: /\bm|mm|mb\b/i,
  n: /\bn|nn|kn|gn\b/i,
  ng: /ng|n[k]/i,
  w: /\bw|wh/i,
  y: /\by(?!ou)|y[i]/i,
  hh: /\bh(?!o)/i,
};

/** 去除 ARPAbet 重音标记（尾数 0/1/2），讯飞 ISE 返回如 "iy1" 而非 "iy" */
function stripStress(phoneme: string): string {
  return phoneme.replace(/[012]$/, '');
}

/**
 * 给定文本和音素分数，返回每个单词的发音评分。
 * 评分 = 该单词包含的所有音素的最低分。无匹配音素返回 -1。
 */
export function scoreWords(text: string, phoneScores: PhoneScore[]): WordScore[] {
  if (!phoneScores || phoneScores.length === 0) {
    return text.split(/\s+/).filter(Boolean).map(w => ({ word: w, score: -1, weakPhonemes: [] }));
  }

  // 构建音素→分数映射（key 已去重音标记，同一音素取最低分）
  const scoreMap = new Map<string, number>();
  for (const ps of phoneScores) {
    const key = stripStress(ps.phoneme);
    const existing = scoreMap.get(key);
    if (existing === undefined || ps.score < existing) {
      scoreMap.set(key, ps.score);
    }
  }

  // 弱音素集合（分数 < 70，key 已去重音标记）
  const weakSet = new Set(
    phoneScores.filter(ps => ps.score < 70).map(ps => stripStress(ps.phoneme)).filter(Boolean),
  );

  const words = text.split(/(\s+)/); // 保留空格
  const result: WordScore[] = [];

  for (const token of words) {
    if (/^\s+$/.test(token) || token === '') {
      result.push({ word: token, score: -1, weakPhonemes: [] });
      continue;
    }

    // 清理标点符号用于音素匹配
    const clean = token.replace(/[^a-zA-Z']/g, '').toLowerCase();

    let minScore = -1;
    const matchedWeak: string[] = [];

    for (const [phoneme, re] of Object.entries(PHONEME_GRAPHEME)) {
      if (re.test(clean)) {
        const score = scoreMap.get(phoneme); // phoneme key 本就无重音标记
        if (score !== undefined) {
          if (minScore === -1 || score < minScore) {
            minScore = score;
          }
          if (weakSet.has(phoneme) && !matchedWeak.includes(phoneme)) {
            matchedWeak.push(phoneme);
          }
        }
      }
    }

    result.push({ word: token, score: minScore, weakPhonemes: matchedWeak });
  }

  return result;
}

/** 根据分数返回 CSS 类名 */
export function scoreColorClass(score: number): string {
  if (score < 0) return '';
  if (score < 60) return 'word-bad';
  if (score < 75) return 'word-weak';
  return 'word-good';
}
