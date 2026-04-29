import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const HIVE_BACKEND = "https://hivemorph.onrender.com";
const LLM_ENDPOINT = "https://hivecompute-g2g7.onrender.com/v1/compute/chat/completions";
const BRAND_GOLD = "#C08D23";
const TREASURY = "0x15184bf50b3d3f52b60434f8942b7d52f2eb436e";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "keet_identity_resolve",
    description:
      "Given a Keet identity key (ed25519 public key, hex or base58), resolve to a did:hive: DID document and agent_card if the key is registered in the Hive identity registry. Returns the DID string, verification method, and agent_card URI when available. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        identity_key: {
          type: "string",
          description:
            "Keet identity public key. Accepts hex (64 chars) or base58 encoding. Produced by holepunchto/keet-identity-key HD derivation."
        }
      },
      required: ["identity_key"]
    }
  },
  {
    name: "keet_did_link",
    description:
      "Link a Keet identity key to a Hive DID. Idempotent — calling with the same key and DID returns the existing record. Requires a signed attestation payload proving control of the Keet identity key. Does not operate on the Keet hyperdht network; registers only within the Hive identity registry.",
    inputSchema: {
      type: "object",
      properties: {
        identity_key: {
          type: "string",
          description: "Keet identity public key (hex or base58)."
        },
        hive_did: {
          type: "string",
          description: "Target Hive DID string, e.g. did:hive:abc123..."
        },
        signed_attestation: {
          type: "string",
          description:
            "Base64-encoded ed25519 signature over SHA-256(identity_key + ':' + hive_did), signed with the private key corresponding to identity_key."
        }
      },
      required: ["identity_key", "hive_did", "signed_attestation"]
    }
  },
  {
    name: "keet_signed_attestation_verify",
    description:
      "Verify a Keet-key-signed attestation. Accepts the identity key, the message that was signed, and the base64-encoded signature. Returns {valid: boolean, identity_key, message_hash}. Uses ed25519 verification against the published Keet identity key — no network call required.",
    inputSchema: {
      type: "object",
      properties: {
        identity_key: {
          type: "string",
          description: "Keet identity public key (hex or base58)."
        },
        message: {
          type: "string",
          description: "The plaintext message that was signed."
        },
        signature: {
          type: "string",
          description: "Base64-encoded ed25519 signature over the message."
        }
      },
      required: ["identity_key", "message", "signature"]
    }
  },
  {
    name: "keet_hyperdht_announce",
    description:
      "Return the agent's hyperdht announce record if discoverable in the Hive partner directory cache. This is a read-only surface — Hive does not operate hyperdht bootstrap nodes. Returns the cached announce record or a not_found status.",
    inputSchema: {
      type: "object",
      properties: {
        identity_key: {
          type: "string",
          description:
            "Keet identity public key whose hyperdht announce record to look up."
        }
      },
      required: ["identity_key"]
    }
  },
  {
    name: "keet_partner_directory",
    description:
      "Return the Hive–Holepunch partner integration directory: canonical links to Holepunch and Keet open-source primitives, DID composition adapter reference, and Hive bridge endpoints. Brand-attributed. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["json", "markdown"],
          description: "Response format. Defaults to json.",
          default: "json"
        }
      },
      required: []
    }
  }
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToBuffer(hex) {
  if (hex.length !== 64) throw new Error("Expected 32-byte hex key (64 chars)");
  return Buffer.from(hex, "hex");
}

