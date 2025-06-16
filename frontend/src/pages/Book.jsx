import { useEffect, useState } from "react";
import Cards from "../components/Cards";
import axios from 'axios';
import { motion } from "framer-motion";

const Book = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/shows')
      .then(response => {
        setData(response.data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching data:', error);
        setLoading(false);
      });
  }, []);

  return (
    <div className="w-full min-h-screen bg-black flex flex-col items-center pt-10 px-4 font-[CabinSketch]">
      <h1 className="text-5xl text-white mb-10 tracking-wide text-center">🍿 Pick Your Flick!</h1>

      {loading ? (
        <div className="flex justify-center items-center h-96">
          <div className="loader ease-linear rounded-full border-8 border-t-white border-white border-opacity-10 h-20 w-20 animate-spin"></div>
        </div>
      ) : (
        <motion.div
          className="w-full flex flex-wrap justify-center gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          {data.map((movie, index) => (
            <Cards key={index} movie={movie} />
          ))}
        </motion.div>
      )}
    </div>
  );
};

export default Book;
