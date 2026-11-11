// Orkestrator UI: peran Pemilih vs Panitia, login 3FA, voting, super-enkripsi, file vault, DCT, dashboard.
const $ = id => document.getElementById(id);
const S = { session: null, role: null, voter: null, nik: '', voted: false, votedAt: null, block: null, params: null, idle: null, dongle: null, beat: null, nonce: null };
let pickedVoter = null, pickedAdmin = null;
let chart, dashTimer, lastSecure = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const vis = c => (c === ' ' ? '␣' : c);
const say = (id, t, ok = true) => { $(id).textContent = t; $(id).className = 'msg ' + (ok ? 'ok' : 'bad'); };
const toast = (t, ok = true) => { const d = document.createElement('div'); d.className = 'toast' + (ok ? '' : ' bad'); d.textContent = t; $('toasts').append(d); setTimeout(() => d.remove(), 4000); };
const table = (head, rows) => `<div class="tw"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const guard = (id, fn) => async () => { try { await fn(); } catch (e) { const m = e.message || String(e); say(id, m, false); toast(m, false); } };
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
const scan = (id, n) => captureFace($('cam'), { canvas: $('camOverlay'), onStatus: t => say(id, t), samples: n });
const loadImg = f => new Promise((res, rej) => { const u = URL.createObjectURL(f), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => rej(new Error('Gambar tidak valid.')); i.src = u; });

async function api(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (S.session) h.Authorization = 'Bearer ' + S.session;
  if (body && !raw) h['Content-Type'] = 'application/json';
  const r = await fetch(path, { method, headers: h, body: body && (raw ? body : JSON.stringify(body)) });
  if (r.status === 401 && S.session) lock('Sesi tidak valid. Silakan login ulang.');
  if (!(r.headers.get('content-type') || '').includes('json')) { if (!r.ok) throw new Error('Permintaan gagal.'); return r; }
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Permintaan gagal.'); return j;
}

// ----- navigasi berdasarkan peran -----
const TABS = { voter: ['vote', 'status'], admin: ['text', 'file', 'stego', 'dash'] };
const allowed = () => TABS[S.role] || ['gate'];
function refreshNav() { document.querySelectorAll('nav button').forEach(b => { b.hidden = !allowed().includes(b.dataset.t); }); }
function show(t) {
  if (!allowed().includes(t)) t = allowed()[0];
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === t));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.t));

// ----- pembersihan state total -----
function resetGate() {
  ['regNik', 'regPin', 'loginPin', 'adminKey'].forEach(i => { $(i).value = ''; });
  pickedVoter = pickedAdmin = null; $('dongleName').textContent = ''; $('adminDongleName').textContent = '';
  ['msgReg', 'msgLogin', 'msgAdmin'].forEach(i => { $(i).textContent = ''; $(i).className = 'msg'; });
}
function clearWork() {
  ['txtIn', 'txtPkg', 'txtPass', 'fileIn', 'filePass', 'secIn', 'secPass', 'imgIn', 'stegoMsg', 'stegoOut'].forEach(i => { $(i).value = ''; });
  ['txtTrace', 'txtDecTrace', 'fileTrace', 'decTrace', 'docList', 'dashStat', 'blocks', 'statusBox', 'statusTrace', 'candList'].forEach(i => { $(i).innerHTML = ''; });
  ['msgTxt', 'msgTxtDec', 'msgFile', 'msgSecDec', 'msgStego', 'msgDash', 'msgVote'].forEach(i => { $(i).textContent = ''; $(i).className = 'msg'; });
  chart?.destroy(); chart = null; clearInterval(dashTimer); $('autoDash').checked = false; lastSecure = null; $('btnVote').disabled = false;
}
// ----- bukti kehadiran dongle: baca ulang berkas di flashdisk dan lapor ke server tiap 2 detik -----
function stopBeat() { clearInterval(S.beat); S.beat = null; S.dongle = null; S.nonce = null; }
function startBeat(role, handle, token, nonce) {
  stopBeat(); S.dongle = { role, handle, token }; S.nonce = nonce; let busy = false;
  S.beat = setInterval(async () => {
    if (busy || !S.session) return; busy = true; const sid = S.session;
    try {
      let rec; try { rec = await rereadDongle(handle, role); } catch { if (S.session === sid) lock('Dongle dicabut atau tidak terbaca. Anda dikeluarkan.'); return; }
      if (rec.token !== token) { if (S.session === sid) lock('Dongle berubah. Anda dikeluarkan.'); return; }
      const r = await fetch('/api/beat', { method: 'POST', headers: { Authorization: 'Bearer ' + sid, 'Content-Type': 'application/json' }, body: JSON.stringify({ proof: await dongleProof(token, S.nonce) }) }).catch(() => null);
      if (!r) return; // jaringan putus sesaat: server yang menentukan lewat batas waktunya
      if (r.status === 401) { if (S.session === sid) lock('Sesi dicabut karena dongle tidak terverifikasi.'); return; }
      if (S.session === sid) S.nonce = (await r.json()).nonce;
    } finally { busy = false; }
  }, 2000);
}
function lock(reason, ok = false) {
  clearTimeout(S.idle); stopCamera($('cam'));
  if (S.session) fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + S.session }, keepalive: true }).catch(() => {});
  stopBeat();
  Object.assign(S, { session: null, role: null, voter: null, nik: '', voted: false, votedAt: null, block: null, params: null, idle: null });
  clearWork(); resetGate(); $('acct').textContent = 'Belum login'; $('btnLogout').hidden = true; refreshNav(); show('gate');
  if (reason) say('msgLogin', reason, ok);
}
function armIdle() { clearTimeout(S.idle); S.idle = setTimeout(() => S.session && lock('Tidak ada aktivitas 5 menit. Dikunci otomatis.'), 300000); }
['pointerdown', 'keydown'].forEach(e => document.addEventListener(e, () => S.session && armIdle()));
document.addEventListener('click', e => { if (e.target.closest('[data-logout]')) lock('Anda telah keluar.', true); });
window.addEventListener('pageshow', e => { if (e.persisted) lock(''); });
const updateAcct = () => { $('acct').textContent = S.role === 'admin' ? 'Panitia (Admin)' : `NIK ${S.nik} · ${S.voter} · ${S.voted ? 'Sudah memilih' : 'Belum memilih'}`; };
function startSession() { resetGate(); stopCamera($('cam')); $('btnLogout').hidden = false; updateAcct(); refreshNav(); armIdle(); }

// ----- Gatekeeper -----
$('btnCam').onclick = guard('msgLogin', async () => { await startCamera($('cam'), t => say('msgLogin', t)); });
$('btnReg').onclick = guard('msgReg', async () => {
  const nik = $('regNik').value.trim(), pin = $('regPin').value;
  if (!/^\d{16}$/.test(nik) || !/^\d{4}$/.test(pin)) throw new Error('NIK harus 16 digit dan PIN 4 digit.');
  const target = await chooseDongleTarget(); // pilih flashdisk dulu supaya token tidak hilang
  let r; try {
    const descriptor = await scan('msgReg', 5);
    r = await api('/api/register', { method: 'POST', body: { nik, pin, descriptor } });
  } catch (e) { await discardDongleTarget(target); throw e; }
  await writeDongle(target, { voterCode: r.voterCode, token: r.token, nikMask: nik.slice(0, 4) + '********' + nik.slice(-4) });
  $('regNik').value = ''; $('regPin').value = '';
  say('msgReg', `Terdaftar. Kode pemilih ${r.voterCode}. Dongle tersimpan di flashdisk yang Anda pilih.`);
  toast('Dongle tersimpan di flashdisk. Hapus salinan lain dari komputer.');
});
$('btnPickKey').onclick = guard('msgLogin', async () => {
  pickedVoter = null; $('dongleName').textContent = '';
  const d = await pickDongle('voter'); pickedVoter = d; $('dongleName').textContent = d.name;
  say('msgLogin', `Dongle terbaca (${d.rec.voterCode}).`); toast('Dongle terbaca.');
});
$('btnPickAdminKey').onclick = guard('msgAdmin', async () => {
  pickedAdmin = null; $('adminDongleName').textContent = '';
  const d = await pickDongle('admin'); pickedAdmin = d; $('adminDongleName').textContent = d.name;
  say('msgAdmin', 'Dongle panitia terbaca.'); toast('Dongle panitia terbaca.');
});
$('btnLogin').onclick = guard('msgLogin', async () => {
  if (!pickedVoter) throw new Error('Pilih dongle .key dari flashdisk dulu.');
  const rec = await rereadDongle(pickedVoter.handle, 'voter'), pin = $('loginPin').value; // dibaca ulang setiap login
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN harus 4 digit.');
  const descriptor = await scan('msgLogin', 4), handle = pickedVoter.handle;
  const r = await api('/api/login', { method: 'POST', body: { voterCode: rec.voterCode, pin, token: rec.token, descriptor } });
  Object.assign(S, { session: r.session, role: 'voter', voter: rec.voterCode, nik: rec.nikMask || '(tidak ada di dongle)', voted: r.hasVoted });
  S.params = await api('/api/election');
  startSession(); startBeat('voter', handle, rec.token, r.nonce); renderStatus(); toast('Login 3 faktor berhasil.');
  if (S.voted) show('status'); else { await loadCandidates(); show('vote'); }
});
$('btnAdmin').onclick = guard('msgAdmin', async () => {
  if (!pickedAdmin) throw new Error('Pilih dongle panitia dari flashdisk dulu.');
  const key = $('adminKey').value; if (!key) throw new Error('Isi kunci panitia.');
  const handle = pickedAdmin.handle, rec = await rereadDongle(handle, 'admin');
  const r = await api('/api/admin/login', { method: 'POST', body: { key, token: rec.token } });
  Object.assign(S, { session: r.session, role: 'admin' }); startSession(); startBeat('admin', handle, rec.token, r.nonce); toast('Login panitia berhasil.'); show('dash');
});

// ----- penjelasan algoritma + tabel bertahap -----
const EX = {
  caesar: 'Caesar: setiap huruf digeser k posisi di alfabet, C = (P + k) mod 26. Angka, spasi, dan tanda baca tidak berubah. Dekripsi menggeser balik, P = (C − k) mod 26.',
  rail: 'Rail Fence: huruf ditulis zig-zag turun-naik pada N rel, lalu dibaca baris demi baris menjadi ciphertext. Dekripsi: bentuk pola zig-zag, isi tiap rel berurutan dengan huruf ciphertext, lalu baca zig-zag.',
  aes: 'AES-256-GCM: kunci 256-bit diturunkan dari kata sandi lewat PBKDF2-SHA256 (100.000 iterasi, salt acak 16 B). Teks dienkripsi dengan IV acak 12 B, GCM menambah tag autentikasi 16 B. Paket Base64 = salt | IV | ciphertext+tag. Pada dekripsi, tag diperiksa dulu: data diubah atau kunci salah berarti ditolak.'
};
const box = (t, x) => `<div class="explain"><b>${esc(t)}</b><p>${esc(x)}</p></div>`;
const charRows = (a, b) => { const y = [...b]; return [...a].map((c, i) => [i + 1, vis(c), vis(y[i] ?? '')]).slice(0, 60); };
const pkgRows = p => { const u = Uint8Array.from(atob(p), c => c.charCodeAt(0)); return [['Salt PBKDF2 (16 B)', hex(u.slice(0, 16))], ['IV GCM (12 B)', hex(u.slice(16, 28))], [`Ciphertext + tag (${u.length - 28} B)`, hex(u.slice(28, 52)) + (u.length > 52 ? '...' : '')]]; };
function railRows(n, r) { const rows = Array.from({ length: r }, () => []); let x = 0, d = 1; for (let i = 0; i < n; i++) { rows[x].push(i); if (x === 0) d = 1; else if (x === r - 1) d = -1; x += d; } return rows; }
function gridHtml(text, rails, mode) { // enc: huruf ditaruh sesuai posisi zig-zag; dec: huruf cipher mengisi tiap rel berurutan
  const L = [...text].filter(c => /[A-Za-z]/.test(c)); rails = Math.max(2, rails | 0);
  if (!L.length || L.length > 48) return '<p class="mut">Ilustrasi grid tampil untuk 1-48 huruf.</p>';
  let k = 0; const rows = railRows(L.length, rails).map(ix => { const line = Array(L.length).fill('·'); ix.forEach(i => { line[i] = mode === 'enc' ? L[i] : L[k++]; }); return line.join(' '); });
  return `<div class="tw"><pre class="grid">${esc(rows.join('\n'))}</pre></div><p class="mut">${mode === 'enc' ? 'Dibaca baris demi baris (atas ke bawah) menghasilkan ciphertext Rail.' : 'Dibaca zig-zag (kiri ke kanan) menghasilkan cipher Caesar.'}</p>`;
}
const stage = (t, x, rows, extra = '') => box(t, x) + table(['Data', 'Nilai'], rows) + extra;
function renderLayers(el, plain, r, shift, rails) {
  const L = r.layers;
  el.innerHTML = '<h3>Alur enkripsi bertahap</h3>'
    + stage(`Tahap 1: Plaintext → Cipher Caesar (geser ${shift})`, EX.caesar, [['Plaintext', plain], ['Cipher Caesar', L.caesar]], table(['#', 'Plaintext', 'Caesar'], charRows(plain, L.caesar)))
    + stage(`Tahap 2: Cipher Caesar → Cipher Rail Fence (${rails} rel)`, EX.rail, [['Masukan (cipher Caesar)', L.caesar], ['Cipher Rail Fence', L.rail]], gridHtml(L.caesar, rails, 'enc'))
    + stage('Tahap 3: Cipher Rail Fence → AES-256-GCM', EX.aes, [['Masukan (cipher Rail)', L.rail], ['Paket Base64 akhir', L.aes], ...pkgRows(L.aes)]);
}
function renderDecLayers(el, pkg, s1, s2, s3, o) {
  el.innerHTML = '<h3>Alur dekripsi bertahap (urutan dibalik)</h3>'
    + stage('Tahap 1: Paket AES-256-GCM → Cipher Rail Fence', EX.aes, [...pkgRows(pkg), ['Tag GCM', 'valid'], ['Hasil (cipher Rail)', s1]])
    + stage(`Tahap 2: Cipher Rail Fence → Cipher Caesar (${o.rails} rel)`, EX.rail, [['Masukan (cipher Rail)', s1], ['Hasil (cipher Caesar)', s2]], gridHtml(s1, o.rails, 'dec'))
    + stage(`Tahap 3: Cipher Caesar → Plaintext (geser balik ${o.shift})`, EX.caesar, [['Masukan (cipher Caesar)', s2], ['Plaintext', s3]], table(['#', 'Caesar', 'Plaintext'], charRows(s2, s3)));
}
const textOpts = () => {
  const o = { shift: +$('txtShift').value, rails: +$('txtRails').value, pass: $('txtPass').value };
  if (!Number.isInteger(o.shift) || !Number.isInteger(o.rails) || o.rails < 2 || o.pass.length < 6) throw new Error('Geser bilangan bulat, rel minimal 2, kunci AES minimal 6 karakter.'); return o;
};
$('btnTxtEnc').onclick = guard('msgTxt', async () => {
  const t = $('txtIn').value; if (!t) throw new Error('Isi pesan.'); const o = textOpts();
  const r = await Layers.superEncrypt(t, o); renderLayers($('txtTrace'), t, r, o.shift, o.rails);
  $('txtPkg').value = r.package; say('msgTxt', 'Terenkripsi. Paket Base64 disalin ke kotak dekripsi.'); toast('Pesan perintah terenkripsi 3 lapis.');
});
$('btnTxtDec').onclick = guard('msgTxtDec', async () => {
  const o = textOpts(), pkg = $('txtPkg').value.trim(); if (!pkg) throw new Error('Isi paket Base64.');
  const s1 = await Layers.aesDecrypt(pkg, o.pass), s2 = Layers.rail(s1, o.rails, true), s3 = Layers.caesar(s2, o.shift, true);
  renderDecLayers($('txtDecTrace'), pkg, s1, s2, s3, o); say('msgTxtDec', 'Hasil: ' + s3); toast('Pesan berhasil didekripsi.');
});

// ----- Surat suara dan status -----
async function loadCandidates() {
  const c = await api('/api/candidates'); $('btnVote').disabled = false;
  $('candList').innerHTML = c.map(x => `<label class="opt"><input type="radio" name="cand" value="${x.id}"><span><b>${esc(x.name)}</b><br><span class="mut">${esc(x.vision || '')}</span></span></label>`).join('');
}
function renderStatus() {
  $('statusBox').innerHTML = '<h3>Ringkasan akun</h3>' + table(['Item', 'Nilai'], [['NIK', S.nik], ['Kode pemilih', S.voter], ['Autentikasi', 'Dongle + PIN + Wajah (3FA)'],
    ['Status suara', S.voted ? 'SUDAH MEMILIH (terkunci permanen)' : 'Belum memilih'], ['Waktu mencatat', S.votedAt ? S.votedAt.toLocaleString() : '-'],
    ['Blok ledger', S.block != null ? '#' + S.block : S.voted ? 'Menunggu disegel' : '-']])
    + '<p class="mut">Ledger hanya menyimpan hash pilihan tanpa identitas Anda, sehingga pilihan tidak dapat dilacak ke akun ini.</p><button class="go" data-logout>Logout</button>';
}
$('btnVote').onclick = guard('msgVote', async () => {
  const c = document.querySelector('input[name=cand]:checked'); if (!c) throw new Error('Pilih kandidat.');
  const plain = JSON.stringify({ candidateId: +c.value }), r = await Layers.superEncrypt(plain, { ...S.params, pass: S.session });
  const res = await api('/api/vote', { method: 'POST', body: { ballot: r.package } });
  Object.assign(S, { voted: true, votedAt: new Date(), block: res.sealedBlock });
  $('btnVote').disabled = true; $('candList').innerHTML = ''; say('msgVote', 'Anda sudah memilih.');
  updateAcct(); renderStatus(); renderLayers($('statusTrace'), plain, r, S.params.shift, S.params.rails);
  toast('Suara terenkripsi 3 lapis dan tercatat.'); show('status');
});

// ----- Campaign Logistical Vault (.secure) -----
function renderTrace(el, t, dec) {
  const H = dec ? ['Ciphertext', 'Keystream', 'Plaintext'] : ['Plaintext', 'Keystream', 'Ciphertext'], h2 = n => n.toString(16).padStart(2, '0');
  el.innerHTML = '<h3>Parameter proses</h3>' + table(['Langkah', 'Nilai'], [
    ['Berkas', `${t.file} (${t.size} byte), total .secure ${t.total} byte`], ['Header (RC4S, versi)', t.header], ['Salt PBKDF2 (16 B)', t.salt],
    ['Kunci RC4 (16 B)', t.rc4Key], ['Kunci HMAC (8 B pertama)', t.macKey], ['S-box awal [0..15]', t.sBefore], ['S-box setelah KSA [0..15]', t.sAfter],
    ['RC4-drop', SEC.DROP + ' byte keystream dibuang'], ['HMAC-SHA256', t.tag]])
    + '<h3>10 byte pertama (XOR)</h3>' + table(['#', H[0] + ' hex', 'biner', H[1] + ' hex', 'biner', H[2] + ' hex', 'biner'], t.rows.map(r => [r.n, h2(r.i), bin(r.i), h2(r.k), bin(r.k), h2(r.o), bin(r.o)]));
}
$('btnSecEnc').onclick = guard('msgFile', async () => {
  const f = $('fileIn').files[0], p = $('filePass').value; if (!f || p.length < 6) throw new Error('Pilih berkas dan isi kunci (min 6).');
  const r = await secureEncrypt(f, p); lastSecure = { bytes: r.bytes, name: f.name + '.secure' };
  download(new Blob([r.bytes]), lastSecure.name); renderTrace($('fileTrace'), r.trace, false);
  say('msgFile', 'Terenkripsi dan diunduh: ' + lastSecure.name); toast(`${lastSecure.name} diunduh ke folder Downloads.`);
});
$('btnSecSave').onclick = guard('msgFile', async () => {
  if (!lastSecure) throw new Error('Enkripsi berkas dulu.');
  const r = await api('/api/docs', { method: 'POST', raw: true, body: lastSecure.bytes, headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent(lastSecure.name) } });
  say('msgFile', 'Tersimpan di MySQL, id ' + r.id); toast('Dokumen tersimpan di server (id ' + r.id + ').');
});
$('btnSecDec').onclick = guard('msgSecDec', async () => {
  const f = $('secIn').files[0]; if (!f) throw new Error('Pilih berkas .secure.');
  const r = await secureDecrypt(await f.arrayBuffer(), $('secPass').value);
  download(new Blob([r.data]), r.name); renderTrace($('decTrace'), r.trace, true);
  say('msgSecDec', 'HMAC valid. Berkas dipulihkan: ' + r.name); toast(`HMAC valid. ${r.name} diunduh ke folder Downloads.`);
});
$('btnDocs').onclick = guard('msgFile', async () => {
  const d = await api('/api/docs');
  $('docList').innerHTML = d.length ? `<div class="tw"><table><tr><th>ID</th><th>Nama</th><th>Ukuran</th><th></th></tr>${d.map(x => `<tr><td>${x.id}</td><td>${esc(x.name)}</td><td>${x.size}</td><td><button class="go alt" data-doc="${x.id}" data-name="${esc(x.name)}">Unduh</button></td></tr>`).join('')}</table></div>` : '<p class="mut">Belum ada dokumen.</p>';
  toast('Daftar dokumen dimuat.');
});
$('docList').onclick = guard('msgFile', async e => { const b = e.target.closest('[data-doc]'); if (b) { download(await (await api('/api/docs/' + b.dataset.doc)).blob(), b.dataset.name); toast(b.dataset.name + ' diunduh.'); } });

// ----- Anti-Counterfeit Credential (DCT) -----
$('btnEmbed').onclick = guard('msgStego', async () => {
  const f = $('imgIn').files[0], m = $('stegoMsg').value; if (!f || !m) throw new Error('Pilih gambar dan isi pesan rahasia.');
  const url = embedDCT(await loadImg(f), m); download(await (await fetch(url)).blob(), 'poster-resmi.png');
  say('msgStego', 'Watermark ditanam. PNG diunduh.'); toast('Watermark ditanam, poster-resmi.png diunduh ke folder Downloads.');
});
$('btnExtract').onclick = guard('msgStego', async () => {
  const f = $('imgIn').files[0]; if (!f) throw new Error('Pilih gambar yang diperiksa.');
  let out; $('stegoOut').value = '';
  try { out = extractDCT(await loadImg(f)); } catch { say('msgStego', 'Watermark tidak ditemukan: materi ini kemungkinan TIRUAN atau sudah diedit.', false); toast('Watermark tidak ditemukan.', false); return; }
  $('stegoOut').value = out; const exp = $('stegoMsg').value.trim();
  if (!exp) { say('msgStego', 'Watermark terbaca. Isi kode pada kolom pesan rahasia untuk dicocokkan.'); toast('Watermark terbaca.'); }
  else if (out === exp) { say('msgStego', 'ASLI: kode watermark cocok.'); toast('Materi ASLI: watermark cocok.'); }
  else { say('msgStego', 'MENCURIGAKAN: watermark ada tetapi kodenya berbeda.', false); toast('Kode watermark tidak cocok.', false); }
});

// ----- Command Dashboard -----
async function refreshDash() {
  const r = await api('/api/admin/results'), labels = Object.keys(r.tally), vals = Object.values(r.tally);
  if (!chart) { Chart.defaults.color = '#93a3bd'; chart = new Chart($('chart'), { type: 'bar', data: { labels, datasets: [{ label: 'Suara tersegel', data: vals, backgroundColor: '#e0a43a' }] }, options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } } }); }
  else { chart.data.labels = labels; chart.data.datasets[0].data = vals; chart.update(); }
  const ch = r.chain, total = vals.reduce((a, b) => a + b, 0);
  $('dashStat').innerHTML = [['Suara tersegel', total], ['Menunggu segel', r.pending], ['Rantai', ch.valid ? `VALID (${ch.blocks} blok)` : `TAMPERED blok #${ch.at}: ${ch.reason}`]].map(([k, v]) => `<div class="stat"><span class="mut">${k}</span><br><b class="${k === 'Rantai' && !ch.valid ? 'bad' : ''}">${esc(v)}</b></div>`).join('');
  const b = await api('/api/admin/blocks');
  $('blocks').innerHTML = table(['#', 'Waktu', 'Tx', 'Merkle root', 'Hash', 'Prev'], b.map(x => [x.idx, String(x.ts).replace('T', ' ').slice(0, 19), x.tx, x.merkle_root.slice(0, 14) + '...', x.hash.slice(0, 14) + '...', x.prev_hash.slice(0, 14) + '...']));
}
$('btnDash').onclick = guard('msgDash', async () => { await refreshDash(); say('msgDash', 'Diperbarui ' + new Date().toLocaleTimeString()); toast('Dashboard dimuat.'); });
$('autoDash').onchange = () => { clearInterval(dashTimer); if ($('autoDash').checked) dashTimer = setInterval(() => refreshDash().catch(e => say('msgDash', e.message, false)), 5000); };
$('btnSeal').onclick = guard('msgDash', async () => { const r = await api('/api/admin/seal', { method: 'POST' }); await refreshDash(); toast(r.sealedBlock != null ? `Blok #${r.sealedBlock} tersegel.` : 'Tidak ada suara tertunda.'); });
$('btnTamper').onclick = guard('msgDash', async () => { await api('/api/admin/tamper', { method: 'POST', body: { idx: 1 } }); await refreshDash(); toast('Blok 1 dirusak (demo). Lihat status rantai.', false); });

lock('');