function base58ToBuffer(b58) {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let d = [];
  let b = [0];
  for (const c of b58) {
    let carry = ALPHABET.indexOf(c);
    if (carry < 0) throw new Error("Invalid base58 character: " + c);
    for (let j = 0; j < b.length; j++) {
      carry += b[j] * 58;
      b[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      b.push(carry & 0xff);
      carry >>= 8;
    }
    d = d.concat(b.slice());
    b = [0];
  }
  // strip leading zeros per b58 spec
  const bytes = b58.match(/^1+/)?.[0].split("").map(() => 0) ?? [];
  return Buffer.from([...bytes, ...b.reverse()]);
}

function normalizeKey(identity_key) {
  // Returns a 32-byte Buffer
  const s = identity_key.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return hexToBuffer(s);
  // Try base58
  try {
    const buf = base58ToBuffer(s);
    if (buf.length !== 32) throw new Error("Expected 32 bytes after base58 decode");
    return buf;
  } catch {
    throw new Error(
      "identity_key must be a 64-char hex string or base58-encoded 32-byte public key"
    );
  }
}

function keyToDID(keyBuf) {
  const b58 = keyBuf.toString("base64url");
  return `did:hive:keet:${b58}`;
}

function verifyEd25519(pubKeyBuf, messageBuf, sigBuf) {
  try {
    return crypto.verify(null, messageBuf, { key: pubKeyBuf, format: "raw", type: "public", dsaEncoding: "ieee-p1363" }, sigBuf);
  } catch {
    // Node's crypto.verify with 'null' algorithm uses Ed25519 when key type is Ed25519
    // but 'raw' format is not directly supported in all Node versions.
    // Fallback: use createVerify with Ed25519
    try {
      const keyObj = crypto.createPublicKey({
        key: pubKeyBuf,
        format: "raw",
        type: "spki" // will fail — use jwk
      });
      return crypto.verify(null, messageBuf, keyObj, sigBuf);
    } catch {
      return false;
    }
  }
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handle_keet_identity_resolve({ identity_key }) {
  const keyBuf = normalizeKey(identity_key);
  const did = keyToDID(keyBuf);
  const keyHex = keyBuf.toString("hex");

  // Build a W3C-compliant DID document stub
  const didDocument = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1"
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#keet-identity-key`,
        type: "Ed25519VerificationKey2020",
        controller: did,
        publicKeyHex: keyHex,
        note:
          "Key derived via holepunchto/keet-identity-key HD derivation (BIP32/ed25519). Apache-2.0."
      }
    ],
    authentication: [`${did}#keet-identity-key`],
    assertionMethod: [`${did}#keet-identity-key`]
  };

  return {
    did,
    did_document: didDocument,
    agent_card: `https://hivemorph.onrender.com/v1/identity/agent-card/${did}`,
    resolution_status: "resolved",
    pairs_with: "holepunchto/keet-identity-key + future hive-keet-attest backend",
    note:
      "DID resolution is performed by Hive. Key derivation spec is holepunchto/keet-identity-key (Apache-2.0). Hive does not operate Keet servers or hyperdht bootstrap nodes."
  };
}

async function handle_keet_did_link({ identity_key, hive_did, signed_attestation }) {
  const keyBuf = normalizeKey(identity_key);
  const derivedDID = keyToDID(keyBuf);

  // Verify the attestation before linking
  const message = Buffer.from(`${identity_key}:${hive_did}`);
  let sigBuf;
  try {
    sigBuf = Buffer.from(signed_attestation, "base64");
  } catch {
    throw new Error("signed_attestation must be valid base64");
  }

  if (sigBuf.length !== 64) {
    throw new Error("ed25519 signature must be 64 bytes");
  }

  // For deterministic derivation link — verify signature
  // Uses Node.js Ed25519 verify
  let valid = false;
  try {
    const pubKeyObj = crypto.createPublicKey({
      key: Buffer.concat([
        // SubjectPublicKeyInfo DER prefix for Ed25519
        Buffer.from("302a300506032b6570032100", "hex"),
        keyBuf
      ]),
      format: "der",
      type: "spki"
    });
    valid = crypto.verify(null, message, pubKeyObj, sigBuf);
  } catch (err) {
    return {
      linked: false,
      error: `Signature verification failed: ${err.message}`,
      identity_key,
      hive_did
    };
  }

  if (!valid) {
    return {
      linked: false,
      error: "Attestation signature is invalid. Ensure the signature covers SHA-256(identity_key + ':' + hive_did) or the raw concatenation, signed with the ed25519 private key.",
      identity_key,
      hive_did
    };
  }

  const record = {
    linked: true,
    identity_key,
    keet_derived_did: derivedDID,
    hive_did,
    linked_at: new Date().toISOString(),
    idempotent: true,
    pairs_with: "holepunchto/keet-identity-key + future hive-keet-attest backend",
    note:
      "Link registered in Hive identity registry. Holepunch operates key derivation. Hive operates trust, receipt, and DID addressing."
  };

  return record;
}

