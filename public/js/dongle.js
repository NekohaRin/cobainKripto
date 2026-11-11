// Dongle E-Voting: file .key tetap menggunakan format JSON/token project asli.
// Browser menyimpan FileSystemFileHandle di IndexedDB (bukan menyalin isi file).
const dongleFileName = c => `dongle-${c}.key`;

function _parseDongle(raw, name, expectedRole = "voter") {
  let rec;
  try {
    rec = JSON.parse(raw);
  } catch {
    throw new Error("Berkas .key rusak atau bukan JSON valid.");
  }

  if (!name || !name.toLowerCase().endsWith(".key")) {
    throw new Error("Pilih file dengan ekstensi .key.");
  }

  if (expectedRole === "admin") {
    if (rec?.role !== "admin" || !/^[0-9a-f]{64}$/.test(rec.token || "")) {
      throw new Error("Format dongle admin tidak valid.");
    }
    return { rec, name };
  }

  if (
    !rec ||
    !/^V\d{6}$/.test(rec.voterCode || "") ||
    !/^[0-9a-f]{64}$/.test(rec.token || "") ||
    (rec.nikMask !== undefined && !/^[\d*]{16}$/.test(rec.nikMask))
  ) {
    throw new Error("Format dongle pemilih tidak valid.");
  }
  return { rec, name };
}

function saveDongle(rec) {
  const name = dongleFileName(rec.voterCode);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(rec)], { type: "application/octet-stream" })
  );
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return name;
}

const readDongleFile = async f => _parseDongle(await f.text(), f.name, "voter");

const DONGLE_DB = "evoting-dongle-handles";
const DONGLE_STORE = "handles";

function openDongleDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DONGLE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DONGLE_STORE)) {
        request.result.createObjectStore(DONGLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeDongleHandle(role, handle) {
  const db = await openDongleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DONGLE_STORE, "readwrite");
    tx.objectStore(DONGLE_STORE).put(handle, role);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getDongleHandle(role = "voter") {
  const db = await openDongleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DONGLE_STORE, "readonly");
    const request = tx.objectStore(DONGLE_STORE).get(role);
    request.onsuccess = () => {
      const handle = request.result || null;
      db.close();
      resolve(handle);
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function pickDongleHandle(role = "voter") {
  if (!window.isSecureContext || !window.showOpenFilePicker) {
    throw new Error("Gunakan Chrome atau Edge melalui HTTPS untuk membaca dongle.");
  }

  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    excludeAcceptAllOption: true,
    types: [{
      description: role === "admin" ? "Admin USB Dongle" : "Voter USB Dongle",
      accept: { "application/octet-stream": [".key"] }
    }]
  });

  const file = await handle.getFile();
  await _parseDongle(await file.text(), file.name, role);
  await storeDongleHandle(role, handle);
  return handle;
}

async function readDongleHandle(handle, expectedRole = "voter") {
  if (!handle) throw new Error("Dongle belum dihubungkan.");

  const permission = await handle.queryPermission({ mode: "read" });
  if (permission !== "granted") {
    throw new Error("Izin baca dongle belum aktif. Klik Hubungkan Dongle kembali.");
  }

  const file = await handle.getFile();
  return _parseDongle(await file.text(), file.name, expectedRole);
}

async function restoreDongleHandle(role = "voter") {
  const handle = await getDongleHandle(role);
  if (!handle) return null;
  const permission = await handle.queryPermission({ mode: "read" });
  if (permission !== "granted") return null;
  return handle;
}
