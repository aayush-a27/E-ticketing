import { useLocation } from "react-router-dom";
import { TiTick } from "react-icons/ti";
const CheckOut = () => {
  const location = useLocation();
  const { seatSelected, selectedTime } = location.state;

  return (
    <div className="border-2 border-black rounded-2xl mt-10 ml-32 pt-10 pl-32 gap-20 flex flexcol items-center justify-start">
      <div>{selectedTime}</div>
      <div className="">
        <div className="text-4xl font-bold flex items-center justify-center py-2">Row</div>
        {seatSelected.map((item, index) => (
          <div key={index}>
            <div className="font-medium py-2 items-center justify-center flex">{item.row}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="text-4xl font-bold flex items-center justify-center py-2 ">Seat Number</div>
        {seatSelected.map((item, index) => (
          <div key={index}>
            <div className="items-center justify-center flex font-medium py-2">{item.seat}</div>
          </div>
        ))}
      </div>
        <div>
        <div className="text-4xl font-bold flex items-center justify-center py-2">Selected</div>
        <div>{seatSelected.map((items,keys)=>(
            <div className="text-2xl items-center justify-center flex font-medium py-2" key = {keys}><TiTick /></div>
        ))}</div>
        </div>
    </div>
  );
};

export default CheckOut;
