// .secure = RC4 (+ RC4-drop 768) dengan HMAC-SHA256 (encrypt-then-MAC).
// Format: "RC4S" | ver(1) | salt(16) | RC4( namaLen(2) | nama | data ) | HMAC(32) atas seluruh byte sebelumnya.
// Kunci RC4 (16 B) dan kunci HMAC (32 B) berasal dari PBKDF2-SHA256 100.000 iterasi atas passphrase + salt.
const SEC = { MAGIC: [0x52, 0x43, 0x34, 0x53], VER: 1, DROP: 768, ITER: 100000, MAX: 10 * 1024 * 1024 };
const hex = u => [...u].map(x => x.toString(16).padStart(2, '0')).join('');
const bin = n => n.toString(2).padStart(8, '0');

async function secKeys(pass, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const k = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: SEC.ITER, hash: 'SHA-256' }, base, 384));
  return { rc4: k.slice(0, 16), mac: k.slice(16) };
}
async function secMac(macKey, data) {
  const k = await crypto.subtle.importKey('raw', macKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
// KSA + PRGA + XOR. tr (opsional) mengisi tabel breakdown.
function rc4(key, data, tr) {
  const S = new Uint8Array(256); for (let i = 0; i < 256; i++) S[i] = i;
  if (tr) tr.sBefore = hex(S.slice(0, 16));
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
  if (tr) tr.sAfter = hex(S.slice(0, 16));
  let a = 0, b = 0;
  const next = () => { a = (a + 1) & 255; b = (b + S[a]) & 255; [S[a], S[b]] = [S[b], S[a]]; return S[(S[a] + S[b]) & 255]; };
  for (let n = 0; n < SEC.DROP; n++) next();
  const out = new Uint8Array(data.length);
  for (let n = 0; n < data.length; n++) { const ks = next(); out[n] = data[n] ^ ks; if (tr && n < 10) tr.rows.push({ n, i: data[n], k: ks, o: out[n] }); }
  return out;
}
async function secureEncrypt(file, pass) {
  if (file.size > SEC.MAX) throw new Error('Maksimal 10 MB.');
  const name = new TextEncoder().encode(file.name), data = new Uint8Array(await file.arrayBuffer());
  const plain = new Uint8Array(2 + name.length + data.length);
  plain[0] = name.length >> 8; plain[1] = name.length & 255; plain.set(name, 2); plain.set(data, 2 + name.length);
  const salt = crypto.getRandomValues(new Uint8Array(16)), keys = await secKeys(pass, salt), tr = { rows: [] };
  const ct = rc4(keys.rc4, plain, tr);
  const body = new Uint8Array(21 + ct.length); body.set(SEC.MAGIC); body[4] = SEC.VER; body.set(salt, 5); body.set(ct, 21);
  const tag = await secMac(keys.mac, body), out = new Uint8Array(body.length + 32); out.set(body); out.set(tag, body.length);
  Object.assign(tr, { file: file.name, size: data.length, total: out.length, salt: hex(salt), rc4Key: hex(keys.rc4), macKey: hex(keys.mac.slice(0, 8)) + '...', tag: hex(tag), header: hex(body.slice(0, 5)) });
  return { bytes: out, trace: tr };
}
async function secureDecrypt(buf, pass) {
  const u = new Uint8Array(buf);
  if (u.length < 53 || !SEC.MAGIC.every((v, i) => u[i] === v) || u[4] !== SEC.VER) throw new Error('Bukan berkas .secure yang valid.');
  const salt = u.slice(5, 21), body = u.slice(0, -32), tag = u.slice(-32), keys = await secKeys(pass, salt), want = await secMac(keys.mac, body);
  let diff = 0; for (let i = 0; i < 32; i++) diff |= want[i] ^ tag[i];
  if (diff) throw new Error('Integritas gagal: kunci salah atau berkas diubah.');
  const tr = { rows: [] }, plain = rc4(keys.rc4, u.slice(21, -32), tr), nl = (plain[0] << 8) | plain[1];
  Object.assign(tr, { file: new TextDecoder().decode(plain.slice(2, 2 + nl)), size: plain.length - 2 - nl, total: u.length, salt: hex(salt), rc4Key: hex(keys.rc4), macKey: hex(keys.mac.slice(0, 8)) + '...', tag: hex(tag), header: hex(u.slice(0, 5)) });
  return { name: tr.file, data: plain.slice(2 + nl), trace: tr };
}
