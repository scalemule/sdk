# @scalemule/sdk

Official TypeScript/JavaScript SDK for ScaleMule Backend-as-a-Service.

Zero dependencies. Works in browsers, Node.js 18+, and edge runtimes.

## Install

```bash
npm install @scalemule/sdk
```

## Quick Start

```ts
import { ScaleMule } from '@scalemule/sdk'

const sm = new ScaleMule({ apiKey: 'sm_pb_xxx' })

// Register
const { data, error } = await sm.auth.register({
  email: 'user@example.com',
  password: 'SecurePassword123!',
  name: 'Jane Doe',
})

if (error) {
  console.error(error.code, error.message)
} else {
  console.log('User created:', data.id)
}
```

Every method returns `{ data, error }` — never throws on API errors.

## Configuration

```ts
const sm = new ScaleMule({
  apiKey: 'sm_pb_xxx',               // required
  environment: 'prod',               // 'dev' | 'prod' (default: 'prod')
  baseUrl: 'https://api.example.com', // overrides environment preset
  timeout: 30000,                    // request timeout in ms
  retry: {
    maxRetries: 2,                   // retry on 429/5xx (default: 2)
    backoffMs: 300,                  // base delay with jitter (default: 300)
  },
  enableRateLimitQueue: true,        // auto-queue on 429
  enableOfflineQueue: true,          // queue when offline, sync on reconnect
  debug: false,                      // log requests to console
})
```

| Environment | Gateway URL |
|-------------|-------------|
| `prod` | `https://api.scalemule.com` |
| `dev` | `https://api-dev.scalemule.com` |

## Response Contract

All methods return `ApiResponse<T>`:

```ts
type ApiResponse<T> = {
  data: T | null       // null when error is present
  error: ApiError | null  // null on success
}

type ApiError = {
  code: string         // machine-readable (e.g., 'unauthorized')
  message: string      // human-readable
  status: number       // HTTP status code
  details?: Record<string, unknown>
}
```

Paginated methods return `PaginatedResponse<T>`:

```ts
type PaginatedResponse<T> = {
  data: T[]
  metadata: { total: number; totalPages: number; page: number; perPage: number }
  error: ApiError | null
}
```

## Auth

```ts
// Register & Login
const { data } = await sm.auth.register({ email, password, name })
const { data } = await sm.auth.login({ email, password })
await sm.auth.logout()

// Current user
const { data: user } = await sm.auth.me()

// Session management
await sm.auth.refreshSession()
sm.setAccessToken(token)
sm.clearAccessToken()

// Password
await sm.auth.forgotPassword({ email })
await sm.auth.resetPassword({ token, newPassword })
await sm.auth.changePassword({ currentPassword, newPassword })

// Email verification
await sm.auth.verifyEmail({ token })
await sm.auth.resendVerification()

// Phone OTP
await sm.auth.sendPhoneOtp({ phone, purpose: 'verify_phone' })
await sm.auth.verifyPhoneOtp({ phone, code })
await sm.auth.loginWithPhone({ phone, code })
// SDK auto-sanitizes formatting before send:
// "(415) 555-1234" -> "+4155551234"

// OAuth
const { data } = await sm.auth.getOAuthUrl('google', { redirectUri })
const { data } = await sm.auth.handleOAuthCallback({ provider, code, state })

// Sessions, Devices, Login History
const { data } = await sm.auth.sessions.list()
await sm.auth.sessions.revoke(sessionId)
const { data } = await sm.auth.devices.list()
const { data } = await sm.auth.loginHistory.list()

// MFA
const { data } = await sm.auth.mfa.getStatus()
const { data } = await sm.auth.mfa.setupTotp()
await sm.auth.mfa.verifySetup({ code })
await sm.auth.mfa.disable({ password })
```

### Phone Country Picker Helpers

```ts
import { PHONE_COUNTRIES, composePhoneNumber, normalizeAndValidatePhone } from '@scalemule/sdk'

const us = PHONE_COUNTRIES.find((country) => country.code === 'US')
const phone = composePhoneNumber(us?.dialCode ?? '+1', '(415) 555-1234')
const normalized = normalizeAndValidatePhone(phone)

if (!normalized.valid) {
  console.error(normalized.error)
} else {
  await sm.auth.register({ email, password, phone: normalized.normalized! })
}
```

## Storage

