/**
 * Fills a development database with a small, realistic catalogue so the
 * frontend has something to render.
 *
 *   npm run dev:seed
 *
 * Everything goes through the normal models, so the data obeys the same rules
 * the API enforces. Posters are set directly because the `memory` media
 * provider cannot serve real images — with Cloudinary configured you would
 * upload them through /admin/uploads instead.
 *
 * Development only. It refuses to run against a database that already holds
 * bookings, so it cannot wipe anything that matters.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Movie } from '../src/models/Movie.js';
import { Theater } from '../src/models/Theater.js';
import { Screen } from '../src/models/Screen.js';
import { SeatLayout } from '../src/models/SeatLayout.js';
import { Show } from '../src/models/Show.js';
import { Booking } from '../src/models/Booking.js';
import { User } from '../src/models/User.js';
import { generateInventory } from '../src/modules/inventory/inventory.service.js';
import { MOVIE_STATUS, ROLES, SHOW_STATUS, THEATER_STATUS } from '../src/constants/index.js';
import { env } from '../src/config/env.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}

const MOVIES = [
  {
    title: 'The Long Afternoon',
    slug: 'the-long-afternoon',
    tagline: 'Some trains you are meant to miss.',
    synopsis:
      'A railway clerk in a shrinking town keeps a ledger of everyone who misses the 4:10. When a stranger starts appearing in it every day, his careful record becomes the only thing standing between memory and invention.',
    languages: ['Hindi', 'English'],
    subtitles: ['English'],
    genres: ['Drama', 'Mystery'],
    runtimeMinutes: 128,
    certification: 'UA',
    director: 'Meera Raghavan',
    releaseDate: new Date('2026-09-01'),
    isFeatured: true,
    poster: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=900&fit=crop',
    backdrop: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1600&h=900&fit=crop',
  },
  {
    title: 'Monsoon Circuit',
    slug: 'monsoon-circuit',
    tagline: 'Three cities. One storm. No brakes.',
    synopsis:
      'A courier with a sealed package, a meteorologist who knows what is coming, and a road that floods at dusk. The rain arrives early this year, and so does everybody chasing her.',
    languages: ['Hindi', 'Tamil'],
    genres: ['Thriller', 'Action'],
    runtimeMinutes: 142,
    certification: 'UA16+',
    director: 'Kabir Anand',
    releaseDate: new Date('2026-08-14'),
    isFeatured: true,
    poster: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=600&h=900&fit=crop',
    backdrop: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1600&h=900&fit=crop',
  },
  {
    title: 'Paper Boats',
    slug: 'paper-boats',
    synopsis:
      'Two sisters return to the house they grew up in to sort through forty years of their mother’s belongings, and find that each of them remembers a different childhood.',
    languages: ['Bengali', 'English'],
    genres: ['Drama', 'Family'],
    runtimeMinutes: 106,
    certification: 'U',
    director: 'Ritu Sen',
    releaseDate: new Date('2026-07-20'),
    poster: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=600&h=900&fit=crop',
  },
  {
    title: 'The Cartographer',
    slug: 'the-cartographer',
    synopsis:
      'A mapmaker is commissioned to chart a valley that does not appear on any survey. The villagers are welcoming, the terrain is impossible, and his instruments keep disagreeing with each other.',
    languages: ['English'],
    genres: ['Mystery', 'Adventure'],
    runtimeMinutes: 119,
    certification: 'UA13+',
    director: 'Thomas Reyes',
    releaseDate: new Date('2026-06-05'),
    poster: 'https://images.unsplash.com/photo-1533613220915-609f661a6fe1?w=600&h=900&fit=crop',
  },
];

const THEATERS = [
  {
    name: 'Nova Cinemas Rajpur Road',
    city: 'Dehradun',
    state: 'Uttarakhand',
    addressLine1: '12 Rajpur Road, Near Clock Tower',
    pincode: '248001',
    coordinates: [78.0322, 30.3165],
    amenities: ['Parking', 'Cafe', 'Wheelchair access'],
    screens: [
      { name: 'Audi 1', formats: ['2D', '3D'] },
      { name: 'Audi 2', formats: ['2D'] },
    ],
  },
  {
    name: 'Grand Palace Multiplex',
    city: 'Dehradun',
    state: 'Uttarakhand',
    addressLine1: '88 Chakrata Road',
    pincode: '248001',
    amenities: ['Parking', 'Recliners'],
    screens: [{ name: 'Screen A', formats: ['2D', 'IMAX'] }],
  },
  {
    name: 'Marine Drive Picturehouse',
    city: 'Mumbai',
    state: 'Maharashtra',
    addressLine1: '4 Marine Drive',
    pincode: '400020',
    coordinates: [72.8235, 18.9432],
    amenities: ['Cafe', 'Dolby Atmos'],
    screens: [{ name: 'Hall 1', formats: ['2D', 'DOLBY'] }],
  },
];

/** A 9 x 12 room: two Silver rows at the front, Gold behind, with a centre aisle. */
function buildLayout() {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'];
  const seats = [];

  rows.forEach((row, rowIndex) => {
    for (let number = 1; number <= 12; number += 1) {
      // A gap down the middle, which is what makes it read as a real room.
      const x = number <= 6 ? number : number + 1;
      seats.push({
        seatId: `${row}${number}`,
        row,
        number,
        label: `${row}${number}`,
        category: rowIndex < 2 ? 'Silver' : rowIndex < 7 ? 'Gold' : 'Recliner',
        x,
        y: rowIndex,
        kind: 'seat',
        isActive: true,
      });
    }
  });

  return {
    categories: [
      { name: 'Silver', displayOrder: 1, color: '#9BA3B4' },
      { name: 'Gold', displayOrder: 2, color: '#D4A24C' },
      { name: 'Recliner', displayOrder: 3, color: '#4CA97D' },
    ],
    seats,
  };
}

