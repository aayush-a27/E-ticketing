import { useLocation } from "react-router-dom";
import TheaterSeats from "../components/TheaterSeats";
import { useState, useEffect } from "react";
import DialogBox from "../components/DialogBox";
import { useNavigate } from 'react-router-dom';

const SeatsBooking = () => {
  const navigate = useNavigate();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);
  const [seatSelected, setSeatSelected] = useState([]); // Changed to an array to store selected seats

  const location = useLocation();
  const timings = location.state?.timings || [];
  const {title, theaterName} = location.state

  useEffect(() => {
    if (timings.length > 0) {
      setSelectedTime(timings[0]);
    }
    setShowDialog(true);
  }, [timings]);

  const handleSeatSelect = (seats) => {
    console.log('Selected seats:', seats);
    setSeatSelected(seats);
  };

  const handleClose = () => {
    setShowDialog(false);
  };

  const handleTimeSelect = (time) => {
    setSelectedTime(time);
  };

  const handlePay = () => {
    navigate("/checkOut", { state: { seatSelected, selectedTime, title, theaterName} });
  };

  return (
    <div className="w-full relative">
      <div className={`${showDialog ? 'blur-md' : ''}`}>
        <div className="font-bold text-5xl">Show Timings</div>
        <ul className="w-full flex mt-10 items-center justify-center gap-4">
          {timings.map((time, index) => (
            <li
              key={index}
              className={`border-2 cursor-pointer hover:shadow-xl hover:shadow-green-700/50 hover:bg-green-500 hover:text-black rounded-full py-2 px-6 border-black ${
                selectedTime === time ? 'bg-green-500 text-black' : 'text-green-700'
              }`}
              onClick={() => handleTimeSelect(time)}
            >
              {time}
            </li>
          ))}
        </ul>
        <div className="w-full mt-10 -ml-10 relative flex items-center gap-48 justify-center">
          {/* Pass the selected timing and the seat selection handler to the TheaterSeats component */}
          <TheaterSeats selectedTime={selectedTime} seatSelected={seatSelected} sendingSeats={handleSeatSelect} />
          <div className="border-2 bg-green-500 w-48 py-2 bottom-[70%] hover:border-black hover:shadow-xl hover:shadow-green-700/50 cursor-pointer right-[10%] absolute flex items-center justify-center rounded-full"
            onClick={handlePay}
          >select</div>
        </div>
      </div>
      {showDialog && <DialogBox onSeatSelect={handleSeatSelect} onClose={handleClose} />}
    </div>
  );
};

export default SeatsBooking;
