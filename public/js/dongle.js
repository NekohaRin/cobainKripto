// Dongle 3FA: berkas dongle-Vxxxxxx.key ({voterCode, token, nikMask}). Selalu diunduh otomatis ke folder Downloads.
const dongleFileName = c => `dongle-${c}.key`;
function _parseDongle(raw, name) {
  let rec; try { rec = JSON.parse(raw); } catch { throw new Error('Berkas .key rusak.'); }
  if (!rec || !/^V\d{6}$/.test(rec.voterCode) || !/^[0-9a-f]{64}$/.test(rec.token) || (rec.nikMask !== undefined && !/^[\d*]{16}$/.test(rec.nikMask))) throw new Error('Format dongle tidak valid.');
  return { rec, name };
}
function saveDongle(rec) {
  const name = dongleFileName(rec.voterCode), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(rec)], { type: 'application/octet-stream' })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return name;
}
const readDongleFile = async f => _parseDongle(await f.text(), f.name);
