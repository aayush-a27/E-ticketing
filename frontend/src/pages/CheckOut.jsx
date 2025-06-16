import { useLocation, useNavigate } from "react-router-dom";
import { TiTick } from "react-icons/ti";
import axios from "axios";
import { motion } from "framer-motion";

const CheckOut = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { seatSelected, selectedTime, title, theaterName, moviePoster } = location.state;

  const payment = async () => {
    try {
      const response = await axios.get("/api/checkLogin");
      if (!response.data.user) {
        localStorage.setItem("lastVisited", response.data.lastVisited);
        localStorage.setItem("seatSelected", JSON.stringify(seatSelected));
        localStorage.setItem("selectedTime", selectedTime);
        localStorage.setItem("moviePoster", moviePoster);
        localStorage.setItem("title", title);
        localStorage.setItem("theaterName", theaterName);
        alert("Please login to proceed with the payment.");
        navigate("/Login");
        return;
      }

      const PaymentResponse = await axios.post("/api/payment", { amount: 250 });
      const { id, currency, amount } = PaymentResponse.data;

      const options = {
        key: "rzp_test_UC8hSWUDN0cL2v",
        amount,
        currency,
        name: "Movie Booking",
        description: "Ticket Payment",
        image: "/your_logo.png",
        order_id: id,
        handler: async (response) => {
          alert(`Payment successful! Payment ID: ${response.razorpay_payment_id}`);
          await axios.post("/api/bookTicket", {
            seatSelected,
            selectedTime,
            title,
            theaterName,
          });
        },
        prefill: {
          name: "Your Name",
          email: "email@example.com",
          contact: "9876543210",
        },
        theme: {
          color: "#F37254",
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      error.status === 401 ? navigate("/Login") : "";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 py-8 md:px-12 lg:px-24 gap-12"
    >
      <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-10 border border-white rounded-2xl p-6 md:p-10 shadow-lg">
        {/* Poster */}
        <div className="w-full lg:w-1/3">
          <img
            src={`https://image.tmdb.org/t/p/w500${moviePoster}`}
            alt={title}
            className="rounded-xl w-full object-cover shadow-lg"
          />
        </div>

        {/* Column Info */}
        <div className="w-full lg:w-2/3 flex flex-col gap-6">
          <div className="flex flex-col gap-4 text-left">
            <div>
              <h2 className="text-xl font-semibold uppercase">Show Timing</h2>
              <p className="text-lg font-medium">{selectedTime}</p>
            </div>
            <div>
              <h2 className="text-xl font-semibold uppercase">Show</h2>
              <p className="text-lg font-medium">{title}</p>
            </div>
            <div>
              <h2 className="text-xl font-semibold uppercase">Theater</h2>
              <p className="text-lg font-medium">{theaterName}</p>
            </div>
            <div>
              <h2 className="text-xl font-semibold uppercase">Total Seats</h2>
              <p className="text-lg font-medium">{seatSelected.length}</p>
            </div>
          </div>

          {/* Row/Seat/Confirmed Grid */}
          <div className="grid grid-cols-3 gap-6 text-center pt-4 border-t border-white mt-4">
            <div>
              <h3 className="text-lg font-semibold">Row</h3>
              {seatSelected.map((item, index) => (
                <p key={index} className="text-base">{item.row}</p>
              ))}
            </div>
            <div>
              <h3 className="text-lg font-semibold">Seat</h3>
              {seatSelected.map((item, index) => (
                <p key={index} className="text-base">{item.seat}</p>
              ))}
            </div>
            <div>
              <h3 className="text-lg font-semibold">Confirmed</h3>
              {seatSelected.map((_, index) => (
                <p key={index} className="text-green-400 text-xl"><TiTick /></p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={payment}
        className="border-2 border-white text-white hover:bg-white hover:text-black font-semibold text-lg md:text-xl px-10 py-3 rounded-full transition duration-300"
      >
        Payable Amount ₹250
      </motion.button>
    </motion.div>
  );
};

export default CheckOut;
