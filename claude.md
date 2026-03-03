# Claude Project Notes — ERP Certificate (Gryphon Academy)

> This file is updated ruthlessly after every mistake, correction, or project-specific insight.
> Last updated: 2026-03-04

---

## Project Overview

- **Stack**: React (Vite) + Firebase (Firestore, Auth) + Cloudinary
- **Roles**: `superAdmin`, `collegeAdmin`, `student`
- **Firestore mode**: Can toggle between real Firestore and a local DB mode (`isLocalDbMode()`)
- **Deployment**: Vercel (`vercel.json` present)

---

## Architecture Changes (2026-03-03 restructuring)

### What was removed

- **`certificateProjectEnrollments`** collection — entirely deleted from codebase
- **`EnrollProjectCodeModal.jsx`** — no longer used (orphaned, can be deleted)
- Student doc fields: `certificateIds`, `enrolledCertificates`, `certificate`, `certificateStatus`, `certificateResults` — no longer written by `addStudent` or `ExcelStudentImport`

### What was added

- **`certificate_enrollments`** flat subcollection under `students/{projectDocId}/` (NOT nested under each student)
  - Doc ID = `{studentId}_{certificateId}`
  - Fields: `certificateId`, `certificateName`, `examCode`, `email`, `studentId`, `projectCode`, `collegeCode`, `uid`, `status` (enrolled/passed/failed/unenrolled), `isDeleted`, `enrolledAt`, `updatedAt`, `resultDeclaredAt`
  - **Path changed on 2026-03-04**: was `students/{projectDocId}/students_list/{studentId}/certificate_enrollments/{certId}`, now `students/{projectDocId}/certificate_enrollments/{studentId}_{certificateId}` (flat, no collectionGroup queries needed for per-project lookups)
- **`uid`** field on student docs in `students_list` — links student across years/project codes
- **`ProjectCodeCertificates.jsx`** — new page: College → Project Codes → **Certificates** → Students
- **`AssignCertificateModal.jsx`** — new component: Excel upload with EMAIL + EXAM_CODE columns to assign certs to students

### New navigation flow (SuperAdmin)

```
Colleges → CollegeProjectCodes → ProjectCodeCertificates → ProjectCodeStudents
                                   (new page)                (filtered by cert)
```

---

## Firestore Collections Map

| Collection                                        | Key fields queried                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `users`                                           | `email`, `role`, `collegeCode`                                        |
| `student_users`                                   | `email`, `projectCode`                                                |
| `helpTickets`                                     | `createdByUid`, `createdByEmail`, `updatedAt`                         |
| `helpTickets/{id}/remarks`                        | `createdAt`                                                           |
| `students` (top-level, project docs)              | `projectCode`, `collegeCode`                                          |
| `students/{projectDocId}/students_list`           | `email`, `OFFICIAL_DETAILS.EMAIL_ID`, `id`, `uid`, `projectCode`      |
| `students/{projectDocId}/certificate_enrollments` | `certificateId`, `studentId`, `projectCode`, `uid`, `status`, `email` |
| `certificates`                                    | `examCode`, `isActive`                                                |
| `projectCodes`                                    | `collegeId`, `code`                                                   |
| `organizations`                                   | `normalizedName`                                                      |
| `college`                                         | `college_name`                                                        |

> **REMOVED**: `certificateProjectEnrollments` collection — replaced by `certificate_enrollments` flat subcollection under project doc
> **PATH CHANGE (2026-03-04)**: `certificate_enrollments` moved from nested under each student to flat under project doc

---

## Firestore Index Recommendations

Firestore auto-indexes every single field. Composite or collectionGroup indexes must be created manually via Firebase Console or `firestore.indexes.json`.

### Required Indexes

#### 1. `projectCodes` — composite

```
Collection: projectCodes
Fields: collegeId ASC, code ASC
Query scope: Collection
```

#### 2. `students_list` — collectionGroup indexes

```
Collection group: students_list | email ASC
Collection group: students_list | OFFICIAL_DETAILS.EMAIL_ID ASC
Collection group: students_list | certificateIds CONTAINS (legacy)
Collection group: students_list | id ASC
```

#### 3. `certificate_enrollments` — indexes

Since `certificate_enrollments` is now a flat subcollection under each project doc, most queries are direct collection queries (not collectionGroup). CollectionGroup indexes are only needed for cross-project queries:

```
# Direct collection indexes (auto-indexed by Firestore for single fields):
certificate_enrollments | certificateId ASC
certificate_enrollments | studentId ASC
certificate_enrollments | email ASC

# CollectionGroup indexes (only for cross-project queries like getCertificateEnrollmentCounts, softDeleteCertificate):
Collection group: certificate_enrollments | certificateId ASC
Collection group: certificate_enrollments | uid ASC
```

