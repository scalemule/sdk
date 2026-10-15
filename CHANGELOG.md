# Changelog

## 0.0.77 - 2026-10-14

- **Experiments (A/B tests) on flag variants.** `sm.flags.experiment(flagKey, { session_id })` returns the visitor's sticky `variant`; `sm.analytics.trackExposure(flagKey, variant)` records the exposure; `withExperiments(properties, assignments)` attaches `properties.experiments = { flag_key: variant }` to any event so the analytics experiment report (`/v1/analytics/admin/experiments/{flag_key}`, shown on the admin Flags page) attributes every tracked event to its variant. `FlagClient.experiment` is the local-evaluation counterpart. Helpers: `experimentVariant`, `normalizeExperiments`, `exposureEvent`, `isExperimentKey`, `isVariantKey`.

## 0.0.76 - 2026-10-13

- Add the opt-in `localIntelligence` News/BaseNews client and scoped, expiring agent-cache helper. Existing authentication and publication workflows are unchanged.
- Publication UI, BaseNews hosting and broad agent activation remain subsequent rollout work.

## 0.0.75

- Add bounded browser photo preparation and 15-second video / 60-second voice capture, following CoralMeet capture limits. Recording tracks are released on completion, cancellation, or permission races.
- Add contributor-owned Community Maps history/updates and stable attachment retry keys. The publication backend still owns authorization and moderation.
- Make browser image compression a normal, lazily loaded dependency so bundlers can resolve it without eval. HEIC conversion and uploads while the browser is closed remain unsupported.


## 0.0.70

- Add typed client API-key methods for idempotent Social content projections and creator discovery settings. Customer apps still own their moderation and canonical records; this patch does not add a hosted moderation workflow.

## 0.0.68

- Preserve HTTP 202 authentication challenges as API errors with no session, and allow login challenge proof fields. Framework-independent clients still render their own challenge UI; the Next.js SDK supplies it.

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.76] - 2026-10-13

## [0.0.67] - 2026-09-22

### Fixed
- Format the polls client so the publish lint passes.

## [0.0.66] - 2026-09-22

### Fixed
- Poll list query options satisfy the SDK query-string helper so the package type build succeeds.

## [0.0.65] - 2026-09-22

### Added
- **PollsService** (`sm.polls`): create, publish, read, and vote on reader polls. Questions and choices can carry text, image, video, or audio. `pollVoterKey` stores a device key for public ballots.

### Added
- **`sm.decisions`** (`services/decisions.ts`): Business Logic Plane evaluation — `evaluate(key, inputs, options?)`,
  `evaluateBatch(items)`, `getReceipt(id)`, `verifyReceipt(id)`. Results carry outcome, value, reason codes,
  proposed actions (never dispatched), release versions, `facts_hash` and a signed receipt whose
  `signed_document` can be handed to domain services. Idempotency via `options.idempotency_key`.
- **`sm.bookings`** (`services/bookings.ts`): quotes (`createQuote`, `getQuote`, `acceptQuote` with a verified
  `appointment.deposit` receipt), `getCustomerStats`, and host/admin `completeBooking` / `markNoShow`
  which maintain the customer-stats projection decisions read.

## [0.0.64] - 2026-08-18

### Added
- **Signals error context on `ApiError`** (`types.ts`, `client.ts`): failed requests now carry
  optional `field`, `requestId`, `traceId`, `retryable` and `problem` alongside the existing
  `code` / `message` / `status` / `details`. `field` and `retryable` come from the response body's
  `error` object, `requestId` from `meta.request_id` falling back to the gateway's `x-request-id`
  response header, `traceId` from `meta.trace_id`, and `problem` is the raw body `error` object
  passed through untouched. This lets `@scalemule/signals` (`fromError`) attribute a failure to the
  owning form field and correlate it with a request id.

  Purely additive: every new field is optional and only set when the backend supplies it, and no
  existing field was renamed, removed or changed. `code` remains lowercase_snake.

## [0.0.51] - 2026-05-02

### Fixed
- **S3 upload retry logic** (`upload-to-s3.ts`): 4xx responses (esp. 403 SignatureDoesNotMatch) are
  now classified as fatal instead of being retried as if transient. This stops burning the retry
  budget on permanent failures and surfaces a structured `s3_signature_error` code so callers can
  refresh URLs or fail fast.
- **Multipart part 403 handling** (`upload-to-s3.ts`): 403 on a part PUT now short-circuits the
  per-part retry loop and bubbles `refreshable: true`, letting the multipart wrapper fetch a fresh
  presigned URL within ~0s instead of after exhausting ~4s of retries.