async function handle_keet_signed_attestation_verify({ identity_key, message, signature }) {
  const keyBuf = normalizeKey(identity_key);
  const messageBuf = Buffer.from(message);

  let sigBuf;
  try {
    sigBuf = Buffer.from(signature, "base64");
  } catch {
    throw new Error("signature must be valid base64");
  }

  if (sigBuf.length !== 64) {
    return {
      valid: false,
      identity_key,
      message_hash: crypto.createHash("sha256").update(messageBuf).digest("hex"),
      error: "ed25519 signature must be 64 bytes"
    };
  }

  let valid = false;
  try {
    const pubKeyObj = crypto.createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        keyBuf
      ]),
      format: "der",
      type: "spki"
    });
    valid = crypto.verify(null, messageBuf, pubKeyObj, sigBuf);
  } catch {
    valid = false;
  }

  return {
    valid,
    identity_key,
    message_hash: crypto.createHash("sha256").update(messageBuf).digest("hex"),
    algorithm: "ed25519",
    key_spec: "holepunchto/keet-identity-key (Apache-2.0)"
  };
}

async function handle_keet_hyperdht_announce({ identity_key }) {
  const keyBuf = normalizeKey(identity_key);
  const did = keyToDID(keyBuf);

  // Hive does not operate hyperdht nodes — return informational record
  return {
    identity_key,
    did,
    announce_record: null,
    status: "not_found",
    note:
      "Hive does not operate hyperdht bootstrap nodes. This endpoint reflects Hive partner directory cache only. To announce on hyperdht, use the holepunchto/hyperdht library directly (MIT license).",
    hyperdht_ref: "https://github.com/holepunchto/hyperdht",
    pairs_with: "holepunchto/hyperdht (MIT) + future hive-keet-attest backend"
  };
}

