# Optional Nectar Nomada OS integration

The supplied JSON Schemas and OpenAPI are proposed contracts, not a deployed service. No platform repository, credentials or existing schema were supplied. Firmware runs locally without the OS; cellular transport uses Blues Notehub. A user may export raw local records over USB instead of enabling cellular/cloud integration.

## Ingestion and custody

Sensor reading → durable CRC-wrapped journal → successful correlated `note.add` response into `hive.qo` → Notehub → authenticated HTTPS route → transactionally committed platform storage. Only the successful correlated note.add response permits removal of that matching local record. That acknowledgement is custody by the Notecard, not proof the platform received it. A lost acknowledgement can produce a duplicate; idempotent ingestion is required. Radio/store loss after local deletion is a residual single-custodian risk. For stronger guarantees, implement application receipt acknowledgements and a larger local retention medium before claiming end-to-end redundant delivery.

Configure a Notehub route transformation explicitly mapping verified device/event metadata to `notecard_uid`, `notehub_event_uid`, `received_at`, and `body`. The supplied envelope is not asserted to be Notehub's default unmodified webhook. Test captured real events against it. Keep route secrets server-side. Reject bodies >16 KiB and enforce schema/version limits before database writes.

POST /v1/ingest/notehub: authenticate route, check UID registry/tenant binding, validate payload, verify event_id matches device/epoch/sequence, resolve hive assignment at observation time, then atomically insert immutable raw observation and outbox work item. Unique index on (device_id, epoch, sequence); canonical-payload hash supports exact duplicate = 200 duplicate, same ID/different content = 409 quarantine. Transient database failure = 503 and no acknowledgement; malformed = 400; auth = 401/403; size = 413; throttling = 429. Use bounded route retries and a dead-letter queue with operator visibility.

Retain event time, received time and time quality separately. Null observation time stays unknown; do not substitute ingestion time as if measured then. Preserve raw ADC/counts/trim data, calibration ID and firmware/configuration versions. Derived results and interpretations are separately versioned records referencing raw event IDs. Missing sensor values are null with faults, never zeros. Later calibration changes do not mutate original evidence.

## Data model

Tables/collections: tenants; members/roles; devices; Notecard bindings; hive assignment intervals; raw_observations; derived_measurements (algorithm/version/input IDs); alerts (rule/version/evidence/status); calibration records; service events; experiments/blocks/microparcels/plants/branches/treatments; video manifests/annotations; document releases; audit events; ingestion outbox/dead-letter queue. Device UID reassignment requires owner authorization and an auditable interval change.

GET endpoints in openapi.json use tenant-scoped bearer authentication, opaque cursor pagination, bounded limit, and stable order (received_at,event_id). Filter observation time with from/to only when timestamps are known; expose unknown-time records separately. Health responses describe evidence and uncertainty. Label weight loss/tilt/battery alerts as rule-based indications; never report a diagnosed swarm/disease from this RC1 sensor set alone. Debounce alerts, suppress duplicates and allow user thresholds/quiet periods in the platform. No notifications are sent by this packet.

## Documentation library

Publish this packet as an immutable versioned equipment/document release after owner approval through the platform's existing permissions model. Store SHA-256, version, compatible hardware, build guide, calibration/service guide, firmware bundle, release status and superseded-by link. Owners and authorized users can download; public build files can have separate explicit visibility. Keep secrets and private field datasets out of the build packet. QR labels link a device to its authorized equipment page, not to embedded credentials.

Platform acceptance: offline operation; duplicate/conflict handling; wrong-tenant denial on every endpoint and object URL; untrusted video filename rejection; schema compatibility; backpressure/retry; raw/derived separation; docs access; export without vendor lock-in. Server implementation is assigned in CLAUDE_CODE_HANDOFF.md and has not been run here.
