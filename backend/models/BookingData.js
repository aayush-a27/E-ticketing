// bookingData.js
const mongoose = require('mongoose');

const bookingSchema = mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    movieTitle: { type: String, required: true },
    seatSelected: [
      {
        row: { type: String, required: true },
        seat: { type: Number, required: true },
      }
    ],
    showTime: { type: String, required: true },
    theaterName: { type: String, required: true },
  });

module.exports = mongoose.model('Booking', bookingSchema);
