import { useState } from "react";
import { Link } from "react-router-dom";
import Login from "./Login";
import SignUp from "./SignUp";

const Navbar = () => {
  const [Clicked, setClicked] = useState(false);
  const [LoginClicked, setLoginClicked] = useState(true);
  const [SignUpClicked, setSignUpClicked] = useState(false);

  const handleClick = () => {
    setClicked(!Clicked);
    setLoginClicked(true);
    setSignUpClicked(false);
  };

  const handleLogin = () => {
    setLoginClicked(true);
    setSignUpClicked(false);
  };

  const handleSignUp = () => {
    setSignUpClicked(true);
    setLoginClicked(false);
    
  };

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
      <div
        className="ml-96 hover:bg-green-500 text-2xl hover:border-2 border-black rounded-full py-2 px-6 hover:shadow-xl hover:shadow-green-700/50 flex items-center justify-center"
        onClick={handleClick}
      >
        Login
      </div>

      {Clicked ? (
        <div className="right-0 rounded-xl shadow-xl z-30 top-24 w-[25%] flex flex-col items-center justify-center h-[60%] absolute p-4">
          <div className="w-full px-28 flex items-center justify-between mb-4">
            <h1
              onClick={handleLogin}
              className="border-2 rounded-3xl px-4 py-2 border-black bg-green-500 hover:shadow-xl hover:shadow-green-700/50 cursor-pointer"
            >
              Login
            </h1>
            <h1
              onClick={handleSignUp}
              className="border-2 rounded-3xl px-4 py-2 border-black bg-green-500 hover:shadow-xl hover:shadow-green-700/50 cursor-pointer"
            >
              Sign Up
            </h1>
          </div>

          {/* Login Form */}
          {LoginClicked ? <Login/>: (
            ""
          )}

          {/* Sign Up Form */}
          {SignUpClicked ? <SignUp/>: (
            ""
          )}
        </div>
      ) : (
        ""
      )}
    </div>
  );
};

export default Navbar;
