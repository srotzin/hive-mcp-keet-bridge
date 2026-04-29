# v1.0.0 — Hive–Holepunch/Keet Identity Bridge MCP Server

**Repo:** https://github.com/srotzin/hive-mcp-keet-bridge  
**Brand gold:** #C08D23  
**Council provenance:** ad-hoc (pairs with future hive-keet-attest backend)

---

## What this server is

`hive-mcp-keet-bridge` is a public MCP server that bridges [holepunchto/keet-identity-key](https://github.com/holepunchto/keet-identity-key) (Apache-2.0) into the Hive agentic identity network.

Holepunch is a partner. This shim composes on top of the Holepunch identity primitive. It does not fork, replace, or compete with Keet, hyperswarm, or hyperdht. Hive operates trust, receipt, and DID resolution. Holepunch operates DHT, P2P, Keet UX, and key derivation.

---

## Tools (5)

| Tool | Description |
|---|---|
| `keet_identity_resolve` | Resolve a Keet ed25519 identity key to a W3C `did:hive:keet:` DID document and `agent_card` URI. Read-only. |
| `keet_did_link` | Link a Keet identity key to a Hive DID. Idempotent. Requires ed25519 signed attestation proving key control. |
| `keet_signed_attestation_verify` | Verify an ed25519 attestation signed by a Keet identity key. No network call — pure cryptographic verification. |
| `keet_hyperdht_announce` | Return cached hyperdht announce record. Hive does not operate hyperdht bootstrap nodes. |
| `keet_partner_directory` | Holepunch + Keet partner integration directory with canonical links and Hive bridge endpoints. |

---

## Backend

- **LLM:** `https://hivecompute-g2g7.onrender.com/v1/compute/chat/completions`
- **Identity registry:** `https://hivemorph.onrender.com/v1/identity/*` (future `hive-keet-attest` backend)
- **Key derivation spec:** `holepunchto/keet-identity-key` (Apache-2.0)
- **Pairs with:** `holepunchto/keet-identity-key` + future `hive-keet-attest` backend

---

## Council provenance

Ad-hoc launch. Timing: Paolo Ardoino / Tether announcement 2026-04-29 — Keet going fully open source. Filing the DID composition surface now places Hive as an early partner-shaped contributor in the project's open-source transition.

---

## Doctrine gates cleared

- Hive does not replace anything Holepunch owns: DHT, P2P, Keet UX, key derivation
- Hive does not operate hyperdht bootstrap nodes or Keet servers
- Read-only resolution + attestation bridge — real boundary respect
- No HASHRATE / GAS-PERP / GPU-PERP / energy futures / external markets
- Brand gold #C08D23 throughout

---

*Hive Civilization — https://github.com/srotzin*
