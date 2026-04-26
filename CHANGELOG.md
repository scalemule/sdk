# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
