import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const Moviedetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { movie } = location.state;

  const handleButtonClick = () => {
    const releaseYear = movie.release_date.split("-")[0];
    navigate("/theater", {
      state: {
        title: movie.title,
        releaseDate: releaseYear,
        moviePoster: movie.poster_path,
      },
    });
  };

  const genres = movie.genres || ["Action", "Adventure", "Drama"]; // Fallback

  const facts = [
    "This movie was shot across 3 continents!",
    "Director took inspiration from classic noir films.",
    "The lead actor did all their own stunts!",
    "One scene took 42 takes to perfect.",
  ];

  return (
    <motion.div
      className="min-h-screen w-full bg-black text-white px-10 md:px-28 py-12 font-[CabinSketch]"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      <h1 className="text-5xl md:text-7xl font-bold tracking-wide mb-12 text-center md:text-left">
        {movie.title}
      </h1>

      <div className="flex flex-col md:flex-row gap-10">
        {movie.poster_path && (
          <motion.img
            className="rounded-xl w-full md:w-[25%] object-cover shadow-xl"
            src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
            alt={movie.title}
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4 }}
          />
        )}

        <div className="md:w-[75%] space-y-8">
          <p className="text-xl md:text-2xl">
            <span className="font-bold">Description: </span>
            {movie.overview}
          </p>

          <p className="text-xl md:text-2xl">
            <span className="font-bold">Release Date: </span>
            {movie.release_date}
          </p>

          <div className="text-xl md:text-2xl">
            <span className="font-bold block mb-2">Casts:</span>
            <div className="flex gap-6 flex-wrap">
              {movie.cast.slice(0, 5).map((member, index) => (
                <motion.span
                  key={index}
                  className="border-b-2 border-white hover:text-gray-400 cursor-pointer"
                  whileHover={{ scale: 1.1 }}
                >
                  {member.name}
                </motion.span>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-wrap gap-6">
            <motion.button
              className="px-6 py-3 border border-white text-white rounded-full relative overflow-hidden group"
              whileHover={{ scale: 1.05 }}
              onClick={() => alert("Trailer feature coming soon!")}
            >
              <span className="relative z-10">🎬 Watch Trailer</span>
              <div className="absolute inset-0 bg-white scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300 z-0" />
              <style>{`
                .group:hover span {
                  color: black;
                }
              `}</style>
            </motion.button>

            <motion.button
              className="px-6 py-3 border border-white text-white rounded-full relative overflow-hidden group"
              whileHover={{ scale: 1.05 }}
              onClick={handleButtonClick}
            >
              <span className="relative z-10">📍 Find Theaters</span>
              <div className="absolute inset-0 bg-white scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300 z-0" />
              <style>{`
                .group:hover span {
                  color: black;
                }
              `}</style>
            </motion.button>
          </div>
        </div>
      </div>

      {/* ✨ Extra Movie Info Section */}
      {/* ✨ Extra Movie Info Section */}
      <motion.div
        className="mt-10 md:mt-14 w-full text-center"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 1 }}
        viewport={{ once: true }}
      >
        <h2 className="text-4xl mb-6">🎥 Genre Tags</h2>
        <div className="flex justify-center gap-4 flex-wrap text-xl">
          {genres.map((genre, idx) => (
            <span
              key={idx}
              className="border px-4 py-1 rounded-full hover:bg-white hover:text-black transition"
            >
              {genre}
            </span>
          ))}
        </div>

        <h2 className="text-4xl mt-10 mb-4">💡 Did You Know?</h2>
        <p className="text-xl italic max-w-3xl mx-auto text-gray-300">
          {facts[Math.floor(Math.random() * facts.length)]}
        </p>

        <h2 className="text-4xl mt-10 mb-4">🗯️ Viewer Reactions</h2>
        <p className="text-xl text-white max-w-2xl mx-auto font-[CabinSketch]">
          “Absolutely mind-bending! Felt like I was time-traveling with popcorn
          in hand.” – A fan
        </p>
      </motion.div>
    </motion.div>
  );
};

export default Moviedetails;
