import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';

const Cards = ({ movie }) => {
  const navigate = useNavigate();
  const imageBaseURL = "https://image.tmdb.org/t/p/w500";

  const handleClick = () => {
    navigate(`/movie/${movie.id}`, { state: { movie } });  // Passing movie data via state
  };

  return (
    <div className="hover:scale-105 hover:shadow-dark-lg hover:shadow-green-700/50 h-66 w-[15%] bg-green-500 m-6 rounded-2xl overflow-hidden" onClick={handleClick}>
      <div className='h-[80%]'>
        <img
          className="w-full h-full object-fit " 
          src={`${imageBaseURL}${movie.poster_path}`} 
          alt={movie.title} 
        />
      </div>
      <h1 className="text-2xl text-white w-full h-[20%] flex items-center justify-center">
        {movie.title}
      </h1>
    </div>
  );
};

// Defining PropTypes for the movie object
Cards.propTypes = {
  movie: PropTypes.shape({
    id: PropTypes.number.isRequired,        // ID is required and should be a number
    title: PropTypes.string.isRequired,     // Title is required and should be a string
    poster_path: PropTypes.string.isRequired, // Poster path is required and should be a string
    overview: PropTypes.string,             // Overview is optional but should be a string if present
  }).isRequired,
};

export default Cards;
