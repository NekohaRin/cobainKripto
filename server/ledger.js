// Ballot ledger: hash chaining SHA-256 + Merkle tree. Blok hanya memuat hash pilihan (HMAC), tanpa identitas pemilih.
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const choiceHash = (cid, secret) =>
  crypto
    .createHmac("sha256", secret)
    .update("cand:" + cid)
    .digest("hex");
const blockHash = (i, ts, root, prev) => sha([i, ts, root, prev].join("|"));

function merkleRoot(leaves) {
  let lv = leaves.map(sha);
  while (lv.length > 1) {
    if (lv.length % 2) lv.push(lv.at(-1));
    const n = [];
    for (let i = 0; i < lv.length; i += 2) n.push(sha(lv[i] + lv[i + 1]));
    lv = n;
  }
  return lv[0] || sha("");
}
const iso = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

async function ensureGenesis(conn) {
  const [[r]] = await conn.query("SELECT COUNT(*) n FROM ledger_blocks");
  if (r.n) return;
  const ts = iso(new Date()),
    root = merkleRoot([]);
  await conn.query("INSERT INTO ledger_blocks VALUES (?,?,?,?,?,?)", [
    0,
    ts,
    root,
    "0",
    blockHash(0, ts, root, "0"),
    "[]",
  ]);
}
// Menyegel suara tertunda menjadi satu blok; urutan transaksi diacak agar urutan masuk tak bisa ditelusuri
async function sealIfReady(conn, size) {
  const [pend] = await conn.query(
    "SELECT id, choice_hash FROM pending_votes ORDER BY id",
  );
  if (!pend.length || pend.length < size) return null;
  const txs = pend.map((p) => p.choice_hash);
  for (let i = txs.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [txs[i], txs[j]] = [txs[j], txs[i]];
  }
  const [[last]] = await conn.query(
    "SELECT idx, hash FROM ledger_blocks ORDER BY idx DESC LIMIT 1",
  );
  const idx = last.idx + 1,
    ts = iso(new Date()),
    root = merkleRoot(txs),
    h = blockHash(idx, ts, root, last.hash);
  await conn.query("INSERT INTO ledger_blocks VALUES (?,?,?,?,?,?)", [
    idx,
    ts,
    root,
    last.hash,
    h,
    JSON.stringify(txs),
  ]);
  await conn.query("DELETE FROM pending_votes WHERE id IN (?)", [
    pend.map((p) => p.id),
  ]);
  return idx;
}
async function verifyChain(conn) {
  const [bl] = await conn.query("SELECT * FROM ledger_blocks ORDER BY idx");
  for (let i = 0; i < bl.length; i++) {
    const b = bl[i],
      ts = iso(new Date(b.ts));
    if (merkleRoot(parse(b.tx_json)) !== b.merkle_root)
      return { valid: false, at: b.idx, reason: "Merkle root tidak cocok" };
    if (blockHash(b.idx, ts, b.merkle_root, b.prev_hash) !== b.hash)
      return { valid: false, at: b.idx, reason: "Hash blok tidak cocok" };
    if (i > 0 && b.prev_hash !== bl[i - 1].hash)
      return { valid: false, at: b.idx, reason: "Rantai terputus" };
  }
  return { valid: true, blocks: bl.length };
}
async function tally(conn, candidates, secret) {
  const map = Object.fromEntries(
      candidates.map((c) => [choiceHash(c.id, secret), c.name]),
    ),
    out = {};
  candidates.forEach((c) => {
    out[c.name] = 0;
  });
  const [bl] = await conn.query("SELECT tx_json FROM ledger_blocks");
  bl.forEach((b) =>
    parse(b.tx_json).forEach((h) => {
      if (map[h]) out[map[h]]++;
    }),
  );
  return out;
}
module.exports = {
  choiceHash,
  merkleRoot,
  ensureGenesis,
  sealIfReady,
  verifyChain,
  tally,
};
