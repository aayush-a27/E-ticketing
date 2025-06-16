import { useState } from "react";
import axios from "axios";

const SignUp = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
    const inputStyle = "w-full px-4 py-2 bg-transparent border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black transition-all duration-200";
const buttonStyle = "w-full bg-black text-white px-4 py-2 rounded-md hover:scale-105 hover:shadow-lg transition-all duration-200";

  const handleSubmit = async (e) => {
    e.preventDefault(); // Prevent the default form submission
    try {
      const response = await axios.post("/api/signup", {
        username,
        email,
        password,
      });

      if (response.status === 200) {
        alert("Signup successful!");
      } else {
        alert("Signup failed. Try again.");
      }
    } catch (error) {
      console.error("Error during signup:", error);
      alert("An error occurred during signup.");
    }
  };

  return (
    <div className="w-full">
      <div className="w-full">
        <h2 className="text-xl font-bold mb-4 text-center">Sign Up</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-1" htmlFor="signup-username">Username:</label>
            <input
              id="signup-username"
              type="text"
              className={inputStyle}
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)} // Update username state
            />
          </div>
          <div className="mb-4">
            <label className="block mb-1" htmlFor="signup-email">Email:</label>
            <input
              id="signup-email"
              type="email"
              className={inputStyle}
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)} // Update email state
            />
          </div>
          <div className="mb-4">
            <label className="block mb-1" htmlFor="signup-password">Password:</label>
            <input
              id="signup-password"
              type="password"
              className={inputStyle}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)} // Update password state
            />
          </div>
          <button
            type="submit"
            className={buttonStyle}
          >
            Sign Up
          </button>
        </form>
      </div>
    </div>
  );
};

export default SignUp;
