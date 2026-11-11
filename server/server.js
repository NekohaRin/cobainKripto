require("dotenv").config();
const express = require("express"),
  mysql = require("mysql2/promise"),
  crypto = require("crypto"),
  path = require("path"),
  fs = require("fs");
const Layers = require("../shared/layers"),
  led = require("./ledger");
const E = process.env;
if (
  E.NODE_ENV === "production" &&
  ["ADMIN_KEY", "ELECTION_SECRET", "NIK_SALT", "FACE_KEY"].some((k) => !E[k])
) {
  console.error("Isi ADMIN_KEY, ELECTION_SECRET, NIK_SALT, FACE_KEY di .env");
  process.exit(1);
}
const SECRET = E.ELECTION_SECRET || "dev-secret",
  BLOCK = +E.BLOCK_SIZE || 3,
  ADMIN_KEY = E.ADMIN_KEY || "dev-admin";
const PARAMS = { shift: +E.ELECTION_SHIFT || 7, rails: +E.ELECTION_RAILS || 4 };
const pool = mysql.createPool({
  host: E.DB_HOST || "localhost",
  port: +E.DB_PORT || 3306,
  user: E.DB_USER || "root",
  password: E.DB_PASS || "",
  database: E.DB_NAME || "evoting",
  ssl:
    E.DB_SSL === "true"
      ? { minVersion: "TLSv1.2", rejectUnauthorized: true }
      : undefined,
  connectionLimit: 10,
  timezone: "Z",
});
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const eq = (a, b) =>
  a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const NIK_SALT = E.NIK_SALT || "dev-nik-salt",
  FK = Buffer.from(sha(E.FACE_KEY || "dev-face-key"), "hex");
const pinHash = (pin, salt) =>
  crypto.pbkdf2Sync(pin, salt, 100000, 32, "sha256").toString("hex");
// Descriptor wajah disimpan terenkripsi AES-256-GCM: iv(12) | tag(16) | ciphertext
const sealFace = (d) => {
  const iv = crypto.randomBytes(12),
    c = crypto.createCipheriv("aes-256-gcm", FK, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(d)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
};
const openFace = (s) => {
  const b = Buffer.from(s, "base64"),
    d = crypto.createDecipheriv("aes-256-gcm", FK, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]));
};
const FACE_THRESHOLD = Number(E.FACE_THRESHOLD) || 0.40;
const validDesc = (d) =>
  Array.isArray(d) && d.length === 128 && d.every(Number.isFinite);

function faceDistance(a, b) {
  if (!validDesc(a) || !validDesc(b)) return Infinity;
  let normA = 0, normB = 0;
  for (let i = 0; i < 128; i++) {
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  if (normA === 0 || normB === 0) return Infinity;

  let sumSq = 0;
  for (let i = 0; i < 128; i++) {
    const diff = (a[i] / normA) - (b[i] / normB);
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

const faceMatch = (a, b, threshold = FACE_THRESHOLD) => {
  const dist = faceDistance(a, b);
  return { ok: dist <= threshold, dist };
};

const app = express(),
  sessions = new Map(),
  adminFails = new Map();
  app.set("trust proxy", 1);
// Dongle (flashdisk) dicek di browser pengguna, bukan di server, sehingga server boleh di-host.
// Setiap sesi terikat ke token dari berkas .key. Browser wajib membaca berkas itu ulang tiap beberapa
// detik dan mengirim bukti HMAC(token, nonce) lewat /api/beat. Flashdisk dicabut = bukti berhenti =
// sesi dicabut server. DONGLE_REQUIRED=false hanya untuk pengembangan.
const DONGLE_REQUIRED = E.DONGLE_REQUIRED !== "false";
const DONGLE_TIMEOUT = Math.max(3000, Number(E.DONGLE_TIMEOUT_MS) || 8000);
const ADMIN_DONGLE_HASH = (E.ADMIN_DONGLE_HASH || "").toLowerCase();
const hmac = (key, msg) =>
  crypto.createHmac("sha256", key).update(msg).digest("hex");
const nonce = () => crypto.randomBytes(16).toString("hex");
const dongleFields = (dk) =>
  DONGLE_REQUIRED ? { dk, nonce: nonce(), beat: Date.now() } : {};
const alive = (s) =>
  !!s &&
  s.exp > Date.now() &&
  (!DONGLE_REQUIRED || (s.dk && Date.now() - s.beat <= DONGLE_TIMEOUT));

const newSession = (data, ttl) => {
  const t = crypto.randomBytes(24).toString("hex");
  sessions.set(t, { ...data, exp: Date.now() + ttl });
  return t;
};
setInterval(
  () => sessions.forEach((s, k) => s.exp < Date.now() && sessions.delete(k)),
  60e3,
).unref();
setInterval(
  () =>
    sessions.forEach((s, k) => {
      if (!alive(s)) {
        sessions.delete(k);
        if (s.exp > Date.now()) console.warn("Dongle tidak terbaca: sesi dicabut.");
      }
    }),
  1000,
).unref();
let chain = Promise.resolve(); // registrasi diserialkan agar cek wajah ganda tidak bisa dibalap
const serial = (fn) => {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
};

app.disable("x-powered-by");
// Health check untuk Railway
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    application: "E-Voting Cryptography",
    environment: process.env.NODE_ENV
  });
});
app.use((_, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  });
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));
app.use("/shared", express.static(path.join(__dirname, "../shared")));
const wrap = (f) => (req, res) =>
  f(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: "Kesalahan server." });
  });
