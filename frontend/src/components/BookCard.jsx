// BookCard.jsx
import PropTypes from 'prop-types';

const BookCard = ({ booking, onDelete }) => {
  const handleDelete = async () => {
    try {
      // Call onDelete function passed as a prop to delete the booking
      await onDelete(booking._id);
    } catch (error) {
      console.error("Error deleting booking:", error);
    }
  };

  return (
    <div className="bg-white shadow-lg rounded-lg p-6 mb-6 max-w-md mx-auto">
      <h3 className="text-2xl font-bold mb-4">{booking.movieTitle}</h3>
      <p className="text-sm text-gray-500">Showtime: {booking.showTime}</p>
      <p className="text-sm text-gray-500">Theater: {booking.theaterName}</p>
      <div className="mt-4">
        <h4 className="text-lg font-semibold">Seats:</h4>
        <ul>
          {booking.seatSelected.map((seat, index) => (
            <li key={index} className="text-sm text-gray-700">
              Row {seat.row}, Seat {seat.seat}
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={handleDelete}
        className="mt-4 bg-red-500 text-white px-4 py-2 rounded-lg"
      >
        Delete History
      </button>
    </div>
  );
};

BookCard.propTypes = {
  booking: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    movieTitle: PropTypes.string.isRequired,
    showTime: PropTypes.string.isRequired,
    theaterName: PropTypes.string.isRequired,
    seatSelected: PropTypes.arrayOf(
      PropTypes.shape({
        row: PropTypes.string.isRequired,
        seat: PropTypes.number.isRequired
      })
    ).isRequired
  }).isRequired,
  onDelete: PropTypes.func.isRequired
};

export default BookCard;