### Optional / Nice-to-have

```
Collection: helpTickets | createdByUid ASC, updatedAt DESC
Collection: helpTickets | createdByEmail ASC, updatedAt DESC
Collection: users | role ASC, email ASC
```

### Deploying indexes

```bash
firebase deploy --only firestore:indexes
```

File: `firestore.indexes.json` at project root (already created).

**Rules for `firestore.indexes.json`:**

- **Composite indexes** (2+ fields) → go in `"indexes"` array
- **Single-field collection group overrides** → go in `"fieldOverrides"` array, NOT `"indexes"`; putting single-field entries in `"indexes"` causes `400: this index is not necessary` error
- **Field paths with spaces** — `OFFICIAL_DETAILS.EMAIL ID` was renamed to `OFFICIAL_DETAILS.EMAIL_ID` (underscore) on 2026-03-02; this fixed the CLI deploy error. All JS/JSX/rules files updated via global rename.

---

## Service Layer Changes

### `certificateService.js` (fully rewritten, ~810 lines)

- **Kept**: `getAllCertificates({ includeInactive })`, `getCertificatesByIds`, `createCertificateAndEnrollStudents`, `updateCertificate`, `commitInChunks`
- **Rewritten**: `getCertificateEnrollmentCounts` → queries `collectionGroup("certificate_enrollments")` (cross-project)
- **Rewritten**: `softDeleteCertificate` → marks enrollment docs as `isDeleted:true` via collectionGroup (cross-project)
- **NEW**: `enrollStudentsIntoCertificate({certificateId, certificateName, examCode, projectCode, studentEmails})` — writes to flat path `students/{projectDocId}/certificate_enrollments/{studentId}_{certificateId}`
- **NEW**: `getCertificatesForProjectCode(projectCode)` → direct collection query on flat subcollection (no collectionGroup needed)
- **NEW**: `getStudentsByCertificateInProject(certificateId, projectCode)` → direct collection query filtered by `certificateId`
- **NEW**: `getStudentCertificateHistory(uid)` → cross-year cert data via UID (collectionGroup)
- **NEW**: `unenrollStudentsFromCertificate({certificateId, projectCode, studentEmails})` → direct collection query
- **NEW**: `declareResultsForCertificate({certificateId, certificateName, projectCodes, emailStatusMap, defaultStatus})` → direct collection query per projectCode
- **NEW**: `getStudentEnrollmentsByProject(projectCode)` → returns `Map<studentId, enrollments[]>` from flat subcollection; used by both college-admin and superadmin Students pages
- **NEW**: `getCertificateEnrollmentStatsByProject(projectCode)` → enrollment counts per certificate for a project
- **REMOVED**: `enrollProjectCodeIntoCertificate`, `getAssignedProjectCodesForCertificate`, `getCertificatesByProjectCode` (old), `unassignProjectCodeFromCertificate`
- **HELPER**: `normalizeExamCode()` — replaces Unicode dash variants (U+2010–U+2015, U+2212) with ASCII hyphen for exam code matching

### `studentService.js` (modified)

- Removed `CERTIFICATES_COLLECTION` and `CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION` constants
- Removed `writeBatch` and `increment` imports
- `addStudent` simplified — no longer auto-enrolls into certificates, writes `uid` field

### `DeclareResultModal.jsx` (rewritten logic)

- No longer queries `certificateProjectEnrollments` directly
- Uses `declareResultsForCertificate` service function
- Finds enrolled project codes by iterating `getCertificatesForProjectCode`

### `ExcelStudentImport.jsx` (updated)

- After `createStudentAuthUser` returns `{uid}`, writes `uid` back to student doc via `updateDoc`

### `StudentCertificateProgress.jsx` (updated)

- Uses `getStudentCertificateHistory(uid)` for cross-year certificate data
- Falls back to legacy `certificateIds` array if no `uid` present

### College-Admin `Students.jsx` (updated 2026-03-04)

- Imports `getStudentEnrollmentsByProject` from `certificateService`
- Fetches enrollments in parallel: `Promise.all([getStudentsByProject, getStudentEnrollmentsByProject])`
- Attaches `_enrollments` array to each student object
- `toDisplayStudent` prefers `_enrollments` (new flat data), falls back to legacy `certificateResults`
- `matchesCertificate` checks `_enrollments` first
- Columns: Student ID (sortable) | Name | Email ID | Current Year | Result Status (sortable with cycle)

### SuperAdmin `ProjectCodeStudents.jsx` (updated 2026-03-04)

