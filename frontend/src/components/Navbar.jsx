import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <div className="h-24 w-full border-b-[1px] border-black flex items-center justify-center">
      <Link
        to="/"
        className="ml-24 hover:bg-green-500 text-2xl hover:border-2 border-black rounded-full py-2 px-6 hover:shadow-xl hover:shadow-green-700/50 flex items-center justify-center"
      >
        Home
      </Link>
      <Link
        to="/Bookings"
        className="ml-24 hover:bg-green-500 text-2xl hover:border-2 border-black rounded-full py-2 px-6 hover:shadow-xl hover:shadow-green-700/50 flex items-center justify-center"
      >
        Bookings
      </Link>
      <Link
        to="/Login"
        className="ml-96 hover:bg-green-500 text-2xl hover:border-2 border-black rounded-full py-2 px-6 hover:shadow-xl hover:shadow-green-700/50 flex items-center justify-center"
      >
        Login
      </Link>
    </div>
  );
};

export default Navbar;