const PRICING = [
  { category: 'Silver', basePaise: 15_000 },
  { category: 'Gold', basePaise: 25_000 },
  { category: 'Recliner', basePaise: 45_000 },
];

/** Shows at these local times, for each of the next `days` days. */
const SHOW_HOURS = [10, 13.5, 17, 20.5];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  await connectDatabase();

  const existingBookings = await Booking.countDocuments({});
  if (existingBookings > 0) {
    console.error(
      `This database already holds ${existingBookings} booking(s). Refusing to seed over real data.`,
    );
    return;
  }

  const admin = await User.findOne({ role: ROLES.SUPER_ADMIN });
  if (!admin) {
    console.error('No super admin found. Run `npm run bootstrap:admin` first.');
    return;
  }

  // --- Movies ---------------------------------------------------------------
  const movies = [];
  for (const entry of MOVIES) {
    const { poster, backdrop, ...rest } = entry;
    const movie = await Movie.findOneAndUpdate(
      { slug: entry.slug },
      {
        $set: {
          ...rest,
          poster: { url: poster, publicId: `seed/${entry.slug}-poster` },
          ...(backdrop
            ? { backdrop: { url: backdrop, publicId: `seed/${entry.slug}-backdrop` } }
            : {}),
          status: MOVIE_STATUS.PUBLISHED,
          publishedAt: new Date(),
          createdBy: admin._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    movies.push(movie);
  }
  console.log(`Movies:   ${movies.length} published`);

  // --- Theaters, screens and layouts ----------------------------------------
  const screens = [];
  for (const entry of THEATERS) {
    const theater = await Theater.findOneAndUpdate(
      { slug: slugify(`${entry.name}-${entry.city}`) },
      {
        $set: {
          name: entry.name,
          slug: slugify(`${entry.name}-${entry.city}`),
          addressLine1: entry.addressLine1,
          city: entry.city.toLowerCase(),
          cityLabel: entry.city,
          state: entry.state,
          pincode: entry.pincode,
          amenities: entry.amenities,
          status: THEATER_STATUS.ACTIVE,
          createdBy: admin._id,
          ...(entry.coordinates
            ? { location: { type: 'Point', coordinates: entry.coordinates } }
            : {}),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    for (const screenEntry of entry.screens) {
      const screen = await Screen.findOneAndUpdate(
        { theaterId: theater._id, name: screenEntry.name },
        { $set: { formats: screenEntry.formats, isActive: true } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );

      const existing = await SeatLayout.findOne({ screenId: screen._id, version: 1 });
      if (!existing) {
        const layout = buildLayout();
        await SeatLayout.create({
          screenId: screen._id,
          theaterId: theater._id,
          version: 1,
          categories: layout.categories,
          seats: layout.seats,
          seatCount: layout.seats.length,
          rowCount: new Set(layout.seats.map((seat) => seat.row)).size,
          createdBy: admin._id,
        });
        screen.activeLayoutVersion = 1;
        screen.capacity = layout.seats.length;
        await screen.save();
      }

      screens.push({ screen, theater });
    }
  }
  console.log(`Venues:   ${THEATERS.length} theaters, ${screens.length} screens`);

  // --- Shows ----------------------------------------------------------------
  let created = 0;
  let seatsGenerated = 0;

  for (let day = 0; day < 5; day += 1) {
    for (const [index, { screen, theater }] of screens.entries()) {
      for (const [slot, hour] of SHOW_HOURS.entries()) {
        // Spread movies across screens and slots so each venue has a varied day.
        const movie = movies[(index + slot + day) % movies.length];

        const startAt = new Date();
        startAt.setDate(startAt.getDate() + day);
        startAt.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);

        // Skip anything already in the past today.
        if (startAt <= new Date()) continue;

        const endAt = new Date(startAt.getTime() + (movie.runtimeMinutes + 15) * 60_000);

        const clash = await Show.findOne({
          screenId: screen._id,
          status: { $ne: SHOW_STATUS.CANCELLED },
          startAt: { $lt: endAt },
          endAt: { $gt: startAt },
        });
        if (clash) continue;

        const format = screen.formats.includes('2D') ? '2D' : screen.formats[0];

        const show = await Show.create({
          movieId: movie._id,
          theaterId: theater._id,
          screenId: screen._id,
          city: theater.city,
          startAt,
          endAt,
          language: movie.languages[0],
          format,
          layoutVersion: screen.activeLayoutVersion,
          pricing: PRICING,
          status: SHOW_STATUS.PUBLISHED,
          publishedAt: new Date(),
          createdBy: admin._id,
        });

        const inventory = await generateInventory(show);
        created += 1;
        seatsGenerated += inventory.inserted;
      }
    }
  }

  console.log(`Shows:    ${created} published, ${seatsGenerated} seats generated`);
  console.log('\nSeed complete.');
}

main()
  .catch((error) => {
    console.error(`\nSeed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