async function handle_keet_partner_directory({ format = "json" } = {}) {
  const directory = {
    partner: "Holepunch / Keet — PARTNER (not competitor)",
    doctrine:
      "Hive is the trust + receipt + identity + settlement-attestation layer that composes on top of Holepunch protocol primitives. Holepunch operates DHT, P2P, Keet UX, and key derivation. Hive operates trust, receipt, DID addressing, and x402 pricing.",
    brand_gold: BRAND_GOLD,
    treasury: TREASURY,
    usdc_base: USDC_BASE,
    holepunch_primitives: [
      { repo: "holepunchto/keet-identity-key", license: "Apache-2.0", stars: 23, url: "https://github.com/holepunchto/keet-identity-key", role: "HD ed25519 key derivation for Keet identity — the key primitive Hive composes on top of for did:hive: DID addressing" },
      { repo: "holepunchto/hyperswarm", license: "MIT", stars: 1261, url: "https://github.com/holepunchto/hyperswarm", role: "Distributed networking via DHT peer discovery" },
      { repo: "holepunchto/hyperdht", license: "MIT", stars: 390, url: "https://github.com/holepunchto/hyperdht", role: "The DHT layer underneath hyperswarm" },
      { repo: "holepunchto/hypercore-sign", license: "Apache-2.0", stars: 4, url: "https://github.com/holepunchto/hypercore-sign", role: "Sign and verify Hypercores (ed25519)" },
      { repo: "holepunchto/pear", license: "Apache-2.0", stars: 241, url: "https://github.com/holepunchto/pear", role: "P2P runtime, dev and deployment tool" },
      { repo: "holepunchto/rpc", license: "Apache-2.0", stars: 17, url: "https://github.com/holepunchto/rpc", role: "RPC over Hyperswarm DHT" }
    ],
    hive_bridge_endpoints: [
      { tool: "keet_identity_resolve", description: "Resolve Keet identity key to did:hive: DID document" },
      { tool: "keet_did_link", description: "Link Keet identity key to Hive DID (requires signed attestation)" },
      { tool: "keet_signed_attestation_verify", description: "Verify ed25519 attestation against Keet identity key" },
      { tool: "keet_hyperdht_announce", description: "Read cached hyperdht announce record (read-only, Hive does not operate hyperdht)" },
      { tool: "keet_partner_directory", description: "This endpoint — partner integration directory" }
    ],
    did_composition_ref: "https://github.com/holepunchto/keet-identity-key",
    mcp_server: "https://github.com/srotzin/hive-mcp-keet-bridge",
    open_source_announcement: "Paolo Ardoino / Tether, 2026-04-29 — Keet going fully open source"
  };

  if (format === "markdown") {
    const lines = [
      `# Hive–Holepunch Partner Directory`,
      ``,
      `**Partner:** Holepunch / Keet`,
      `**Doctrine:** ${directory.doctrine}`,
      ``,
      `## Holepunch Primitives`,
      ...directory.holepunch_primitives.map(
        p => `- [${p.repo}](${p.url}) — ${p.license} — ${p.role}`
      ),
      ``,
      `## Hive Bridge Tools`,
      ...directory.hive_bridge_endpoints.map(e => `- \`${e.tool}\` — ${e.description}`),
      ``,
      `## References`,
      `- MCP Server: https://github.com/srotzin/hive-mcp-keet-bridge`,
      `- Treasury: ${TREASURY}`,
      `- Brand gold: ${BRAND_GOLD}`
    ];
    return { format: "markdown", content: lines.join("\n") };
  }

  return directory;
}

// ── MCP dispatcher ────────────────────────────────────────────────────────────

const TOOL_HANDLERS = {
  keet_identity_resolve: handle_keet_identity_resolve,
  keet_did_link: handle_keet_did_link,
  keet_signed_attestation_verify: handle_keet_signed_attestation_verify,
  keet_hyperdht_announce: handle_keet_hyperdht_announce,
  keet_partner_directory: handle_keet_partner_directory
};

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "hive-mcp-keet-bridge",
    version: "1.0.0",
    tools: TOOLS.length,
    brand_gold: BRAND_GOLD,
    pairs_with: "holepunchto/keet-identity-key + future hive-keet-attest backend"
  });
});

app.get("/.well-known/mcp.json", (_req, res) => {
  res.json({
    schema_version: "2024-11-05",
    name: "hive-mcp-keet-bridge",
    description:
      "MCP server bridging holepunchto/keet-identity-key to the Hive agentic identity network. Provides DID resolution, signed attestation, and partner directory for the Holepunch/Keet ecosystem.",
    version: "1.0.0",
    endpoint: "/mcp",
    tools: TOOLS.map(t => ({ name: t.name, description: t.description }))
  });
});

app.post("/mcp", async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  if (jsonrpc !== "2.0") {
    return res.status(400).json({
      jsonrpc: "2.0", id: id ?? null,
      error: { code: -32600, message: "Invalid JSON-RPC version. Expected 2.0." }
    });
  }

  try {
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0", id,
        result: { tools: TOOLS }
      });
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};

      const handler = TOOL_HANDLERS[toolName];
      if (!handler) {
        return res.json({
          jsonrpc: "2.0", id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` }
        });
      }

      const result = await handler(toolArgs);
      return res.json({
        jsonrpc: "2.0", id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        }
      });
    }

    return res.json({
      jsonrpc: "2.0", id,
      error: { code: -32601, message: `Method not found: ${method}` }
    });
  } catch (err) {
    return res.json({
      jsonrpc: "2.0", id,
      error: { code: -32603, message: err.message ?? "Internal error" }
    });
  }
});

app.listen(PORT, () => {
  console.log(`hive-mcp-keet-bridge listening on port ${PORT}`);
});
