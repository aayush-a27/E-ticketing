import { useEffect, useState } from 'react';
import axios from 'axios';
import BookCard from '../components/BookCard';

const Bookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch the booking history from the backend API
    const fetchBookingHistory = async () => {
      try {
        const response = await axios.get('/api/getBookingHistory');
        setBookings(response.data);
        setLoading(false);
      } catch (err) {
        setError('Error fetching booking history', err);
        setLoading(false);
      }
    };

    fetchBookingHistory();
  }, []);

  // Function to delete a booking
  const deleteBooking = async (bookingId) => {
    try {
      const response = await axios.delete(`/api/deleteBooking/${bookingId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}` // or wherever your token is stored
        }
      });
      if (response.status === 200) {
        setBookings(bookings.filter((booking) => booking._id !== bookingId));
      }
    } catch (err) {
      setError('Error deleting booking');
      console.error('Error deleting booking:', err);
    }
  };
  
  

  if (loading) {
    return <div>Loading booking history...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-3xl font-semibold mb-6">Your Booking History</h2>
      <div className="gap-5 flex  flex-wrap items-center justify-start">
        {bookings.length === 0 ? (
          <p>No bookings found</p>
        ) : (
          bookings.map((booking) => (
            <BookCard 
              key={booking._id} 
              booking={booking} 
              onDelete={deleteBooking}  // Pass the delete function to BookCard
            />
          ))
        )}
      </div>
    </div>
  );
};

export default Bookings;
