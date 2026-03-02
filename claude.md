# Claude Project Notes — ERP Certificate (Gryphon Academy)

> This file is updated ruthlessly after every mistake, correction, or project-specific insight.
> Last updated: 2026-03-02

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

- **`certificate_enrollments`** subcollection under `students/{projectDocId}/students_list/{studentId}/`
  - Doc ID = certificateId
  - Fields: `certificateId`, `certificateName`, `examCode`, `email`, `studentId`, `projectCode`, `collegeCode`, `uid`, `status` (enrolled/passed/failed/unenrolled), `isDeleted`, `enrolledAt`, `updatedAt`, `resultDeclaredAt`
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

| Collection                                                                  | Key fields queried                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `users`                                                                     | `email`, `role`, `collegeCode`                                   |
| `student_users`                                                             | `email`, `projectCode`                                           |
| `helpTickets`                                                               | `createdByUid`, `createdByEmail`, `updatedAt`                    |
| `helpTickets/{id}/remarks`                                                  | `createdAt`                                                      |
| `students` (top-level, project docs)                                        | `projectCode`, `collegeCode`                                     |
| `students/{projectDocId}/students_list`                                     | `email`, `OFFICIAL_DETAILS.EMAIL_ID`, `id`, `uid`, `projectCode` |
| `students/{projectDocId}/students_list/{studentId}/certificate_enrollments` | `certificateId`, `projectCode`, `uid`, `status`, `email`         |
| `certificates`                                                              | `examCode`, `isActive`                                           |
| `projectCodes`                                                              | `collegeId`, `code`                                              |
| `organizations`                                                             | `normalizedName`                                                 |
| `college`                                                                   | `college_name`                                                   |

> **REMOVED**: `certificateProjectEnrollments` collection — replaced by `certificate_enrollments` subcollection

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

#### 3. `certificate_enrollments` — collectionGroup indexes (NEW)

```
Collection group: certificate_enrollments | certificateId ASC
Collection group: certificate_enrollments | projectCode ASC
Collection group: certificate_enrollments | uid ASC
Collection group: certificate_enrollments | certificateId ASC, projectCode ASC (composite)
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

### `certificateService.js` (fully rewritten)

- **Kept**: `getAllCertificates`, `getCertificatesByIds`, `createCertificateAndEnrollStudents`, `updateCertificate`, `commitInChunks`
- **Rewritten**: `getCertificateEnrollmentCounts` → queries `collectionGroup("certificate_enrollments")`
- **Rewritten**: `softDeleteCertificate` → marks enrollment docs as `isDeleted:true`
- **NEW**: `enrollStudentsIntoCertificate({certificateId, certificateName, examCode, projectCode, studentEmails})`
- **NEW**: `getCertificatesForProjectCode(projectCode)` → collectionGroup query on `certificate_enrollments`
- **NEW**: `getStudentsByCertificateInProject(certificateId, projectCode)`
- **NEW**: `getStudentCertificateHistory(uid)` → cross-year cert data via UID
- **NEW**: `unenrollStudentsFromCertificate({certificateId, projectCode, studentEmails})`
- **NEW**: `declareResultsForCertificate({certificateId, certificateName, projectCodes, emailStatusMap, defaultStatus})`
- **REMOVED**: `enrollProjectCodeIntoCertificate`, `getAssignedProjectCodesForCertificate`, `getCertificatesByProjectCode` (old), `unassignProjectCodeFromCertificate`

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
