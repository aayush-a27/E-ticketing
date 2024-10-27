import { useLocation } from "react-router-dom";
import { TiTick } from "react-icons/ti";

const CheckOut = () => {
  const location = useLocation();
  const { seatSelected, selectedTime, title, theaterName } = location.state;
  const payment = ()=>{}
  return (
    <div   className="flex items-center justify-center  flex-col gap-44">
      <div className="box hover:shadow-xl hover:shadow-green-500/50  border-2 border-black rounded-2xl  mt-10 ml-32 mr-32 pt-10 pl-32 pr-32 gap-10 flex flex-col items-start justify-center relative">
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
            <div className="text-4xl font-bold flex items-center justify-center py-2">
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
          <div className="flex gap-10 mb-[11%] ">
            <div className="text-4xl font-bold flex items-center justify-center py-2">
              Theater Name
            </div>
            <div className="items-center justify-center text-xl flex font-medium py-2">
              {theaterName}
            </div>
          </div>
        </div>
      </div>
      <button className="border-2 hover:shadow-xl hover:shadow-green-500/50 hover:bg-green-500 border-black rounded-3xl px-4 py-2">Payable amount 250</button>
    </div>
  );
};

export default CheckOut;
