import { useLocation } from "react-router-dom";
import TheaterSeats from "../components/TheaterSeats";
import { useState, useEffect } from "react";
import DialogBox from "../components/DialogBox";

const SeatsBooking = () => {
  // State to control the visibility of the dialog box
  const [showDialog, setShowDialog] = useState(false);

  // State to store the selected timing
  const [selectedTime, setSelectedTime] = useState(null);
  const [seatSelected, setSeatSelected] = useState(null);

  // Get timings from the location state
  const location = useLocation();
  const timings = location.state?.timings || [];

  // Set the first timing as the default selected timing on page load
  useEffect(() => {
    if (timings.length > 0) {
      setSelectedTime(timings[0]); // Set the first timing as the default
    }
    // Show the dialog box on page load
    setShowDialog(true);
  }, [timings]);

  // Function to handle seat selection
  const handleSeatSelect = (seat) => {
    console.log(`Selected seat: ${seat}`);
    setSeatSelected(seat);
    // You can perform further actions with the selected seat if needed
  };

  // Close the dialog box
  const handleClose = () => {
    setShowDialog(false);
  };

  const handleTimeSelect = (time) => {
    setSelectedTime(time);
  };
  const handlePay = ()=>{
    console.log("hey")
  }
  return (
    <div className="w-full relative">
      {/* This div wraps the main content and applies the blur */}
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
          {/* Pass the selected timing to the TheaterSeats component */}
          <TheaterSeats selectedTime={selectedTime} seatSelected = {seatSelected} />
          <div className="border-2 bg-green-500 w-48 py-2 bottom-[70%] hover:border-black  hover:shadow-xl hover:shadow-green-700/50 cursor-pointer right-[10%] absolute flex items-center justify-center rounded-full"
            onClick={handlePay}
          >pay</div>
        </div>
      </div>

      {/* Conditionally render the dialog box above the blurred content */}
      {showDialog && <DialogBox onSeatSelect={handleSeatSelect} onClose={handleClose} />}
    </div>
  );
};

export default SeatsBooking;
