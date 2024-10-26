import axios from "axios";
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RiMovieLine } from "@remixicon/react";

const Theaterfetch = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { title, releaseDate } = location.state || {
    title: "",
    releaseDate: "",
  };
  const [Theater, setTheater] = useState(null);
  const [dayClicked, setDayClicked] = useState(false);
  const [day, setDay] = useState(null);

  useEffect(() => {
    const findLocation = async () => {
      await navigator.geolocation.getCurrentPosition(
        gotLocation,
        failedLocation
      );
    };

    findLocation();
  }, []);

  const clickedDay = (e) => {
    console.log(e.target.innerText);
    setDay(e.target.innerText);
    setDayClicked(true);
  };

  const sendLocation = async (lat, lon) => {
    try {
      const response = await axios.post(
        "/api/location",
        { lat: lat, lon: lon, title: title, releaseDate: releaseDate },
        { withCredentials: true }
      );
      fetchTheater(response.data.city, response.data.country);
    } catch {
      console.error("Error sending location");
    }
  };

  const gotLocation = (position) => {
    const { latitude, longitude } = position.coords;
    sendLocation(latitude, longitude);
  };

  const failedLocation = () => {
    console.log("Location cannot be fetched");
  };

  const fetchTheater = async (city, country) => {
    try {
      const response = await axios.post(
        "/api/theaterDetails",
        {
          city: city,
          country: country,
          movieTitle: title,
          releaseDate: releaseDate,
        },
        { withCredentials: true }
      );
      setTheater(response.data);
    } catch (err) {
      console.log("There is an error", err);
    }
  };

  // Handle click on the entire <li> element
  const handleTheaterClick = (timingsArray) => {
    // Navigate to the SeatsBooking component and pass the timings array
    navigate("/seatsBooking", { state: { timings: timingsArray,title } });
  };

  return (
    <div>
      <div className="text-6xl ml-10 mt-5 font-extrabold">{title}</div>
      <div className="flex w-full justify-start items-start border-2 gap-20 px-10 py-6 text-l mt-10">
        {Theater &&
          Theater.map((items, keys) => (
            <div
              className="border-2 border-black rounded-full py-3 px-4 hover:bg-green-500 active:bg-green-500"
              key={keys}
              onClick={clickedDay}
            >
              {items.day}
            </div>
          ))}
      </div>
      {dayClicked && Theater ? (
        <div className="theaterCard w-full text-l">
          {Theater.filter((items) => items.day === day).map(
            (filteredDay, index) => (
              <div key={index}>
                <ul>
                  {filteredDay.theaters.map((theater, theaterIndex) => (
                    <div key={theaterIndex}>
                      <li
                        className="border-t-2 items-center w-full justify-start flex gap-4 hover:bg-green-300 py-4 px-8 border-black border-separate"
                        onClick={() =>
                          handleTheaterClick(
                            theater.showing.flatMap((show) => show.time)
                          )
                        }
                      >
                        <div className="flex gap-10 w-[30%]">
                          <RiMovieLine
                            size={36}
                            color="black"
                            className="my-icon"
                          />
                          {theater.name}
                        </div>
                        <div className="px-2 w-[70%] flex items-center gap-4 justify-start py-2">
                          {theater.showing.map((items, keys) => (
                            <div className="flex flex-wrap gap-4" key={keys}>
                              {items.time.map((timing, keys) => (
                                <div
                                  key={keys}
                                  className="timings px-4 py-2 flex border-2 flex-wrap rounded-full border-black bg-black text-white"
                                >
                                  {timing}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </li>
                    </div>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      ) : null}
    </div>
  );
};

export default Theaterfetch;