- Imports `getStudentEnrollmentsByProject` alongside `getStudentsByCertificateInProject`
- Fetches enrollments in parallel when no certificate filter is active
- `extractStudentDisplayData` includes `email`, `currentYear`, `enrollmentStatus`, `allEnrollments`
- `getCurrentYearFromProjectCode()` helper extracts 3rd segment from project code string
- Columns matched to college-admin layout: Student ID | Name | Email ID | Current Year | Result Status | Edit icon
- Grid: `grid-cols-[1.5fr_2fr_2.5fr_1.2fr_2fr_40px]`
- Result Status shows per-certificate enrollment badges (name: status) with color coding

### `AssignCertificateModal.jsx` (recreated 2026-03-04)

- Recreated after accidental terminal deletion
- `normalizeExamCode()` for Unicode dash handling during exam code matching
- `getAllCertificates({ includeInactive: true })` to match archived certs
- Comma-separated exam codes support in Excel EXAM_CODE column
- Proper `matchedCodes`/`unmatchedCodes` deduplication

### Firestore Rules (updated 2026-03-04)

- Added rule at `students/{projectDocId}/certificate_enrollments/{enrollmentDocId}` for the new flat subcollection path
- Allows read for superAdmin, collegeAdmin (same college), or student whose email matches
- Legacy nested path rule kept for backward compatibility

---

## Known Data Quirks / Bugs to be Aware Of

- `students_list` subcollection stores student emails under TWO different field paths:
  - `email` (normalized string)
  - `OFFICIAL_DETAILS.EMAIL_ID` (nested object, from Excel import) — **renamed from `EMAIL ID` to `EMAIL_ID`** on 2026-03-02 to allow Firestore indexing
  - `OFFICIAL_DETAILS.EMAIL_ID.` (with trailing dot — data inconsistency from some import batch)
- `college` collection name is singular but all others are plural — don't rename, many services rely on it
- `sortTicketsDesc` is done in-memory in `ticketService.js` — moves sort burden to client
- `BATCH_CHUNK_SIZE = 400` in `certificateService.js` — Firestore limit is 500 writes/batch; 400 gives headroom
- **`localDbService.js`** still has 9+ references to `certificateProjectEnrollments` — needs cleanup when local DB mode is tested

---

## Mistakes / Corrections Log

