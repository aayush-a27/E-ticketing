import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  const handleButtonClick = () => {
    navigate('/Book');
  };

  return (
    <div className="h-screen w-full bg-black text-white flex flex-col items-center justify-center font-sans">
      <h1 className="text-5xl md:text-7xl font-bold tracking-wide text-center leading-tight">
        Lights. Camera. Action.
      </h1>
      <p className="mt-4 text-lg md:text-2xl text-gray-400 text-center px-4 max-w-2xl">
        “A great movie is a journey of emotion — book your ticket to the experience.”
      </p>

      <button
        onClick={handleButtonClick}
        className="mt-16 px-8 py-3 rounded-full border border-white text-white font-semibold tracking-wide relative overflow-hidden group transition-all duration-300"
      >
        <span className="relative z-10">Book Now</span>
        <div className="absolute inset-0 bg-white scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300 ease-in-out z-0" />
        <span className="absolute inset-0 z-0" />
        <style>{`
          button:hover span {
            color: black;
          }
        `}</style>
      </button>
    </div>
  );
};

export default Home;
