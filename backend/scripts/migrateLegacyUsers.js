/**
 * Migrates accounts out of the legacy `userSignupDets` database.
 *
 *   node scripts/migrateLegacyUsers.js --dry-run      report only
 *   node scripts/migrateLegacyUsers.js                write
 *
 * What carries over: username -> name, emailId -> lowercased email, and the
 * bcrypt hash unchanged (bcryptjs reads the same $2a$/$2b$ format, so existing
 * passwords keep working). Everyone arrives as an active customer.
 *
 * Legacy bookings are NOT migrated. They reference a movie title, a theater
 * name and a showtime string that match no show, screen or seat in the new
 * schema, and they carry no price or payment record. They are copied verbatim
 * into `legacy_bookings` so booking history can still show them as past
 * records with no ticket and no cancellation.
 *
 * Re-running is safe: accounts that already exist are skipped, not overwritten.
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/models/User.js';
import { ACCOUNT_STATUS, ROLES } from '../src/constants/index.js';

const DRY_RUN = process.argv.includes('--dry-run');

function requireLegacyUri() {
  if (!env.LEGACY_MONGODB_URI) {
    throw new Error('Set LEGACY_MONGODB_URI in .env to point at the old database');
  }
  if (env.LEGACY_MONGODB_URI === env.MONGODB_URI) {
    throw new Error('LEGACY_MONGODB_URI and MONGODB_URI must be different databases');
  }
  return env.LEGACY_MONGODB_URI;
}

async function migrateUsers(legacyDb, report) {
  const legacyUsers = await legacyDb.collection('users').find({}).toArray();
  report.users.found = legacyUsers.length;

  for (const legacy of legacyUsers) {
    const email = String(legacy.emailId ?? '').trim().toLowerCase();

    if (!email || !legacy.password) {
      report.users.skippedInvalid += 1;
      report.issues.push(`User ${legacy._id}: missing email or password hash`);
      continue;
    }
    if (!/^\$2[aby]\$/.test(legacy.password)) {
      report.users.skippedInvalid += 1;
      report.issues.push(`User ${email}: password is not a bcrypt hash, cannot migrate`);
      continue;
    }

    const exists = await User.findOne({ email }).select('_id');
    if (exists) {
      report.users.skippedExisting += 1;
      continue;
    }

    if (!DRY_RUN) {
      await User.create({
        _id: legacy._id, // keep the id so legacy bookings still resolve
        name: String(legacy.username ?? '').trim() || email.split('@')[0],
        email,
        passwordHash: legacy.password,
        role: ROLES.CUSTOMER,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        tokenVersion: 0,
        createdAt: legacy.createdAt ?? new Date(),
      });
    }
    report.users.migrated += 1;
  }
}

async function archiveBookings(legacyDb, targetDb, report) {
  const legacyBookings = await legacyDb.collection('bookings').find({}).toArray();
  report.bookings.found = legacyBookings.length;
  if (legacyBookings.length === 0) return;

  const archive = targetDb.collection('legacy_bookings');
  for (const booking of legacyBookings) {
    const already = await archive.findOne({ _id: booking._id });
    if (already) {
      report.bookings.skippedExisting += 1;
      continue;
    }
    if (!DRY_RUN) {
      await archive.insertOne({
        ...booking,
        migratedAt: new Date(),
        source: 'userSignupDets.bookings',
        note: 'Pre-rebuild booking. No show, seat inventory or payment record exists for it.',
      });
    }
    report.bookings.archived += 1;
  }
}

async function main() {
  const legacyUri = requireLegacyUri();

  await connectDatabase();
  const targetDb = mongoose.connection.db;

  const legacyConnection = await mongoose.createConnection(legacyUri).asPromise();
  const legacyDb = legacyConnection.db;

  const report = {
    users: { found: 0, migrated: 0, skippedExisting: 0, skippedInvalid: 0 },
    bookings: { found: 0, archived: 0, skippedExisting: 0 },
    issues: [],
  };

  try {
    await migrateUsers(legacyDb, report);
    await archiveBookings(legacyDb, targetDb, report);
  } finally {
    await legacyConnection.close();
  }

  const mode = DRY_RUN ? 'DRY RUN — nothing was written' : 'Migration complete';
  console.log(`\n${mode}`);
  console.log('\nUsers');
  console.log(`  found in legacy db : ${report.users.found}`);
  console.log(`  migrated           : ${report.users.migrated}`);
  console.log(`  already present    : ${report.users.skippedExisting}`);
  console.log(`  unusable, skipped  : ${report.users.skippedInvalid}`);
  console.log('\nBookings (archived read-only, never converted to tickets)');
  console.log(`  found in legacy db : ${report.bookings.found}`);
  console.log(`  archived           : ${report.bookings.archived}`);
  console.log(`  already archived   : ${report.bookings.skippedExisting}`);

  if (report.issues.length) {
    console.log('\nIssues');
    for (const issue of report.issues) console.log(`  - ${issue}`);
  }
}

main()
  .catch((error) => {
    console.error(`\nMigration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
