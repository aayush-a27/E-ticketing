/**
 * Fills in `theaterId`, `screenId` and `movieId` on bookings created before
 * those fields existed.
 *
 *   node scripts/backfillBookingVenue.js --dry-run     report only
 *   node scripts/backfillBookingVenue.js               write
 *
 * The operations console scopes a show runner's bookings with
 * `theaterId: { $in: theirAssignedVenues }`. A booking written before this
 * field existed has none, so it would be invisible to the venue that sold it —
 * not wrongly visible to anyone else, but missing from its own venue's list.
 * This copies the three ids across from the show each booking already
 * references.
 *
 * Re-running is safe: only documents still missing `theaterId` are touched,
 * and nothing else on the booking is modified. A booking whose show has since
 * been deleted is reported and left alone rather than guessed at.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Booking } from '../src/models/Booking.js';
import { Show } from '../src/models/Show.js';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 500;

async function main() {
  await connectDatabase();

  const pending = await Booking.countDocuments({ theaterId: { $exists: false } });
  if (pending === 0) {
    console.log('Every booking already carries its venue ids. Nothing to do.');
    return;
  }

  console.log(`${pending} booking(s) are missing venue ids.${DRY_RUN ? ' (dry run)' : ''}\n`);

  const report = { updated: 0, orphaned: [] };

  while (true) {
    const batch = await Booking.find({ theaterId: { $exists: false } })
      .select('_id reference showId')
      .limit(BATCH)
      .lean();
    if (batch.length === 0) break;

    const shows = await Show.find({ _id: { $in: batch.map((b) => b.showId) } })
      .select('theaterId screenId movieId')
      .lean();
    const showById = new Map(shows.map((show) => [String(show._id), show]));

    const operations = [];
    for (const booking of batch) {
      const show = showById.get(String(booking.showId));
      if (!show) {
        report.orphaned.push(booking.reference);
        continue;
      }
      operations.push({
        updateOne: {
          filter: { _id: booking._id },
          update: {
            $set: {
              theaterId: show.theaterId,
              screenId: show.screenId,
              movieId: show.movieId,
            },
          },
        },
      });
    }

    if (DRY_RUN) {
      report.updated += operations.length;
      // Nothing was written, so the same batch would come back forever.
      break;
    }

    if (operations.length > 0) {
      const result = await Booking.bulkWrite(operations, { ordered: false });
      report.updated += result.modifiedCount ?? 0;
    }

    // Only orphans remain in this batch and they can never be fixed here.
    if (operations.length === 0) break;
  }

  console.log(`Bookings updated : ${report.updated}`);
  if (report.orphaned.length > 0) {
    console.log(`\nSkipped — the show no longer exists (${report.orphaned.length}):`);
    for (const reference of report.orphaned.slice(0, 20)) console.log(`  - ${reference}`);
    if (report.orphaned.length > 20) {
      console.log(`  ... and ${report.orphaned.length - 20} more`);
    }
  }
  if (DRY_RUN) console.log('\nDry run — nothing was written.');
}

main()
  .catch((error) => {
    console.error(`\nBackfill failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
