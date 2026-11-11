// Dongle = berkas .key di flashdisk. Dibuka lewat File System Access API (Chrome/Edge, HTTPS atau localhost).
// Browser menyimpan handle berkas, lalu membaca ulang tiap beberapa detik. Flashdisk dicabut = pembacaan gagal.
// Pemilih : {voterCode, token, nikMask}   Panitia : {role:'admin', token}
const DONGLE_TYPES = [{ description: 'Dongle E-Voting (.key)', accept: { 'application/octet-stream': ['.key'] } }];
const needFsApi = () => { if (!window.showOpenFilePicker || !window.showSaveFilePicker) throw new Error('Browser ini tidak mendukung akses flashdisk. Gunakan Chrome atau Edge versi terbaru lewat HTTPS.'); };
const isHex64 = t => typeof t === 'string' && /^[0-9a-f]{64}$/.test(t);
function parseDongle(raw, role) {
  let rec; try { rec = JSON.parse(raw); } catch { throw new Error('Berkas .key rusak.'); }
  if (!rec || !isHex64(rec.token)) throw new Error('Format dongle tidak valid.');
  if (role === 'admin') { if (rec.role !== 'admin') throw new Error('Ini bukan dongle panitia.'); }
  else if (!/^V\d{6}$/.test(rec.voterCode) || (rec.nikMask !== undefined && !/^[\d*]{16}$/.test(rec.nikMask))) throw new Error('Format dongle pemilih tidak valid.');
  return rec;
}
// Pilih berkas .key di flashdisk. Mengembalikan {handle, rec, name}.
async function pickDongle(role) {
  needFsApi();
  let h; try { [h] = await window.showOpenFilePicker({ types: DONGLE_TYPES, multiple: false }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'Pemilihan dongle dibatalkan.' : 'Dongle tidak bisa dibuka: ' + e.message); }
  const f = await h.getFile();
  return { handle: h, rec: parseDongle(await f.text(), role), name: f.name };
}
// Baca ulang dari flashdisk. Gagal (dicabut, berubah, atau tidak terbaca) = lempar error.
async function rereadDongle(handle, role) { return parseDongle(await (await handle.getFile()).text(), role); }
// Minta lokasi simpan (flashdisk) SEBELUM registrasi, lalu tulis isinya setelah server membuat token.
async function chooseDongleTarget() {
  needFsApi();
  try { return await window.showSaveFilePicker({ suggestedName: 'dongle-evoting.key', types: DONGLE_TYPES }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'Pilih lokasi flashdisk untuk menyimpan dongle.' : 'Lokasi dongle tidak bisa dibuka: ' + e.message); }
}
async function writeDongle(handle, rec) { const w = await handle.createWritable(); await w.write(JSON.stringify(rec)); await w.close(); }
async function discardDongleTarget(handle) { try { await handle.remove(); } catch { /* browser lama: berkas kosong dibiarkan */ } }
// Bukti kehadiran: HMAC-SHA256(kunci = token dari berkas, pesan = nonce dari server), hex.
async function dongleProof(token, nonce) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(nonce)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
