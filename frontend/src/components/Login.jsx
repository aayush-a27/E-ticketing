import axios from "axios";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const inputStyle = "w-full px-4 py-2 bg-transparent border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black transition-all duration-200";
const buttonStyle = "w-full bg-black text-white px-4 py-2 rounded-md hover:scale-105 hover:shadow-lg transition-all duration-200";

  const navigate = useNavigate();
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(
        '/api/login',
        { email, password },
        { withCredentials: true } // For cookies
      );
      if (response) {
        const response = await axios.get('/api/checkLogin');
        navigate(response.data.lastVisited)
      };
  
      // Check if there is a last visited route
      const lastVisited = localStorage.getItem('lastVisited');
      console.log(lastVisited)
      if (lastVisited) {
        const seatSelected = JSON.parse(localStorage.getItem('seatSelected'));
        const selectedTime = localStorage.getItem('selectedTime');
        const moviePoster = localStorage.getItem('moviePoster');
        const title = localStorage.getItem('title');
        const theaterName = localStorage.getItem('theaterName');
  
        // Navigate to the saved route
        navigate(lastVisited, {
          state: { seatSelected, selectedTime, title, theaterName, moviePoster },
        });
      } else {
        navigate('/'); // Default redirect if no last visited page
      }
    } catch (error) {
      console.error('Login failed', error.response?.data?.message || error.message);
    }
    localStorage.removeItem('lastVisited');
        localStorage.removeItem('seatSelected');
        localStorage.removeItem('selectedTime');
        localStorage.removeItem('title');
        localStorage.removeItem('theaterName');
        localStorage.removeItem('moviePoster');
  };
  
  

  return (
    <div className="w-full">
      <div className="w-full">
        <h2 className="text-xl font-bold mb-4 text-center">Login</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-1" htmlFor="login-email">Email:</label>
            <input
              id="login-email"
              type="email"
              className={inputStyle}
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label className="block mb-1" htmlFor="login-password">Password:</label>
            <input
              id="login-password"
              type="password"
              className={inputStyle}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className={buttonStyle}
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
