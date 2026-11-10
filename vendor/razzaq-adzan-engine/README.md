# RAZZAQ ADZAN ENGINE

**Package:** `@razzaq-ventures/adzan-engine`  
**Release:** `1.3.0`  
**Runtime:** Node.js 20+  
**Module system:** JavaScript ESM  
**Runtime dependencies:** none  
**License:** MIT

A modular, offline-first prayer-time software foundation: configurable solar calculations, Qibla bearing, iCalendar export, Hijri tabular conversion, schedule diagnostics, reference-data normalization, HTTP API, device payloads, and a local JSON state store.

> [!CAUTION]
> This project is not a religious authority and is not certified by Kemenag/SIHAT. The included Indonesia parameters are a configurable reference preset, not an official implementation. The default solar algorithm is a Meeus low-order apparent solar-coordinate model; the legacy NOAA approximation remains selectable for comparison. Validate results with the official local timetable or a trusted mosque before using them for worship. Hijri conversion is arithmetic/tabular and does not determine local rukyat decisions.

## Quick start

```bash
npm run check
npm test
npm run example
```

```js
import { createAdzanEngine, METHODS } from '@razzaq-ventures/adzan-engine';
const engine = createAdzanEngine({
  location: { latitude: 3.6985, longitude: 98.6893, elevationMeters: 3 },
  timeZone: 'Asia/Jakarta',
  method: METHODS.INDONESIA_KEMENAG_REFERENCE
});
const today = engine.getSchedule({ date: '2026-10-31' });
console.log(today.times.fajr.time, engine.getQibla());
```

The coordinates in `examples/medan.mjs` are an administrative reference point for Kelurahan Besar, Medan Labuhan, not a user's home/device GPS coordinate.

## v1.3.0 capabilities

- Daily prayer-time calculations for Fajr, Dhuhr, Asr, Maghrib and Isha; supporting Imsak, sunrise and Duha.
- Configurable calculation presets, Asr shadow factor, IANA time zones, elevation and per-event minute corrections.
- Absolute event timestamps, strict chronological-order validation and immutable engine configuration.
- Current/next prayer and multi-day schedule ranges.
- Qibla initial bearing referenced to true north.
- RFC-style iCalendar export.
- Arithmetic Hijri conversion with explicit `tabular-civil` provenance.
- Schedule diagnostics and comparison against a caller-supplied reference timetable.
- Reference timetable normalization with mandatory source attribution; it does not fetch or certify official data.
- Versioned offline-ready JSON payload for an embedded device.
- HTTP endpoints for health, prayer schedule and Qibla.
- Atomic JSON state-store helper for a single process/device.
- Scheduler missed-event policy (`skip`/`emit`), lateness metadata, optional timer `unref()`, and idempotent lifecycle.

## Solar algorithm selection

Meeus is the default. For controlled regression comparisons, select the legacy NOAA model explicitly:

```js
const schedule = engine.getSchedule({ date: '2026-10-31', algorithm: 'noaa' });
```

Each schedule records `metadata.algorithmId`, `metadata.precisionClass`, and `metadata.calculationVersion` so results can be traced. The Meeus model is not NREL SPA and has not been certified against Kemenag/SIHAT.

## API

```js
import { createAdzanApi } from '@razzaq-ventures/adzan-engine';
const server = createAdzanApi({ engineOptions: {
  location: { latitude: 3.6985, longitude: 98.6893 },
  timeZone: 'Asia/Jakarta'
}});
server.listen(3000, '127.0.0.1');
```

Endpoints:

- `GET /health`
- `GET /v1/prayer-times?date=YYYY-MM-DD`
- `GET /v1/qibla`

The example binds to loopback only. Before exposing the API publicly, add TLS termination, authentication, rate limiting, request logging, network restrictions and operational monitoring. An optional `authorize(req)` callback is supported. The API currently provides read-only endpoints.

## Reference data and audit

`normalizeReferenceSchedule(data, { source, license })` validates caller-provided reference times and records provenance. It intentionally does not assume an undocumented Kemenag endpoint, scrape data, or imply official verification. `compareSchedules(calculated, reference)` reports minute differences; a human must decide whether the reference is authoritative and what correction is appropriate.

## Scheduler and persistence

`AdzanScheduler` emits events; audio playback, notifications and WhatsApp are adapters outside the calculation core. Its in-memory fired-event set does not survive restarts and is not a distributed lock. `JsonStateStore` provides atomic local persistence helpers, but is not yet wired into scheduler recovery and is not suitable for multi-instance coordination. For clustered production use a transactional database plus a lease/leader-election mechanism and idempotent delivery keys.

## Embedded/IoT integration

`createDeviceSchedulePayload(schedule, { deviceId })` creates a schema-versioned payload that can be sent to an ESP32/Raspberry Pi device. Hardware drivers, RTC synchronization (e.g. DS3231), audio output, firmware OTA, secure provisioning and device fleet management are not included in this JavaScript core. Devices should retain a validated schedule locally for offline operation and expose clock-sync/health telemetry.

## Accuracy and known limitations

- The default Meeus low-order model is an improvement over the previous NOAA fractional-year approximation, but it is not NREL SPA or a full high-precision ephemeris. The legacy NOAA model remains selectable with `algorithm: 'noaa'`; Meeus is selected by default.
- High-latitude fallback policies are not implemented yet; unavailable solar events raise an error rather than silently fabricating times.
- No official Kemenag/SIHAT connector or verified timetable dataset is bundled.
- No rukyat-aware Hijri authority, magnetic-declination model, live GPS, audio player, WhatsApp adapter, database-backed cluster scheduler or hardware firmware is bundled.
- No claim of production certification or religious validation is made.

## Project layout

```text
src/                 Calculation engine and platform modules
examples/            Medan example and local API server
test/                Node.js built-in test suite
.github/workflows/   CI matrix for Node 20/22/24
```

## Security

See [SECURITY.md](./SECURITY.md). Do not expose the example API publicly without deployment-level security controls.

## License

MIT. See [LICENSE](./LICENSE).