- **AbortSignal handlers actually abort the XHR** (`upload-to-s3.ts`): both `doSinglePut` and
  `doPartPut` now call `xhr.abort()` when the caller's AbortSignal fires, instead of just resolving
  the promise. Previously the request kept consuming bandwidth in the background.
- **S3 error visibility** (`storage.ts`, `upload-to-s3.ts`): on any S3 PUT failure, the response
  body is now captured (truncated to 1KB) and the AWS error code (e.g. `SignatureDoesNotMatch`,
  `RequestTimeout`) is extracted and included in `upload_diagnostics`. Previously every failure
  looked identical in our logs.

## [0.0.50] - 2026-04-29

### Added
- `tts.synthesize({ text, speechProfile?, voice?, model?, provider?, async?, accessMode? })`, `tts.getJob(id)`, and `tts.listVoices({ provider? })` on the public SDK surface.
- Built-in TTS speech-profile types and response metadata exports for `private_default`, `developer_summary`, `public_blog`, and `enterprise_strict`.

### Changed
- `audio.register()` now targets `/v1/audio/register`, matching the gateway route.
- `storage.upload()` normalizes `/signed-url/complete` responses from `{ file_id, ... }` into the public `FileInfo` shape so `result.data.id` is stable for direct uploads.

## [0.0.42] - 2026-04-26

### Added
- `storage.getSettings()` / `storage.updateSettings(settings)` — wrappers over `GET / PUT /v1/storage/settings` (the per-app storage + media-pipeline config endpoint).
- `MediaPolicy`, `StorageSettings`, `ContentPolicy` exported types.

## [0.0.41] - 2026-04-26

### Changed
- `FileStatus` is now exported from the package root (oversight in 0.0.40 — the type existed but wasn't re-exported, so consumers couldn't import it).

## [0.0.40] - 2026-04-26

### Added
- `storage.getFileStatus(fileId)` — single-call status read for any file. Returns `{ scan, optimize, transcode, urls }` aggregating storage's local scan state with constructed URL paths for image (transform) and video (HLS playlist). Foundational primitive for the upcoming `useFileStatus()` hook + `<ScaleMuleMedia>` component (Phase 3 of the realtime-chat media pipeline ADR).
- `FileStatus` exported type for the response shape.

## [0.0.39] - 2026-04-26

### Added
- `video.register({ fileId, userId? })` — synchronous handshake for storage-uploaded videos. Mirrors `photo.register()`. Verifies cross-app authz, reads scan status, and creates a video record with `id == file_id` (the storage-backed video invariant). Idempotent.
- `video.uploadViaStorage(file, options)` — composes `storage.uploadPrivate()` with `video.register()`. Returns `{ file_id, video_id, original_view_url, hls_url_promise }`. The promise resolves to the HLS master playlist URL once transcoding completes (30s polling timeout for now).
- `RegisterVideoRequest`, `RegisterVideoResponse`, `VideoUploadViaStorageResult` exported types.

### Changed
- `VideoService` constructor now takes `StorageService` as a second argument (wired up by the top-level `ScaleMule` constructor; existing call sites unchanged).

## [0.0.38] - 2026-04-26

### Added
- `storage.uploadPrivate(file, options)` — fail-closed private-attachment helper. Same browser→S3 pipeline as `storage.upload()` but enforces `is_public: false` and `skipCompression: true` non-overridably; rejects any response that comes back marked public. Designed as the shared primitive that `@scalemule/chat`'s chat-attachment uploader and `@scalemule/nextjs`'s upcoming `useMedia()` hook will both call.
- `photo.uploadViaStorage(file, options)` — composes `storage.uploadPrivate()` with the existing `photo.register()` to upload + register in one call. Returns `{ file_id, photo_id, original_view_url, optimized_url_promise }` where `optimized_url_promise` resolves once the photo optimizer finishes (10s polling timeout for now; swapped for realtime in a later release).
- `UploadViaStorageResult` exported type for the result shape.

### Changed
- `PhotoService` constructor now takes `StorageService` as a second argument (wired up by the top-level `ScaleMule` constructor; user-facing call sites unchanged).
- Removed admin-only billing import endpoints from the public client SDK surface.
- Marked passwordless auth methods as experimental in API docs.
- Removed internal rollout terminology from public source comments.
- Refreshed changelog structure for publish readiness.

## [0.0.1] - 2026-03-04

### Added
- Initial public pre-v1 baseline of the ScaleMule TypeScript SDK.
- Typed service modules for auth, data, storage, realtime, billing, and related platform APIs.