```ts
// Upload (3-step presigned URL flow, hidden from you)
const { data, error } = await sm.storage.upload(file, {
  filename: 'photo.jpg',
  isPublic: false,
  onProgress: (pct) => console.log(`${pct}%`),
  signal: abortController.signal,
})

// Signed URLs for viewing/downloading
const { data } = await sm.storage.getViewUrl(fileId)
const { data: urls } = await sm.storage.getViewUrls(fileIds)  // batch, up to 100
const { data } = await sm.storage.getDownloadUrl(fileId)

// File operations
const { data: info } = await sm.storage.getInfo(fileId)
const { data: files, metadata } = await sm.storage.list({ page: 1, perPage: 20 })
await sm.storage.delete(fileId)

// Split upload (server-side: get URL → client uploads to S3 → complete)
const { data: upload } = await sm.storage.getUploadUrl('photo.jpg', 'image/jpeg')
// ... client uploads to upload.upload_url ...
const { data: result } = await sm.storage.completeUpload(upload.file_id, upload.completion_token)
```

## Data

```ts
// CRUD
const { data: doc } = await sm.data.create('todos', { title: 'Ship SDK', done: false })
const { data: doc } = await sm.data.get('todos', docId)
await sm.data.update('todos', docId, { done: true })
await sm.data.delete('todos', docId)

// Query with filters and sorting
const { data: docs, metadata } = await sm.data.query('todos', {
  filters: [{ operator: 'eq', field: 'done', value: false }],
  sort: [{ field: 'created_at', direction: 'desc' }],
  page: 1,
  perPage: 20,
})

// Collections
await sm.data.createCollection('todos')
const { data } = await sm.data.listCollections()

// My documents (filtered by current user)
const { data } = await sm.data.myDocuments('todos')

// Aggregations
const { data } = await sm.data.aggregate('orders', {
  pipeline: [{ $group: { field: 'status', fn: 'count' } }],
})
```

**Filter operators**: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`

## Video

```ts
const { data } = await sm.video.upload(videoFile, {
  onProgress: (pct) => console.log(`${pct}%`),
})
const { data } = await sm.video.get(videoId)
const { data } = await sm.video.getStreamUrl(videoId)
await sm.video.trackPlayback(videoId, { event: 'play', position: 0 })
```

## Realtime

```ts
// Subscribe (auto-connects WebSocket on first call)
const unsub = sm.realtime.subscribe('chat:room-1', (msg) => {
  console.log('Message:', msg)
})

// Publish
await sm.realtime.publish('chat:room-1', { text: 'hello' })

// Connection status
console.log(sm.realtime.status) // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

// Cleanup
unsub()
sm.realtime.disconnect()
```

Features: auto-reconnect with backoff, re-subscribe on reconnect, heartbeat/ping-pong.

## Chat

```ts
const { data: convo } = await sm.chat.createConversation({ participantIds: [a, b] })
const { data: msg } = await sm.chat.sendMessage(convo.id, { content: 'Hello!' })
const { data: msgs } = await sm.chat.getMessages(convo.id, { limit: 50 })
await sm.chat.sendTyping(convo.id)
await sm.chat.markRead(convo.id)
```

## Social

```ts
await sm.social.follow(userId)
await sm.social.unfollow(userId)
const { data: post } = await sm.social.createPost({ content: 'Hello!', visibility: 'public' })
const { data: feed } = await sm.social.getFeed({ limit: 20 })
await sm.social.like('post', postId)
const { data } = await sm.social.getComments(postId)
```

## Teams

```ts
const { data: team } = await sm.teams.create({ name: 'Engineering' })
await sm.teams.invite(team.id, { email: 'dev@company.com', role: 'member' })
await sm.teams.acceptInvitation(token)
const { data: members } = await sm.teams.listMembers(team.id)
```

## Billing

```ts
const { data: customer } = await sm.billing.createCustomer({ email, name })
const { data: sub } = await sm.billing.subscribe({ customerId, planId })
await sm.billing.reportUsage({ metric: 'api_calls', quantity: 1000 })
const { data: invoices } = await sm.billing.listInvoices()
```

## Analytics

```ts
await sm.analytics.track('button_clicked', { buttonId: 'signup' })
await sm.analytics.trackPageView({ path: '/pricing' })
await sm.analytics.trackBatch([
  { event: 'page_view', properties: { path: '/home' } },
  { event: 'page_view', properties: { path: '/pricing' } },
])
```

## More Services

```ts
// Queue
await sm.queue.enqueue({ job_type: 'email.welcome', payload: { userId }, priority: 'high' })

// Scheduler
const { data } = await sm.scheduler.createJob({
  name: 'daily-report', cron: '0 9 * * *',
  type: 'webhook', config: { url: 'https://myapp.com/api/report' },
})
await sm.scheduler.pauseJob(jobId)
await sm.scheduler.runNow(jobId)

// Permissions
await sm.permissions.createRole({ name: 'editor' })
await sm.permissions.assignPermissions(roleId, ['posts.create', 'posts.edit'])
const { data: { allowed } } = await sm.permissions.check(userId, 'posts.create')

