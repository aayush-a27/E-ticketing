import { useLocation } from "react-router-dom";
import TheaterSeats from "../components/TheaterSeats";
import { useState, useEffect } from "react";
import DialogBox from "../components/DialogBox";
import { useNavigate } from 'react-router-dom';
import { motion } from "framer-motion";

const SeatsBooking = () => {
  const navigate = useNavigate();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);
  const [seatSelected, setSeatSelected] = useState([]);
  const location = useLocation();
  const timings = location.state?.timings || [];
  const { title, theaterName, moviePoster } = location.state;

  useEffect(() => {
    if (timings.length > 0) {
      setSelectedTime(timings[0]);
    }
    setShowDialog(true);
  }, [timings]);

  const handleSeatSelect = (seats) => {
    setSeatSelected(seats);
  };

  const handleClose = () => {
    setShowDialog(false);
  };

  const handleTimeSelect = (time) => {
    setSelectedTime(time);
  };

  const handlePay = () => {
    navigate("/checkOut", { state: { seatSelected, selectedTime, title, theaterName, moviePoster } });
  };

  return (
    <motion.div
      className="min-h-screen bg-black text-white font-[CabinSketch] px-6 py-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    >
      <div className={`${showDialog ? 'blur-md' : ''}`}>
        <h1 className="text-5xl font-extrabold text-center mb-10">🎟️ Show Timings</h1>
        <ul className="flex flex-wrap justify-center gap-4 mb-10">
          {timings.map((time, index) => (
            <motion.li
              key={index}
              className={`cursor-pointer border-2 rounded-full py-2 px-6 transition-all duration-300 text-lg
                ${selectedTime === time ? 'bg-white text-black border-white' : 'border-white hover:bg-white hover:text-black'}`}
              whileHover={{ scale: 1.1 }}
              onClick={() => handleTimeSelect(time)}
            >
              {time}
            </motion.li>
          ))}
        </ul>

        <div className="flex flex-col items-center gap-10">
          <TheaterSeats selectedTime={selectedTime} seatSelected={seatSelected} sendingSeats={handleSeatSelect} />

          <motion.button
            className="mt-4 w-48 py-3 rounded-full bg-white text-black font-bold border-2 border-white hover:bg-transparent hover:text-white transition-all duration-300"
            whileHover={{ scale: 1.05 }}
            onClick={handlePay}
          >
            Proceed to Pay
          </motion.button>
        </div>
      </div>

      {showDialog && <DialogBox onSeatSelect={handleSeatSelect} onClose={handleClose} />}
    </motion.div>
  );
};

export default SeatsBooking;