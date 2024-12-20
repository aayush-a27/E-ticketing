import { useLocation, useNavigate } from "react-router-dom";
import { TiTick } from "react-icons/ti";
import axios from "axios";


const CheckOut = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { seatSelected, selectedTime, title, theaterName,  moviePoster } = location.state;
  const payment = async () => {
    try {
    const response = await axios.post('/api/payment', { amount: 250 }); // Amount in INR
    const { id, currency, amount } = response.data;

    const options = {
      key: "rzp_test_UC8hSWUDN0cL2v", // Replace with your Razorpay key ID
      amount,
      currency,
      name: "Movie Booking",
      description: "Ticket Payment",
      image: "/your_logo.png", // Optional logo
      order_id: id,
      handler: async (response) => {
        alert(`Payment successful! Payment ID: ${response.razorpay_payment_id}`);
        await axios.post('/api/bookTicket', {
          seatSelected,
          selectedTime,
          title,
          theaterName,
        });
      },
      prefill: {
        name: "Your Name", // Optional: user's name
        email: "email@example.com", // Optional: user's email
        contact: "9876543210", // Optional: user's phone number
      },
      theme: {
        color: "#F37254", // Razorpay theme color
      },
    };

    const razorpay = new window.Razorpay(options);
    razorpay.open();
  }catch (error) {
      localStorage.setItem('lastVisited', '/checkOut');
      localStorage.setItem('seatSelected', JSON.stringify(seatSelected));  // Store the state
      localStorage.setItem('selectedTime', selectedTime);  // Store the selected time
      localStorage.setItem('moviePoster', moviePoster);  // Store the selected time
      localStorage.setItem('title', title);  // Store the title
      localStorage.setItem('theaterName', theaterName);  // Store the theater name
      error.status === 401 ? navigate('/Login') : "";
    }
  };


  return (
    <div className="flex items-center justify-center  flex-col gap-44">
      <div className="flex box hover:shadow-xl hover:shadow-green-500/50  border-2 border-black rounded-2xl  mt-10 ml-32 mr-32 pt-10 pl-32 pr-32 gap-10 items-start justify-center relative">
        <div className=" mb-10 -ml-28 w-[20%]">
        <img
            className="rounded-xl overflow-hidden w-full object-cover"
            src={`https://image.tmdb.org/t/p/w500${moviePoster}`}
            alt={title}
          />
        </div>
        <div className="w-[70%] flex flex-col  gap-20">
          {/* Bouncing ball */}
          <div className="bouncing-ball"></div>
          <div className=" flex items-center justify-center gap-20">
            <div className="text text-4xl font-bold flex items-center justify-center py-2">
              Show Timing
            </div>
            <div className="text-2xl font-medium py-2 items-center justify-center flex">
              {selectedTime}
            </div>
            <div className="text text-4xl font-bold flex items-center justify-center py-2">
              Selected Show
            </div>
            <div className="text-2xl font-medium py-2 items-center justify-center flex">
              {title}
            </div>
          </div>

          <div className="flex items-center justify-start gap-20">
            <div className="">
              <div className="text-4xl font-bold flex items-center justify-center py-2">
                Row
              </div>
              {seatSelected.map((item, index) => (
                <div key={index}>
                  <div className="font-medium py-2 items-center justify-center flex">
                    {item.row}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-4xl w-56 font-bold flex items-center justify-center py-2">
                Seat Number
              </div>
              {seatSelected.map((item, index) => (
                <div key={index}>
                  <div className="items-center justify-center flex font-medium py-2">
                    {item.seat}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-4xl font-bold flex items-center justify-center py-2">
                Selected
              </div>
              <div>
                {seatSelected.map((items, keys) => (
                  <div
                    className="text-2xl items-center justify-center flex font-medium py-2"
                    key={keys}
                  >
                    <TiTick />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-10  flex  flex-col ">
              <div className="text-4xl w-94 font-bold flex items-center justify-center py-2">
                Theater Name
              </div>
              <div className="items-center justify-center text-xl flex font-medium px-10">
                {theaterName}
              </div>
            </div>
          </div>
        </div>
      </div>
      <button className="border-2 hover:shadow-xl hover:shadow-green-500/50 hover:bg-green-500 border-black rounded-3xl px-4 py-2"
        onClick={payment}>Payable amount 250</button>
    </div>
  );
};

export default CheckOut;
