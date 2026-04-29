# hive-mcp-keet-bridge

**MCP server — Hive–Holepunch/Keet identity bridge**

Bridges [holepunchto/keet-identity-key](https://github.com/holepunchto/keet-identity-key) (Apache-2.0) into the Hive agentic identity network. Exposes DID resolution, signed attestation verification, and a partner directory as MCP tools. Read-only resolution and attestation — Hive does not operate hyperdht bootstrap nodes or Keet servers.

**Holepunch is a partner.** This shim composes on top of the Holepunch identity primitive. It does not fork, replace, or compete with Keet, hyperswarm, or hyperdht.

---

## Partner doctrine

| Layer | Owner |
|---|---|
| DHT peer discovery and transport | Holepunch (hyperswarm, hyperdht) |
| HD ed25519 key derivation | Holepunch (keet-identity-key, Apache-2.0) |
| Keet UX and messaging | Holepunch / Keet |
| DID resolution and trust registry | Hive |
| Signed attestation and receipt layer | Hive |
| x402 agent commerce pricing | Hive |

---

## Tools

| Tool | Description | Read-only |
|---|---|---|
| `keet_identity_resolve` | Resolve a Keet identity key (ed25519, hex or base58) to a `did:hive:` DID document and `agent_card` URI | Yes |
| `keet_did_link` | Link a Keet identity key to a Hive DID — idempotent, requires a signed attestation proving key control | Write (Hive registry only) |
| `keet_signed_attestation_verify` | Verify an ed25519 attestation signed by a Keet identity key — no network call required | Yes |
| `keet_hyperdht_announce` | Return cached hyperdht announce record for a given identity key — Hive does not operate hyperdht | Yes |
| `keet_partner_directory` | Holepunch + Keet partner integration directory with canonical links and Hive bridge endpoints | Yes |

---

## Endpoints

| Path | Method | Description |
|---|---|---|
| `/mcp` | `POST` | JSON-RPC 2.0 MCP endpoint (protocol: `2024-11-05`) |
| `/health` | `GET` | Server health and tool count |
| `/.well-known/mcp.json` | `GET` | MCP manifest |

---

## Connect

### MCP client config (stdio-compatible HTTP)

```json
{
  "mcpServers": {
    "hive-mcp-keet-bridge": {
      "url": "https://hive-mcp-keet-bridge.onrender.com/mcp",
      "transport": "http"
    }
  }
}
```

### Smithery

Submit at: `https://smithery.ai/new?repo=srotzin/hive-mcp-keet-bridge`

### Glama / MCP.so

Auto-crawled from GitHub. Claim after 24-72h at:
- `https://glama.ai/mcp/servers/srotzin/hive-mcp-keet-bridge`

---

## Usage examples

### Resolve a Keet identity key

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "keet_identity_resolve",
    "arguments": {
      "identity_key": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
    }
  }
}
```

### Verify a signed attestation

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "keet_signed_attestation_verify",
    "arguments": {
      "identity_key": "a1b2c3d4e5f6...",
      "message": "did:hive:keet:abc123",
      "signature": "<base64-encoded ed25519 signature>"
    }
  }
}
```

### Partner directory

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "keet_partner_directory",
    "arguments": { "format": "json" }
  }
}
```

---

## Key derivation spec

Identity keys are produced by [holepunchto/keet-identity-key](https://github.com/holepunchto/keet-identity-key) — a BIP32-style hierarchical deterministic (HD) derivation generating ed25519 keypairs for the Keet identity system. This library is licensed under Apache-2.0 and is developed and maintained by Holepunch.

Hive's DID composition maps each Keet identity root deterministically to a `did:hive:keet:<base64url-pubkey>` string. The mapping is purely additive — the Holepunch key derivation spec is unchanged.

---

## Boundary: what Hive does not do

- Hive does not operate hyperdht bootstrap nodes.
- Hive does not operate Keet servers or relay traffic.
- Hive does not fork or modify `keet-identity-key`.
- Hive does not issue settlement assets on behalf of Holepunch or Tether.
- This shim does not claim to run on the Keet network — it resolves and attests.

---

## Runtime

- Node.js >= 18
- Express 4.x
- Zero DHT or P2P dependencies in this shim
- LLM calls: `https://hivecompute-g2g7.onrender.com/v1/compute/chat/completions` (Hive internal)

---

## Pairs with

- `holepunchto/keet-identity-key` (Apache-2.0) — key derivation spec
- `future: hive-keet-attest` backend — signed attestation persistence layer (in roadmap)
- `hive-mcp-inbox` spec — peer-to-peer agent messaging over Holepunch transport

---

## License

MIT — see [LICENSE](./LICENSE).

Composes on top of [holepunchto/keet-identity-key](https://github.com/holepunchto/keet-identity-key), which is licensed under the Apache License, Version 2.0. That library is referenced as a specification — it is not bundled with this package.

---

*Hive Civilization. Brand gold `#C08D23`. Treasury `0x15184bf50b3d3f52b60434f8942b7d52f2eb436e`.*

## Hive Civilization Directory

Part of the Hive Civilization — agent-native financial infrastructure.

- Endpoint Directory: https://thehiveryiq.com
- Live Leaderboard: https://hive-a2amev.onrender.com/leaderboard
- Revenue Dashboard: https://hivemine-dashboard.onrender.com
- Other MCP Servers: https://github.com/srotzin?tab=repositories&q=hive-mcp

Brand: #C08D23
<!-- /hive-footer -->