const sess = (req) =>
  sessions.get((req.headers.authorization || "").replace("Bearer ", ""));
const auth = (req, res, next) => {
  // khusus pemilih
  const t = (req.headers.authorization || "").replace("Bearer ", ""),
    s = sessions.get(t);
  if (!alive(s) || s.admin)
    return res.status(401).json({ error: "Sesi tidak valid." });
  req.voterId = s.id;
  req.sessionToken = t;
  next();
};
const admin = (req, res, next) => {
  const s = sess(req);
  return alive(s) && s.admin
    ? next()
    : res.status(401).json({ error: "Khusus panitia. Login sebagai admin." });
};

// Bukti kehadiran dongle. Klien membaca berkas .key lalu mengirim HMAC(token, nonce terakhir).
app.post("/api/beat", (req, res) => {
  const t = (req.headers.authorization || "").replace("Bearer ", ""),
    s = sessions.get(t);
  if (!alive(s)) {
    sessions.delete(t);
    return res.status(401).json({ error: "Sesi tidak valid." });
  }
  if (DONGLE_REQUIRED) {
    const proof = req.body && req.body.proof;
    if (typeof proof !== "string" || !eq(proof, hmac(s.dk, s.nonce))) {
      sessions.delete(t);
      return res.status(401).json({ error: "Dongle tidak valid." });
    }
    s.beat = Date.now();
    s.nonce = nonce();
  }
  res.json({ nonce: s.nonce });
});
app.post("/api/logout", (req, res) => {
  sessions.delete((req.headers.authorization || "").replace("Bearer ", ""));
  res.json({ ok: true });
});

app.get(
  "/api/candidates",
  wrap(async (_, res) =>
    res.json((await pool.query("SELECT id, name, vision FROM candidates"))[0]),
  ),
);
app.get("/api/election", (_, res) => res.json(PARAMS)); // pass AES = token sesi pemilih

app.post(
  "/api/register",
  wrap((req, res) =>
    serial(async () => {
      const { nik, pin, descriptor } = req.body;
      if (
        typeof nik !== "string" ||
        typeof pin !== "string" ||
        !/^\d{16}$/.test(nik) ||
        !/^\d{4}$/.test(pin) ||
        !validDesc(descriptor)
      )
        return res.status(400).json({ error: "Data tidak valid." });
      // Anti-Sybil: satu wajah hanya boleh satu NIK (Euclidean normalized <= FACE_THRESHOLD terhadap semua descriptor)
      const [faces] = await pool.query("SELECT face_enc FROM voters");
      if (
        faces.some((r) => {
          try {
            return faceMatch(descriptor, openFace(r.face_enc)).ok;
          } catch {
            return false;
          }
        })
      )
        return res
          .status(400)
          .json({
            error:
              "Wajah ini sudah terdaftar pada NIK lain. Registrasi ditolak.",
          });
      const salt = crypto.randomBytes(16).toString("hex"),
        token = crypto.randomBytes(32).toString("hex"),
        code = "V" + crypto.randomInt(100000, 999999);
      try {
        await pool.query(
          "INSERT INTO voters (voter_code, nik_hash, pin_salt, pin_hash, token_hash, face_enc) VALUES (?,?,?,?,?,?)",
          [
            code,
            sha(NIK_SALT + nik),
            salt,
            pinHash(pin, salt),
            sha(token),
            sealFace(descriptor),
          ],
        );
      } catch (e) {
        if (e.code === "ER_DUP_ENTRY")
          return res.status(409).json({ error: "NIK sudah terdaftar." });
        throw e;
      }
      res.json({ voterCode: code, token });
    }),
  ),
);

