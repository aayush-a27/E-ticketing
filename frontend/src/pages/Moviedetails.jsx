import { useLocation, useNavigate } from "react-router-dom";

const Moviedetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { movie } = location.state;

  const handleButtonClick = () => {
    const releaseYear = movie.release_date.split('-')[0];  // Extract the year
    console.log(movie.title, releaseYear);
    navigate('/theater', { state: { title: movie.title, releaseDate: releaseYear } });
  };
  return (
    <div className="h-[90%] w-full px-28 py-10 relative overflow-hidden">
      <div className="circle1 bg-green-500 h-[100vh] w-[50vw] absolute -left-64 bottom-5 -top-64 -z-10 rounded-full"></div>
      <div className="circle1 bg-green-500 h-[100vh] w-[50vw] absolute -right-64 top-64 -z-10 rounded-full"></div>
      <h1 className="w-full flex items-center text-8xl font-bold mb-12">
        {movie.title}
      </h1>

      {/* Movie Poster and Details */}
      <div className="w-full h-[60%] flex items-start justify-center">
        {movie.poster_path && (
          <img
            className="rounded-xl overflow-hidden w-[20%] h-full object-cover"
            src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
            alt={movie.title}
          />
        )}

        <div className="w-[80%] px-24">
          {/* Movie Description */}
          <p className="text-2xl flex gap-20">
            <span className="font-bold">Description: </span> {movie.overview}
          </p>

          {/* Release Date */}
          <div className="flex w-full mt-10 text-2xl gap-16">
            <span className="font-bold">Release Date:</span>{" "}
            {movie.release_date}
          </div>

          {/* Cast List */}
          <div className="flex w-full mt-10 text-2xl gap-36">
            <span className="w-28 font-bold">Casts:</span>
            <div className="flex gap-10 flex-wrap">
              {movie.cast.slice(0, 5).map((member, index) => (
                <span className="border-b-2 border-black" key={index}>
                  {member.name}
                </span>
              ))}
            </div>
          </div>
          <div className="w-full mt-20 -ml-44 flex items-center justify-center gap-10">
            <button className="py-3 px-6 rounded-2xl bg-black text-white">Watch Trailer</button>
            <button onClick={handleButtonClick} className="py-3 px-6 rounded-2xl bg-black text-white">Find Theaters</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Moviedetails;
