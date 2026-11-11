// Steganografi domain frekuensi: DCT 8x8 pada luminans. Satu bit disandikan oleh urutan koefisien
// C[3][4] vs C[4][3] (selisih >= MARGIN), diulang REPEAT blok dan dibaca dengan suara mayoritas
// sehingga lebih tahan kompresi JPEG dibanding LSB. Header: panjang pesan 16 bit.
const DCT_MARGIN = 25, DCT_REPEAT = 3;
const _T = Array.from({ length: 8 }, (_, u) => Array.from({ length: 8 }, (_, x) => (u ? 0.5 : Math.sqrt(1 / 8)) * Math.cos((2 * x + 1) * u * Math.PI / 16)));
const _mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
const _tr = A => A[0].map((_, j) => A.map(r => r[j]));
const fdct = b => _mul(_mul(_T, b), _tr(_T)), idct = c => _mul(_mul(_tr(_T), c), _T);

function _load(img) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  return { c, x, d, p: d.data, W: c.width, bw: c.width >> 3, bh: c.height >> 3 };
}
const _pos = (L, n) => [Math.floor(n / L.bw) * 8, (n % L.bw) * 8]; // [y, x]
function _lum(L, n) {
  const [by, bx] = _pos(L, n);
  return Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => {
    const k = ((by + i) * L.W + bx + j) * 4; return 0.299 * L.p[k] + 0.587 * L.p[k + 1] + 0.114 * L.p[k + 2] - 128;
  }));
}
function embedDCT(img, message, format = 'image/png') {
  const L = _load(img), body = new TextEncoder().encode(message), bits = [];
  if (body.length > 65535) throw new Error('Pesan terlalu panjang.');
  [body.length >> 8, body.length & 255, ...body].forEach(b => { for (let k = 7; k >= 0; k--) bits.push((b >> k) & 1); });
  if (bits.length * DCT_REPEAT > L.bw * L.bh) throw new Error('Kapasitas gambar tidak cukup.');
  for (let n = 0; n < bits.length * DCT_REPEAT; n++) {
    const bit = bits[Math.floor(n / DCT_REPEAT)], Y = _lum(L, n), C = fdct(Y), d = C[3][4] - C[4][3];
    if (bit && d < DCT_MARGIN) { const a = (DCT_MARGIN - d) / 2; C[3][4] += a; C[4][3] -= a; }
    if (!bit && d > -DCT_MARGIN) { const a = (d + DCT_MARGIN) / 2; C[3][4] -= a; C[4][3] += a; }
    const Y2 = idct(C), [by, bx] = _pos(L, n);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const k = ((by + i) * L.W + bx + j) * 4, dY = Y2[i][j] - Y[i][j];
      for (let ch = 0; ch < 3; ch++) L.p[k + ch] = Math.max(0, Math.min(255, Math.round(L.p[k + ch] + dY)));
    }
  }
  L.x.putImageData(L.d, 0, 0);
  return L.c.toDataURL(format, 0.85);
}
function extractDCT(img) {
  const L = _load(img), diff = n => { const C = fdct(_lum(L, n)); return C[3][4] - C[4][3]; };
  const bit = i => { let s = 0; for (let r = 0; r < DCT_REPEAT; r++) s += diff(i * DCT_REPEAT + r) > 0 ? 1 : -1; return s > 0 ? 1 : 0; };
  const byte = i => { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | bit(i * 8 + k); return v; };
  const len = (byte(0) << 8) | byte(1);
  if (!len || (len + 2) * 8 * DCT_REPEAT > L.bw * L.bh) throw new Error('Pesan DCT tidak ditemukan.');
  return new TextDecoder().decode(Uint8Array.from({ length: len }, (_, i) => byte(i + 2)));
}