app.post(
  "/api/login",
  wrap(async (req, res) => {
    const { voterCode, pin, token, descriptor } = req.body,
      fail = (msg = "Autentikasi gagal.") => res.status(401).json({ error: msg });
    if (
      typeof voterCode !== "string" ||
      typeof pin !== "string" ||
      typeof token !== "string" ||
      !/^V\d{6}$/.test(voterCode) ||
      !/^\d{4}$/.test(pin) ||
      !/^[0-9a-f]{64}$/.test(token)
    )
      return fail();
    const [[v]] = await pool.query(
      "SELECT * FROM voters WHERE voter_code = ?",
      [voterCode],
    );
    if (!v || v.failed_attempts >= 5) return fail();

    let storedFace;
    try {
      storedFace = openFace(v.face_enc);
    } catch (err) {
      console.error("[AUTH] Gagal mendekripsi descriptor wajah:", err.message);
      return fail();
    }

    const { ok: faceMatched, dist } = faceMatch(descriptor, storedFace);
    const faceOk = faceMatched;

    console.log(
      `[AUTH] Login voter ${voterCode}: distance=${isFinite(dist) ? dist.toFixed(4) : dist}, threshold=${FACE_THRESHOLD} -> ${faceOk ? "PASS" : "FAIL"}`
    );

    const pinOk = eq(pinHash(pin, v.pin_salt), v.pin_hash);
    const tokenOk = eq(sha(token), v.token_hash);

    if (!pinOk || !tokenOk || !faceOk) {
      await pool.query(
        "UPDATE voters SET failed_attempts = failed_attempts + 1 WHERE id = ?",
        [v.id],
      );
      if (pinOk && tokenOk && !faceOk) {
        console.warn(
          `[AUTH] Login ditolak untuk ${voterCode}: wajah tidak cocok (jarak: ${dist.toFixed(4)} > ${FACE_THRESHOLD}).`
        );
        return fail("Wajah tidak cocok dengan data pemilih terdaftar.");
      }
      return fail();
    }
    await pool.query("UPDATE voters SET failed_attempts = 0 WHERE id = ?", [
      v.id,
    ]);
    const st = newSession({ id: v.id, ...dongleFields(token) }, 15 * 60e3);
    res.json({
      session: st,
      hasVoted: !!v.has_voted,
      nonce: sessions.get(st).nonce,
    });
  }),
);

app.post("/api/admin/login", (req, res) => {
  // login panitia: sesi 30 menit, 5 gagal = blok 5 menit per IP
  const a = adminFails.get(req.ip) || { n: 0, until: 0 };
  if (a.until > Date.now())
    return res
      .status(429)
      .json({ error: "Terlalu banyak percobaan. Coba lagi beberapa menit." });
  if (
    typeof req.body.key !== "string" ||
    !eq(sha(req.body.key), sha(ADMIN_KEY))
  ) {
    if (++a.n >= 5) {
      a.until = Date.now() + 300e3;
      a.n = 0;
    }
    adminFails.set(req.ip, a);
    return res.status(401).json({ error: "Kunci panitia salah." });
  }
  if (DONGLE_REQUIRED) {
    const tk = req.body.token;
    if (
      !/^[0-9a-f]{64}$/.test(ADMIN_DONGLE_HASH) ||
      typeof tk !== "string" ||
      !/^[0-9a-f]{64}$/.test(tk) ||
      !eq(sha(tk), ADMIN_DONGLE_HASH)
    )
      return res
        .status(401)
        .json({ error: "Dongle panitia tidak valid atau belum didaftarkan." });
  }
  adminFails.delete(req.ip);
  const st = newSession(
    { admin: true, ...dongleFields(req.body.token) },
    30 * 60e3,
  );
  res.json({ session: st, nonce: sessions.get(st).nonce });
});

