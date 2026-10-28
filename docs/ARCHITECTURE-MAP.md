# Architecture map — WhiskayBot pairing and GitHub automation

## Component map

```mermaid
graph TD
    WA[WhatsApp user] --> MAIN[Primary Baileys socket]
    MAIN --> PLUGIN[Command handler]
    PLUGIN --> ACCESS{Owner or active Premium?}
    ACCESS -- no --> DENY[Deny request]
    ACCESS -- yes --> TICKET[Random one-use ticket · 10 min]
    TICKET --> PORTAL[Mini-web HTTP service · JADIBOT_PORT]
    PORTAL --> HOST{Host mode}
    HOST -->|Local dev| TUNNEL[TryCloudflare temporary URL]
    HOST -->|Deployment/server| PUBLIC[Configured public HTTPS URL]
    TUNNEL --> FORM[Responsive phone form]
    PUBLIC --> FORM
    FORM --> STORE[(Pairing ticket JSON)]
    FORM --> WADEEP[wa.me with .jadibotconfirm token]
    WADEEP --> MAIN
    MAIN --> VERIFY[Check user-key + expiry + one-use]
    VERIFY --> SUB[Secondary Baileys socket]
    SUB --> CREDS[(Isolated per-user auth state)]
    SUB --> CODE[Pairing code via private WhatsApp chat]
```

## GitHub update flow

```mermaid
flowchart TD
    PUSH[Push / scheduled timer / manual dispatch] --> HISTORY[Repository update-history workflow]
    PUSH --> METRICS[GitHub metrics workflow]
    METRICS --> PUBLICAPI[Public repository API]
    METRICS --> TRAFFIC{Traffic token configured?}
    TRAFFIC -- yes --> TRAFFICAPI[Views, unique visitors and clones · last 14 days]
    TRAFFIC -- no --> UNKNOWN[Mark traffic unavailable; do not invent numbers]
    PUBLICAPI --> SNAP[(docs/metrics/github-metrics.json)]
    TRAFFICAPI --> SNAP
    UNKNOWN --> SNAP
    SNAP --> LEDGER[(docs/metrics/history.json · bounded history)]
    LEDGER --> CHART[Mermaid charts and timestamp]
    CHART --> README[Update only README marker block]
    README --> COMMIT[Commit generated metrics with skip-ci]
```

## Runtime ownership boundaries

| Component | Owns | Does not own |
|---|---|---|
| Main WhatsApp socket | Incoming commands, owner/premium check, pairing confirmation, delivery of code | Sub-bot's auth credentials |
| Pairing portal | Short-lived ticket and input form | Pairing-code generation or payment confirmation |
| Sub-bot socket | Its own Baileys connection and credentials | Main bot's primary session |
| Rental JSON | Owner/user rental state, price, expiry, pending manual payments | Bank transfer verification via a payment provider |
| GitHub Actions | Timestamped repository snapshot and generated documentation block | Private visitor identity; lifetime page visitor count |

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.
