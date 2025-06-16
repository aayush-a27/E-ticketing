import axios from "axios";
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RiMovieLine } from "@remixicon/react";
import { motion } from "framer-motion";

const Theaterfetch = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { title, releaseDate, moviePoster } = location.state || {
    title: "",
    releaseDate: "",
    moviePoster: ""
  };

  const [Theater, setTheater] = useState([]);
  const [dayClicked, setDayClicked] = useState(false);
  const [day, setDay] = useState(null);
  const [loading, setLoading] = useState(true);

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
    setDay(e.target.innerText);
    setDayClicked(true);
  };

  const sendLocation = async (lat, lon) => {
    try {
      const response = await axios.post(
        "/api/location",
        { lat: lat, lon: lon, title, releaseDate }
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
        { city, country, movieTitle: title, releaseDate },
        { withCredentials: true }
      );
      setTheater(response.data || []);
    } catch (err) {
      console.log("There is an error", err);
    } finally {
      setLoading(false);
    }
  };

  const handleTheaterClick = (timingsArray, theaterName) => {
    navigate("/seatsBooking", { state: { timings: timingsArray, title, theaterName, moviePoster } });
  };

  return (
    <motion.div
      className="bg-black text-white min-h-screen px-6 py-10 font-[CabinSketch]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    >
      <div className="text-center mb-10">
        <h1 className="text-5xl font-extrabold mb-2">🎬 {title}</h1>
        <p className="text-gray-400 text-sm">Select a day to see showtimes</p>
      </div>

      {loading ? (
        <div className="text-center text-xl animate-pulse">Loading theaters near you...</div>
      ) : (
        <>
          <div className="flex flex-wrap justify-center gap-4 mb-10">
            {Theater?.map((items, keys) => (
              <motion.button
                key={keys}
                className={`border border-white px-5 py-2 rounded-full text-white hover:bg-white hover:text-black transition-all text-base font-semibold ${items.day === day ? 'bg-white text-zinc-900' : ''}`}
                whileHover={{ scale: 1.05 }}
                onClick={clickedDay}
              >
                {items.day}
              </motion.button>
            ))}
          </div>

          {dayClicked && Theater && (
            <div className="space-y-10">
              {Theater.filter((items) => items.day === day).map((filteredDay, index) => (
                <div key={index} className="space-y-6">
                  {filteredDay.theaters.map((theater, theaterIndex) => (
                    <motion.div
                      key={theaterIndex}
                      className="bg-white text-black p-6 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer"
                      whileHover={{ scale: 1.01 }}
                      onClick={() =>
                        handleTheaterClick(
                          theater.showing.flatMap((show) => show.time),
                          theater.name
                        )
                      }
                    >
                      <div className="flex items-center gap-4 mb-3">
                        <RiMovieLine size={28} />
                        <h2 className="text-xl font-bold">{theater.name}</h2>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {theater.showing.map((items, keys) => (
                          <div key={keys} className="flex gap-2 flex-wrap">
                            {items.time.map((timing, keys) => (
                              <div
                                key={keys}
                                className="px-3 py-1 border border-black rounded-full bg-black text-white text-sm font-medium"
                              >
                                {timing}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
};

export default Theaterfetch;