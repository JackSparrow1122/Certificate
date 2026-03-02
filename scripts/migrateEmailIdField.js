#!/usr/bin/env node

/**
 * Migration: rename OFFICIAL_DETAILS["EMAIL ID"] → OFFICIAL_DETAILS["EMAIL_ID"]
 * Also handles the trailing-dot variant: "EMAIL ID." → "EMAIL_ID."
 *
 * Usage (from /scripts directory):
 *   node migrateEmailIdField.js
 *
 * Requires serviceAccountKey.json in the /scripts directory.
 * Download from Firebase Console → Project Settings → Service Accounts.
 *
 * Run with --dry-run to preview without writing:
 *   node migrateEmailIdField.js --dry-run
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 400;

const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ serviceAccountKey.json not found in /scripts directory");
  console.error(
    "Download it from Firebase Console → Project Settings → Service Accounts",
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

async function migrate() {
  console.log(
    DRY_RUN
      ? "🔍 DRY RUN — no writes will be made\n"
      : "🚀 Running migration...\n",
  );

  const projectsSnapshot = await db.collection("students").get();
  console.log(
    `Found ${projectsSnapshot.size} project doc(s) in 'students' collection`,
  );

  let totalScanned = 0;
  let totalUpdated = 0;
  let ops = []; // { ref, update }

  for (const projectDoc of projectsSnapshot.docs) {
    const studentsListRef = projectDoc.ref.collection("students_list");
    const studentsSnapshot = await studentsListRef.get();

    for (const studentDoc of studentsSnapshot.docs) {
      totalScanned++;
      const data = studentDoc.data();
      const official = data.OFFICIAL_DETAILS;

      if (!official) continue;

      const hasOldKey = Object.prototype.hasOwnProperty.call(
        official,
        "EMAIL ID",
      );
      const hasOldDotKey = Object.prototype.hasOwnProperty.call(
        official,
        "EMAIL ID.",
      );

      if (!hasOldKey && !hasOldDotKey) continue;

      // Build the update: set new keys, delete old keys
      const update = {};

      if (hasOldKey) {
        update["OFFICIAL_DETAILS.EMAIL_ID"] = official["EMAIL ID"];
        update["OFFICIAL_DETAILS.EMAIL ID"] = FieldValue.delete();
        console.log(
          `  → ${projectDoc.id} / ${studentDoc.id} : "EMAIL ID" = "${official["EMAIL ID"]}"`,
        );
      }

      if (hasOldDotKey) {
        update["OFFICIAL_DETAILS.EMAIL_ID."] = official["EMAIL ID."];
        update["OFFICIAL_DETAILS.EMAIL ID."] = FieldValue.delete();
        console.log(
          `  → ${projectDoc.id} / ${studentDoc.id} : "EMAIL ID." = "${official["EMAIL ID."]}"`,
        );
      }

      ops.push({ ref: studentDoc.ref, update });
      totalUpdated++;
    }
  }

  console.log(
    `\nScanned ${totalScanned} student docs — ${totalUpdated} need updating`,
  );

  if (DRY_RUN) {
    console.log(
      "\n✅ Dry run complete. Re-run without --dry-run to apply changes.",
    );
    process.exit(0);
  }

  if (ops.length === 0) {
    console.log("✅ Nothing to update — all docs already use EMAIL_ID.");
    process.exit(0);
  }

  // Commit in chunks of BATCH_SIZE
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const chunk = ops.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { ref, update } of chunk) {
      batch.update(ref, update);
    }
    await batch.commit();
    console.log(
      `  Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} docs)`,
    );
  }

  console.log(
    `\n✅ Migration complete — updated ${totalUpdated} student docs.`,
  );
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
