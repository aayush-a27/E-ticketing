import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { motion } from "framer-motion";

const Cards = ({ movie }) => {
  const navigate = useNavigate();
  const imageBaseURL = "https://image.tmdb.org/t/p/w500";

  const handleClick = () => {
    navigate(`/movie/${movie.id}`, { state: { movie } });
  };

  return (
    <motion.div
      onClick={handleClick}
      className="w-[220px] h-[360px] bg-white rounded-xl overflow-hidden cursor-pointer group shadow-lg transition-transform duration-300 hover:scale-105"
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: Math.random() * 0.5, duration: 0.4 }}
    >
      <div className="h-[80%] w-full overflow-hidden">
        <img
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          src={`${imageBaseURL}${movie.poster_path}`}
          alt={movie.title}
        />
      </div>
      <div className="h-[20%] bg-black flex items-center justify-center">
        <h2 className="text-white text-xl text-center font-[CabinSketch]">{movie.title}</h2>
      </div>
    </motion.div>
  );
};

Cards.propTypes = {
  movie: PropTypes.shape({
    id: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    poster_path: PropTypes.string.isRequired,
    overview: PropTypes.string,
  }).isRequired,
};

export default Cards;
