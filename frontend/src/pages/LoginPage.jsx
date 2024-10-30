import { useState } from "react";
import Login from "../components/Login";
import SignUp from "../components/SignUp";
const LoginPage = () => {
    const [LoginClicked, setLoginClicked] = useState(true);
    const [SignUpClicked, setSignUpClicked] = useState(false);

    const handleLogin = () => {
      setLoginClicked(true);
      setSignUpClicked(false);
    };
  
    const handleSignUp = () => {
      setSignUpClicked(true);
      setLoginClicked(false);
      
    };
  return (
    <div className="flex items-center justify-center">
        <div className="rounded-xl shadow-xl w-[25%] flex flex-col mt-44 items-center justify-center h-[60%] p-4">
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
    </div>
  )
}

export default LoginPage