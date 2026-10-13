// names.js - turning what the user typed into a layout file name.

const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

// Letters, digits, _ and - only (the server accepts exactly this, 1-64 characters); umlauts become ae, oe, ue, ss.
export function slugify(text) {
  const plain = String(text).trim().replace(/[äöüÄÖÜß]/g, (c) => UMLAUTS[c]);
  const slug = plain.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  return slug || 'aufbau';
}
