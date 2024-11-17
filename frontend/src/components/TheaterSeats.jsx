import axios from "axios";
import { useEffect, useState } from "react";
import io from 'socket.io-client';
const socket = io('http://localhost:3000');
const TheaterSeats = ({ seatSelected, sendingSeats,  movieId }) => {
  const seatsInRow = 20; // Default number of seats
  const seatsInRowM = 22; // Seats in row M

  const seatRows = [];
  const startCharCode = 'M'.charCodeAt(0); // ASCII value for 'M'
  const endCharCode = 'A'.charCodeAt(0); // ASCII value for 'A'

  // Add row M with 22 seats
  seatRows.push({
    row: 'M',
    seats: Array.from({ length: seatsInRowM }, (_, i) => i + 1),
  });

  // Add rows from L to A with 20 seats each
  for (let charCode = startCharCode - 1; charCode >= endCharCode; charCode--) {
    seatRows.push({
      row: String.fromCharCode(charCode),
      seats: Array.from({ length: seatsInRow }, (_, i) => i + 1),
    });
  }

  const [selectedSeats, setSelectedSeats] = useState([]); // Track selected seats

  const handleSeatClick = (row, seat) => {
    const totalSeats = row === 'M' ? seatsInRowM : seatsInRow;
    let newSelectedSeats = [];
  
    if (seat >= totalSeats - seatSelected + 1) {
      for (let i = 0; i < seatSelected; i++) {
        const prevSeatIndex = seat - i;
        if (prevSeatIndex >= 1) {
          newSelectedSeats.push({ row, seat: prevSeatIndex });
        }
      }
    } else {
      for (let i = 0; i < seatSelected; i++) {
        const nextSeatIndex = seat + i;
        if (nextSeatIndex <= totalSeats) {
          newSelectedSeats.push({ row, seat: nextSeatIndex });
        }
      }
    }
  
    setSelectedSeats(newSelectedSeats);
    sendingSeats(newSelectedSeats);
    sendMovieDataToBackend(newSelectedSeats);
    // Emit the event to the backend

  };
  const sendMovieDataToBackend = async (newSelectedSeats) => {
    try {
      const response = await axios.post('/api/userAndMovie', {
        movieId
      });
      socket.emit('seat-selected', {
        selectedSeats: newSelectedSeats,
        userId: response.data.userId, // Replace with actual user ID
        movieId, // Replace with actual movie ID
      });
      console.log("Data sent to backend:", response.data);
    } catch (error) {
      console.error("Error sending data to backend:", error);
    }
  };
  useEffect(() => {
    // Listen for seat booking updates
    socket.on('seat-booked', (updatedSeat) => {
      setSelectedSeats((prevSeats) =>
        prevSeats.map((seat) =>
          seat.row === updatedSeat.row && seat.seat === updatedSeat.seat
            ? { ...seat, isBooked: true }
            : seat
        )
      );
    });
  
    return () => {
      socket.off('seat-booked');
    };
  }, []);
  
  return (
    <div className="flex flex-col items-center">
      {seatRows.map(({ row, seats }) => (
        <div key={row} className="grid grid-cols-12 items-center my-2">
          <div className="flex -gap-2 col-span-1 text-right font-bold">{row}</div>
          <div className="col-span-11">
            {row === 'M' ? (
              <div className="flex justify-center">
                {seats.map(seat => (
                  <div
                    key={seat}
                    onClick={() => handleSeatClick(row, seat)}
                    className={`w-8 h-8 border text-center leading-8 mx-1 ${
                      selectedSeats.some((s) => s.row === row && s.seat === seat)
                        ? 'bg-green-500 border-black'
                        : 'hover:bg-green-500 hover:border-black border-green-500'
                    }`}
                  >
                    {seat}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="flex ml-[50px]">
                  {seats.slice(0, 10).map(seat => (
                    <div
                      key={seat}
                      onClick={() => handleSeatClick(row, seat)}
                      className={`w-8 h-8 border text-center leading-8 mx-1 ${
                        selectedSeats.some((s) => s.row === row && s.seat === seat)
                          ? 'bg-green-500 border-black'
                          : 'hover:bg-green-500 hover:border-black border-green-500'
                      }`}
                    >
                      {seat}
                    </div>
                  ))}
                </div>
                <div className="w-4" />
                <div className="flex">
                  {seats.slice(10).map(seat => (
                    <div
                      key={seat}
                      onClick={() => handleSeatClick(row, seat)}
                      className={`w-8 h-8 border text-center leading-8 mx-1 ${
                        selectedSeats.some((s) => s.row === row && s.seat === seat)
                          ? 'bg-green-500 border-black'
                          : 'hover:bg-green-500 hover:border-black border-green-500'
                      }`}
                    >
                      {seat}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="mt-5 ml-24 flex justify-center">
        <div className="border-2 border-black py-10 px-56">screen this side</div>
      </div>
    </div>
  );
};

export default TheaterSeats;