// Communication
await sm.communication.sendEmail({ to: 'user@example.com', subject: 'Welcome!', body: '<h1>Hi</h1>' })
await sm.communication.sendEmailTemplate('welcome', { to: email, variables: { name: 'Jane' } })

// Search
await sm.search.index('products', { id: '1', name: 'Widget', price: 9.99 })
const { data } = await sm.search.query('products', { query: 'widget', limit: 10 })

// Cache
await sm.cache.set('key', { value: 'data' }, { ttl: 3600 })
const { data } = await sm.cache.get('key')

// Graph
const { data: node } = await sm.graph.createNode({ label: 'person', properties: { name: 'Alice' } })
const { data: edge } = await sm.graph.createEdge({ fromId: a, toId: b, type: 'knows' })

// Content Moderation
await sm.flagContent.createFlag({ content_type: 'post', content_id: postId, category: 'spam' })

// Webhooks
await sm.webhooks.create({ url: 'https://myapp.com/hooks', events: ['auth.user.created'] })

// Leaderboard
await sm.leaderboard.submitScore(boardId, { userId, score: 1500 })

// Listings
const { data } = await sm.listings.nearby({ lat: 40.7, lng: -74.0, radius: 10 })

// Events
const { data: event } = await sm.events.create({ title: 'Launch Party', startDate: '2026-03-01' })

// Functions
const { data } = await sm.functions.invoke('resize', { imageUrl: '...', width: 200 })

// Photo
const { data } = await sm.photo.upload(imageFile)

// Compliance
await sm.compliance.log({ action: 'user.deleted', resourceType: 'user', resourceId: id })

// Orchestrator
const { data } = await sm.orchestrator.execute(workflowId, { userId })
```

## All 30 Services

| Service | Property | Description |
|---------|----------|-------------|
| Auth | `sm.auth` | Authentication, sessions, MFA, OAuth, phone |
| Storage | `sm.storage` | File upload (presigned S3), signed URLs |
| Realtime | `sm.realtime` | WebSocket pub/sub with auto-reconnect |
| Video | `sm.video` | Video upload, streaming, analytics |
| Data | `sm.data` | Document CRUD, queries, aggregations |
| Chat | `sm.chat` | Conversations, messages, typing, read receipts |
| Social | `sm.social` | Follow, posts, feed, likes, comments |
| Billing | `sm.billing` | Customers, subscriptions, invoices, usage |
| Analytics | `sm.analytics` | Event tracking, page views, funnels |
| Communication | `sm.communication` | Email, SMS, push notifications |
| Scheduler | `sm.scheduler` | Cron jobs, one-time jobs |
| Permissions | `sm.permissions` | Roles, permissions, RBAC |
| Teams | `sm.teams` | Team management, invitations, SSO |
| Accounts | `sm.accounts` | Client/application management |
| Identity | `sm.identity` | API key management |
| Cache | `sm.cache` | Redis key-value cache |
| Queue | `sm.queue` | Async job processing |
| Search | `sm.search` | Full-text search |
| Webhooks | `sm.webhooks` | Webhook management |
| Graph | `sm.graph` | Graph database (nodes, edges, traversal) |
| Functions | `sm.functions` | Serverless function execution |
| Listings | `sm.listings` | Marketplace listings |
| Events | `sm.events` | Event management, registration |
| Leaderboard | `sm.leaderboard` | Gamification leaderboards |
| Photo | `sm.photo` | Image processing |
| Flag Content | `sm.flagContent` | Content moderation |
| Compliance | `sm.compliance` | GDPR, audit logs |
| Orchestrator | `sm.orchestrator` | Workflow automation |
| Logger | `sm.logger` | Centralized logging |
| Catalog | `sm.catalog` | Service registry |

## Error Codes

| Code | HTTP | When |
|------|------|------|
| `unauthorized` | 401 | Missing or invalid auth |
| `forbidden` | 403 | Valid auth, insufficient permissions |
| `not_found` | 404 | Resource doesn't exist |
| `validation_error` | 422 | Bad input (`details` has per-field errors) |
| `rate_limited` | 429 | Too many requests (`details.retryAfter`) |
| `conflict` | 409 | Duplicate resource |
| `file_scanning` | 202 | File uploaded, scan not complete |
| `file_threat` | 403 | Malware detected |
| `internal_error` | 500 | Server error |

## TypeScript

Full type definitions included. All service methods, request/response types, and error codes are typed.

```ts
import type {
  ScaleMuleConfig,
  ApiResponse,
  ApiError,
  PaginatedResponse,
  QueryFilter,
  QuerySort,
  PresignedUploadResponse,
  UploadCompleteResponse,
} from '@scalemule/sdk'
```

## License

Proprietary - ScaleMule Inc.
