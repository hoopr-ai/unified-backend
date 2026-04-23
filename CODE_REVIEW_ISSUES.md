# Code Review Issues - UNIFIED-BACKEND

**Generated:** 2026-04-23
**Branch:** staging
**Status:** Pending Implementation

---

## 🔴 CRITICAL ISSUES (3)

### 1. Security: Hardcoded Secrets in `.env`
- **Location:** `.env` (lines 84-124)
- **Issue:** Database credentials, JWT secret, SMTP password, API keys (Gemini, EnableX), and GCP service account JSON are exposed in version control
- **Action:** Rotate all credentials immediately, use secrets manager (AWS Secrets Manager, GCP Secret Manager, or Vault)
- **Status:** [ ] Not Started

### 2. SQL Injection Risk
- **Location:** `services/persistence-service/token/token.persistence.service.ts:173, 400, 514`
- **Issue:** Using `sequelize.literal()` with string interpolation: `` `"tokenBalance" - ${amount}` ``
- **Action:** Use `sequelize.decrement()` instead
- **Status:** [ ] Not Started

### 3. N+1 Query Problem - Album Lookups
- **Location:** `services/business-service/track/track.service.ts:167-187`
- **Issue:** `fetchAlbumsForTracks()` makes one query per track (20 tracks = 20 DB calls)
- **Action:** Batch fetch albums with single query using `WHERE id IN (...)`
- **Status:** [ ] Not Started

---

## 🟠 HIGH PRIORITY - Performance (5)

### 4. Debug Logging in Production Hot Path
- **Location:** `services/persistence-service/track/track.persistence.service.ts:196-609`
- **Issue:** ~20+ `console.log` statements execute on every track API call, including SQL logging
- **Action:** Remove debug logs or use proper logger with log levels
- **Status:** [ ] Not Started

### 5. Blocking AI Service Call in Rails
- **Location:** `services/business-service/rail/rail.service.ts:435-452`
- **Issue:** `ensureBrandRecommendedRail()` calls external AI service synchronously, blocking entire request
- **Action:** Move to background job (BullMQ) or lazy-load asynchronously
- **Status:** [ ] Not Started

### 6. Owner Resolution - Full Table Scans
- **Location:** `services/business-service/track/track.service.ts:307-365`
- **Issue:** Three functions fetch ALL owners then filter in JavaScript (3x per request)
- **Action:** Use database WHERE clause filtering instead of application-level filtering
- **Status:** [ ] Not Started

### 7. Missing Database Indexes
- **Location:** `services/persistence-service/track/schemas/track.schema.ts`
- **Issue:** Missing indexes on frequently filtered columns: `status`, `trending`, `releaseDate`, `ownerId`, `campaignId`
- **Action:** Add composite indexes for common query patterns
- **Status:** [ ] Not Started

### 8. Campaign Status Update in Query Path
- **Location:** `services/persistence-service/track/track.persistence.service.ts:90-160`
- **Issue:** `markExpiredCampaigns()` runs an UPDATE query inside every track listing query
- **Action:** Move to background scheduler (cron job)
- **Status:** [ ] Not Started

---

## 🟠 HIGH PRIORITY - Architecture (4)

### 9. Mixed Error Types
- **Location:** Multiple files:
  - `services/business-service/rail/rail.service.ts` (lines 651, 656, 767, 775, 789, 799, 809, 847, 855, 876, 881, 886, 890, 1020, 1068)
  - `services/helper-service/gcs.helper.ts` (lines 24, 31, 49, 60, 89, 124)
  - `services/helper-service/sms.service.ts` (line 40)
  - `controllers/user.controller.ts` (line 80)
- **Issue:** Mix of `throw new Error()` and `throw new AppError()` breaks error handling pipeline
- **Action:** Standardize all errors to `AppError` with proper HTTP status codes
- **Status:** [ ] Not Started

### 10. Business Logic in Controllers
- **Location:**
  - `controllers/rail.controller.ts:114-189` (validation functions)
  - `controllers/licenses.controller.ts:54-82` (validation logic)
- **Issue:** Complex validation logic and type parsing in controllers
- **Action:** Move to validation middleware or service layer
- **Status:** [ ] Not Started

### 11. Persistence Logic in Business Services
- **Location:**
  - `services/business-service/track/track.service.ts:72-88` (Sequelize include builders)
  - `services/business-service/playlist/playlist.service.ts:123-132` (direct OwnerModel.findAll)
- **Issue:** Direct Sequelize queries and ORM model imports in business layer
- **Action:** Keep all DB queries in persistence layer
- **Status:** [ ] Not Started

### 12. Controllers Bypass Business Layer
- **Location:**
  - `controllers/rail.controller.ts:14` (imports copyRailToPages from persistence)
  - `controllers/track.controller.ts:22` (imports searchBrands from persistence)
- **Issue:** Controllers directly import persistence services
- **Action:** Always go through business service layer
- **Status:** [ ] Not Started

---

## 🟡 MEDIUM PRIORITY - Code Quality (5)

### 13. Code Duplication - Pagination
- **Location:** 7 files with duplicate pagination parsing:
  - `services/business-service/track/track.service.ts:35-45`
  - `services/business-service/album/album.service.ts:18-28`
  - `services/business-service/playlist/playlist.service.ts:41-49`
  - `services/business-service/owner/owner.service.ts:8-9`
  - `controllers/occasion.controller.ts:25-27`
  - `controllers/licenses.controller.ts:90-91`
  - `controllers/liked-track.controller.ts:57-58`
- **Issue:** Each implements pagination with slight variations (different defaults, limits)
- **Action:** Create shared `services/helper-service/pagination.helper.ts`
- **Status:** [ ] Not Started