app.post(
  "/api/vote",
  auth,
  wrap(async (req, res) => {
    let cid;
    try {
      cid = Number(
        JSON.parse(
          await Layers.superDecrypt(String(req.body.ballot), {
            ...PARAMS,
            pass: req.sessionToken,
          }),
        ).candidateId,
      );
    } catch {
      return res.status(400).json({ error: "Ballot tidak valid." });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[c]] = await conn.query("SELECT id FROM candidates WHERE id = ?", [
        cid,
      ]);
      if (!c) {
        await conn.rollback();
        return res.status(400).json({ error: "Kandidat tidak ada." });
      }
      const [[v]] = await conn.query(
        "SELECT has_voted FROM voters WHERE id = ? FOR UPDATE",
        [req.voterId],
      );
      if (v.has_voted) {
        await conn.rollback();
        return res.status(409).json({ error: "Anda sudah memilih." });
      }
      const [upd] = await conn.query(
        "UPDATE voters SET has_voted = 1 WHERE id = ? AND has_voted = 0",
        [req.voterId],
      );
      if (upd.affectedRows !== 1) {
        await conn.rollback();
        return res.status(409).json({ error: "Anda sudah memilih." });
      }
      await conn.query("INSERT INTO pending_votes (choice_hash) VALUES (?)", [
        led.choiceHash(cid, SECRET),
      ]);
      await led.ensureGenesis(conn);
      const block = await led.sealIfReady(conn, BLOCK);
      await conn.commit();
      sessions.delete(req.sessionToken);
      res.json({ ok: true, sealedBlock: block });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }),
);

// ----- Panitia -----
app.get(
  "/api/admin/results",
  admin,
  wrap(async (_, res) => {
    const conn = await pool.getConnection();
    try {
      await led.ensureGenesis(conn);
      const [cands] = await conn.query("SELECT id, name FROM candidates"),
        [[p]] = await conn.query("SELECT COUNT(*) n FROM pending_votes");
      res.json({
        tally: await led.tally(conn, cands, SECRET),
        pending: p.n,
        chain: await led.verifyChain(conn),
      });
    } finally {
      conn.release();
    }
  }),
);
app.post(
  "/api/admin/seal",
  admin,
  wrap(async (_, res) => {
    const c = await pool.getConnection();
    try {
      await led.ensureGenesis(c);
      res.json({ sealedBlock: await led.sealIfReady(c, 1) });
    } finally {
      c.release();
    }
  }),
);
app.post(
  "/api/admin/tamper",
  admin,
  wrap(async (req, res) => {
    // demo Tamper Detection; matikan dengan ALLOW_TAMPER_DEMO=false
    if (E.ALLOW_TAMPER_DEMO === "false")
      return res.status(403).json({ error: "Demo tamper dimatikan." });
    await pool.query(
      "UPDATE ledger_blocks SET tx_json = JSON_ARRAY('forged') WHERE idx = ?",
      [Math.max(1, Math.trunc(+req.body.idx) || 1)],
    );
    res.json({ ok: true });
  }),
);
app.get(
  "/api/admin/blocks",
  admin,
  wrap(async (_, res) => {
    const [b] = await pool.query(
      "SELECT idx, ts, merkle_root, prev_hash, hash, JSON_LENGTH(tx_json) AS tx FROM ledger_blocks ORDER BY idx",
    );
    res.json(b);
  }),
);

// Brankas dokumen: server hanya menyimpan blob .secure (enkripsi di browser); format RC4S divalidasi
app.use(
  "/api/docs",
  express.raw({ type: "application/octet-stream", limit: "12mb" }),
);
app.post(
  "/api/docs",
  admin,
  wrap(async (req, res) => {
    const b = req.body;
    if (
      !Buffer.isBuffer(b) ||
      b.length < 53 ||
      b.subarray(0, 4).toString("latin1") !== "RC4S"
    )
      return res
        .status(400)
        .json({ error: "Bukan berkas .secure yang valid." });
    const name = decodeURIComponent(
      String(req.headers["x-file-name"] || "dokumen.secure"),
    )
      .replace(/[\\/]/g, "_")
      .slice(0, 255);
    const [r] = await pool.query(
      "INSERT INTO campaign_docs (name, size, data) VALUES (?,?,?)",
      [name, b.length, b],
    );
    res.json({ id: r.insertId });
  }),
);
app.get(
  "/api/docs",
  admin,
  wrap(async (_, res) =>
    res.json(
      (
        await pool.query(
          "SELECT id, name, size, created_at FROM campaign_docs ORDER BY id DESC",
        )
      )[0],
    ),
  ),
);
app.get(
  "/api/docs/:id",
  admin,
  wrap(async (req, res) => {
    const [[d]] = await pool.query(
      "SELECT data FROM campaign_docs WHERE id = ?",
      [+req.params.id || 0],
    );
    if (!d) return res.status(404).json({ error: "Tidak ditemukan." });
    res.type("application/octet-stream").send(d.data);
  }),
);
app.use((err, _req, res, _next) =>
  res.status(400).json({ error: "Permintaan tidak valid." }),
);

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`E-Voting server berjalan pada port ${PORT}`);
});