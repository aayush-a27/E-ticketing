import { useState } from "react";
import Login from "../components/Login";
import SignUp from "../components/SignUp";

const LoginPage = () => {
  const [LoginClicked, setLoginClicked] = useState(true);

  return (
    <div className="flex items-center justify-center min-h-screen bg-black font-mono transition-all duration-300">
      <div className="rounded-2xl shadow-2xl w-[90%] md:w-[26%] flex flex-col p-6 bg-white">
        <div className="flex justify-center gap-6 mb-6">
          <button
            onClick={() => setLoginClicked(true)}
            className={`px-5 py-2 border-2 rounded-full transition-all duration-300 ${
              LoginClicked
                ? "bg-black text-white border-black scale-105"
                : "bg-transparent text-black border-gray-500 hover:scale-105 hover:shadow-md"
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setLoginClicked(false)}
            className={`px-5 py-2 border-2 rounded-full transition-all duration-300 ${
              !LoginClicked
                ? "bg-black text-white border-black scale-105"
                : "bg-transparent text-black border-gray-500 hover:scale-105 hover:shadow-md"
            }`}
          >
            Sign Up
          </button>
        </div>

        {LoginClicked ? <Login /> : <SignUp />}
      </div>
    </div>
  );
};

export default LoginPage;