### 14. Code Duplication - Owner Maps
- **Location:**
  - `services/business-service/track/track.service.ts:106-164`
  - `services/business-service/playlist/playlist.service.ts:111-132`
- **Issue:** Same owner fetching and mapping logic repeated
- **Action:** Extract to shared utility in helper-service
- **Status:** [ ] Not Started

### 15. Large Files Need Splitting
- **Location:**
  - `services/business-service/track/track.service.ts` (943 lines)
    - Split into: track-transformer.service.ts, track-filter.service.ts, track-listing.service.ts, track-detail.service.ts
  - `services/business-service/user/user.service.ts` (760 lines)
    - Split into: user-auth.service.ts, user-session.service.ts, user-password.service.ts, user-profile.service.ts
- **Issue:** Files too large, multiple responsibilities
- **Action:** Split by responsibility
- **Status:** [ ] Not Started

### 16. Sequential Awaits That Could Parallelize
- **Location:** `services/business-service/track/track.service.ts:548-551`
- **Issue:** `fetchOwnerMaps()` and `fetchAlbumsForTracks()` run sequentially but are independent
- **Code:**
  ```typescript
  const { ownerTypeMap, ownerSubTypeMap, ownerCodeMap } = await fetchOwnerMaps(rawData.rows);
  const albumMap = await fetchAlbumsForTracks(rawData.rows);  // Should run in parallel
  ```
- **Action:** Use `Promise.all()` to parallelize
- **Status:** [ ] Not Started

### 17. User Query Redundancy in Controllers
- **Location:** `controllers/track.controller.ts:41-93`
- **Issue:** Every track endpoint queries user to get brandId, which should be in JWT/session
- **Code:**
  ```typescript
  const userId = req.session?.userId;
  const user = userId ? await findUserById(userId) : null;  // Extra query every request
  const brandId = user?.brandId;
  ```
- **Action:** Add brandId to session/JWT token payload during login
- **Status:** [ ] Not Started

---

## 🟡 MEDIUM PRIORITY - Security (4)

### 18. CORS Allows No-Origin Requests
- **Location:** `services/helper-service/cors.config.ts:29-32`
- **Issue:** Allows requests with no Origin header (enables tools to bypass CORS)
- **Code:**
  ```typescript
  if (!origin) {
    return callback(null, true);  // Allows Postman, curl, etc.
  }
  ```
- **Action:** Remove exception for production environment
- **Status:** [ ] Not Started

### 19. SSL Certificate Validation Disabled
- **Location:** `services/persistence-service/database.ts:68`
- **Issue:** `rejectUnauthorized: false` allows MITM attacks
- **Action:** Set `rejectUnauthorized: process.env.NODE_ENV === 'production'`
- **Status:** [ ] Not Started

### 20. Missing Security Headers
- **Location:** `app.ts`
- **Issue:** No CSP, HSTS, X-Frame-Options, X-Content-Type-Options headers
- **Action:** Add `helmet` middleware:
  ```typescript
  import helmet from "helmet";
  app.use(helmet());
  ```
- **Status:** [ ] Not Started

### 21. IP Header Trust Without Validation
- **Location:** `services/helper-service/session.helper.ts:64-73`
- **Issue:** Trusts user-controllable X-Forwarded-For header without validation
- **Action:** Validate against known proxy IPs or use `trust proxy` Express setting properly
- **Status:** [ ] Not Started

---

## 🔵 LOW PRIORITY (3)

### 22. Naming Inconsistencies
- **Location:** `services/business-service/`
- **Issue:**
  - `licence/` folder vs `licenses/` folder exists (typo)
  - Mixed method prefixes: `getXxx`, `findXxx`, `fetchXxx`, `searchXxx` without clear distinction
- **Action:** Standardize naming conventions
- **Status:** [ ] Not Started

### 23. Incomplete Redis Caching
- **Location:** Various persistence services
- **Issue:**
  - Tracks, owners, and albums not cached
  - Only rails have 10-minute cache (`services/persistence-service/rail/rail.persistence.service.ts:8-118`)
- **Action:** Implement caching strategy for frequently accessed data
- **Status:** [ ] Not Started

### 24. Console.error in Error Handler
- **Location:** `middlewares/errorHandler.ts:6`
- **Issue:** Logs full error objects, potentially exposing stack traces in production
- **Action:** Use structured logger, sanitize sensitive data before logging
- **Status:** [ ] Not Started

---

## Summary Priority Matrix

| Priority | Count | Impact |
|----------|-------|--------|
| Critical | 3 | Security breach, data loss |
| High Performance | 5 | Slow API responses (100ms→1s+) |
| High Architecture | 4 | Maintenance nightmare |
| Medium Quality | 5 | Technical debt |
| Medium Security | 4 | Attack vectors |
| Low | 3 | Minor issues |

**Total Issues:** 24

---

## Implementation Order Recommendation

### Phase 1: Security (Immediate)
1. Issue #1 - Rotate secrets
2. Issue #2 - Fix SQL injection
3. Issue #18 - Fix CORS
4. Issue #20 - Add security headers

### Phase 2: Performance (Week 1)
5. Issue #3 - Fix N+1 album queries
6. Issue #4 - Remove debug logging
7. Issue #7 - Add database indexes
8. Issue #8 - Move campaign update to background

### Phase 3: Architecture (Week 2)
9. Issue #9 - Standardize error handling
10. Issue #11 - Move persistence logic
11. Issue #12 - Fix controller imports

### Phase 4: Code Quality (Week 3+)
12. Issue #13 - Extract pagination helper
13. Issue #15 - Split large files
14. Issue #16 - Parallelize async operations

---

## Notes

- This document should be updated as issues are resolved
- Mark issues as `[x] Completed` when fixed
- Add new issues discovered during implementation
- Review this document during sprint planning
