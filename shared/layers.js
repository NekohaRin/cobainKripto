// Super-enkripsi 3 lapis (isomorfik: browser dan Node 20+): Caesar -> Rail Fence -> AES-256-GCM.
// Klasik hanya mengubah huruf A-Z/a-z; spasi, koma, petik, angka tetap di tempatnya.
(function (root) {
  const wc = root.crypto || require('node:crypto').webcrypto, subtle = wc.subtle;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = u => btoa(String.fromCharCode(...u)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const ITER = 100000;

  // Lapis 1: Caesar dengan geseran kustom
  const caesar = (t, s, d) => [...t].map(c => {
    const m = /[A-Z]/.test(c) ? 65 : /[a-z]/.test(c) ? 97 : 0;
    return m ? String.fromCharCode((((c.charCodeAt(0) - m + (d ? -s : s)) % 26) + 26) % 26 + m) : c;
  }).join('');

  // Lapis 2: Rail Fence (zig-zag) pada urutan huruf saja
  function railOrder(n, rails) {
    const rows = Array.from({ length: rails }, () => []); let r = 0, dir = 1;
    for (let i = 0; i < n; i++) { rows[r].push(i); if (rails > 1) { if (r === 0) dir = 1; else if (r === rails - 1) dir = -1; r += dir; } }
    return rows.flat();
  }
  function rail(t, rails, d) {
    rails = Math.max(2, rails | 0);
    const ch = [...t], pos = []; ch.forEach((c, i) => /[A-Za-z]/.test(c) && pos.push(i));
    const L = pos.map(i => ch[i]), res = [];
    railOrder(L.length, rails).forEach((src, k) => { if (d) res[src] = L[k]; else res[k] = L[src]; });
    pos.forEach((p, k) => { ch[p] = res[k]; });
    return ch.join('');
  }

  // Lapis 3: AES-256-GCM, kunci dari PBKDF2 (100.000 iterasi). Paket Base64: salt|iv|ct+tag
  async function key(pass, salt) {
    const base = await subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function aesEncrypt(text, pass) {
    const salt = wc.getRandomValues(new Uint8Array(16)), iv = wc.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt), enc.encode(text)));
    const o = new Uint8Array(28 + ct.length); o.set(salt); o.set(iv, 16); o.set(ct, 28); return b64(o);
  }
  async function aesDecrypt(pkg, pass) {
    const u = unb64(pkg);
    try { return dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: u.slice(16, 28) }, await key(pass, u.slice(0, 16)), u.slice(28))); }
    catch { throw new Error('Dekripsi gagal: kunci salah atau data diubah.'); }
  }

  // steps = baris tabel Step-by-Step Breakdown per karakter (untuk UI)
  async function superEncrypt(text, { shift, rails, pass }) {
    const c1 = caesar(text, shift, false), c2 = rail(c1, rails, false), pkg = await aesEncrypt(c2, pass);
    const a = [...text], b = [...c1], c = [...c2];
    return { package: pkg, layers: { caesar: c1, rail: c2, aes: pkg },
      steps: a.map((p, i) => ({ i, plain: p, caesar: b[i], rail: c[i] })) };
  }
  async function superDecrypt(pkg, { shift, rails, pass }) {
    return caesar(rail(await aesDecrypt(pkg, pass), rails, true), shift, true);
  }
  const api = { caesar, rail, aesEncrypt, aesDecrypt, superEncrypt, superDecrypt };
  if (typeof module !== 'undefined') module.exports = api; else root.Layers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