| Date       | Mistake / Observation                                                                                                                                                       | Correction                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-02 | First analysis — index recommendations provided without touching code                                                                                                       | Documented all composite + collectionGroup indexes needed                                                                                                                                      |
| 2026-03-03 | `certificateProjectEnrollments` tightly coupled enrollment to project codes, not students                                                                                   | Restructured to `certificate_enrollments` subcollection under each student                                                                                                                     |
| 2026-03-03 | Student docs had no `uid` field — couldn't track students across years                                                                                                      | Added `uid` field to student docs, written during addStudent and ExcelStudentImport                                                                                                            |
| 2026-03-03 | `create_file` failed on existing file — must delete first                                                                                                                   | Used `Remove-Item` in terminal before `create_file` for certificateService.js                                                                                                                  |
| 2026-03-03 | `EnrollProjectCodeModal.jsx` orphaned — no longer imported or used                                                                                                          | Removed import from CertificateConfig.jsx; file can be manually deleted                                                                                                                        |
| 2026-03-03 | `getCertificatesForProjectCode` & `getStudentsByCertificateInProject` used `collectionGroup` queries which require manually deployed indexes — caused "Failed to load data" | Temporarily rewrote to N+1 direct reads while indexes were missing; reverted to collectionGroup queries once indexes were deployed                                                             |
| 2026-03-02 | N+1 sequential reads in `getCertificatesForProjectCode` (1 students fetch + 1 per student) caused slow load even with 0 enrollments                                         | Reverted to single collectionGroup query on `certificate_enrollments` filtered by `projectCode` — requires deployed index (now live)                                                           |
| 2026-03-03 | `ProjectCodeCertificates.jsx` had no bulk student import or individual add student option                                                                                   | Added `+ Bulk Add Students` (ExcelStudentImport inline), `+ Add Student` (AddStudentModal), renamed "Assign Certificate" to "+ Enroll Certificate"                                             |
| 2026-03-03 | Certificate fetch error crashed entire page — no graceful fallback                                                                                                          | Wrapped `getCertificatesForProjectCode` call in inner try-catch so page loads even if cert query fails                                                                                         |     | 2026-03-02 | `firebase deploy --only firestore:indexes` failed with "Not in a Firebase app directory" — `firebase.json` and `.firebaserc` were missing from the project root | Created `firebase.json` (pointing at `firestore-rules.txt` + `firestore.indexes.json`) and `.firebaserc` (project: `erp-certification`) at project root |
| 2026-03-02 | Firebase CLI deploy failed with 403 — wrong account (`sonavaneayush1@gmail.com`) was active; project owner is `ayushssonavane@gmail.com`                                    | Used `firebase login:add` then `firebase login:use ayushssonavane@gmail.com` to switch to owner account                                                                                        |
| 2026-03-02 | Single-field collection group indexes placed in `"indexes"` array caused `400: this index is not necessary`                                                                 | Moved single-field collection group entries to `"fieldOverrides"` array; only composite (2+ field) indexes belong in `"indexes"`                                                               |
| 2026-03-02 | `OFFICIAL_DETAILS.EMAIL ID` field path (contains a space) rejected by Firebase CLI in `fieldOverrides` with regex validation error                                          | Renamed field key from `EMAIL ID` to `EMAIL_ID` across all JS/JSX/rules files via PowerShell global replace; added `OFFICIAL_DETAILS.EMAIL_ID` to `fieldOverrides` in `firestore.indexes.json` |
| 2026-03-02 | Existing Firestore student docs still had old `OFFICIAL_DETAILS["EMAIL ID"]` key after code rename                                                                          | Ran `scripts/migrateEmailIdField.js` — updated 120 docs across 6 project codes in Firestore via batch writes; old key deleted, new `EMAIL_ID` key written atomically                           |
| 2026-03-04 | `certificate_enrollments` nested under each student required collectionGroup queries for per-project lookups — slow and required manual index deploys                       | Restructured to flat subcollection `students/{projectDocId}/certificate_enrollments/{studentId}_{certificateId}` — direct collection queries, no collectionGroup needed for per-project ops    |
| 2026-03-04 | Firestore rules only had old nested path — new flat path caused "Missing or insufficient permissions"                                                                       | Added Firestore rule at `students/{projectDocId}/certificate_enrollments/{enrollmentDocId}`; deployed via `firebase deploy --only firestore:rules`                                             |
| 2026-03-04 | `AssignCertificateModal.jsx` accidentally deleted via terminal `Remove-Item`                                                                                                | Recreated from scratch with all improvements (normalizeExamCode, comma-separated codes, includeInactive, unmatchedCodes dedup)                                                                 |
| 2026-03-04 | AZ-900 exam code not matching — Unicode dashes (–, —) from Excel copy-paste didn't match ASCII hyphens in Firestore                                                         | Added `normalizeExamCode()` helper that replaces Unicode dash variants with ASCII hyphen; applied in AssignCertificateModal matching logic                                                     |
| 2026-03-04 | SuperAdmin ProjectCodeStudents had academic detail columns (DOB, 10th%, 12th%, UG%, PG%) instead of matching college-admin layout                                           | Changed columns to Student ID, Name, Email ID, Current Year, Result Status + Edit icon — matching college-admin Students page                                                                  |

---

## Project Personalisation Reminders

- **Do NOT rename** the `college` collection to `colleges` — live data uses `college`
- Always check `isLocalDbMode()` guard before assuming Firestore path in services
- The `firestore-rules.txt` file contains security rules — sync with Firebase Console before deploying rule changes
- Python seeder (`seed_students_excel.py`) imports students via Excel; field names come directly from Excel headers
- Firebase Functions are in `functions/` — separate `package.json`, deploy independently
- `localDbService.js` needs cleanup — still references old `certificateProjectEnrollments` functions
- **`firebase.json`** and **`.firebaserc`** must exist at project root for any `firebase deploy` command to work; they are NOT committed to git (check `.gitignore`) so must be recreated if missing
- **Active Firebase account** for deploys is `ayushssonavane@gmail.com` (project owner); `sonavaneayush1@gmail.com` is a secondary account without deploy permissions — always check with `firebase login:list` before deploying
- **`OFFICIAL_DETAILS.EMAIL_ID`** — field was renamed from `EMAIL ID` (with space) to `EMAIL_ID` (underscore) on 2026-03-02; all 120 Firestore student docs migrated via `scripts/migrateEmailIdField.js`; re-run this script if new legacy-format docs are imported
- Single-field collection group indexes → `fieldOverrides` in `firestore.indexes.json`; composite indexes → `indexes` array
- **`certificate_enrollments` flat path**: `students/{projectDocId}/certificate_enrollments/{studentId}_{certificateId}` — doc ID is composite; do NOT use collectionGroup for per-project queries (use direct collection reference instead)
- **SuperAdmin and College-Admin Students columns are now identical**: Student ID | Name | Email ID | Current Year | Result Status — keep them in sync if either changes
- **`normalizeExamCode()`** in `AssignCertificateModal.jsx` and `certificateService.js` — handles Unicode dashes from Excel; must be applied whenever comparing exam codes from user input
