const TRANSLIT_MAP = [
  ['shch', 'щ'], ['sh', 'ш'], ['ch', 'ч'], ['ts', 'ц'], ['kh', 'х'], ['zh', 'ж'],
  ['yo', 'ё'], ['yu', 'ю'], ['ya', 'я'], ['ye', 'е'],
  ['oe', 'ө'], ['ue', 'ү'],
  ['iin', 'ийн'], ['iig', 'ийг'], ['iih', 'ийх'],
  ['uu', 'уу'], ['oo', 'оо'], ['aa', 'аа'], ['ee', 'ээ'], ['ii', 'ий'],
  ['ai', 'ай'], ['oi', 'ой'], ['ei', 'эй'], ['ui', 'уй'],
];
const SINGLE_MAP = {
  a: 'а', b: 'б', c: 'ц', d: 'д', e: 'э', f: 'ф', g: 'г', h: 'х',
  i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
  q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х',
  y: 'й', z: 'з', ö: 'ө', ü: 'ү',
};

function isMostlyLatin(text) {
  const letters = text.match(/[A-Za-zА-Яа-яЀ-ӿ]/g) || [];
  if (letters.length === 0) return false;
  const cyrillic = text.match(/[Ѐ-ӿ]/g) || [];
  return cyrillic.length / letters.length < 0.3;
}

function transliterate(text) {
  if (!isMostlyLatin(text)) return text;
  let out = '';
  let i = 0;
  const lower = text.toLowerCase();
  while (i < text.length) {
    let matched = false;
    for (const [latin, cyr] of TRANSLIT_MAP) {
      if (lower.startsWith(latin, i)) {
        const upper = text[i] === text[i].toUpperCase() && /[A-Z]/.test(text[i]);
        out += upper ? cyr[0].toUpperCase() + cyr.slice(1) : cyr;
        i += latin.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const ch = text[i];
    const lc = ch.toLowerCase();
    if (SINGLE_MAP[lc]) {
      const cyr = SINGLE_MAP[lc];
      out += (ch !== lc) ? cyr.toUpperCase() : cyr;
    } else {
      out += ch;
    }
    i++;
  }
  return out;
}

module.exports = { isMostlyLatin, transliterate };
