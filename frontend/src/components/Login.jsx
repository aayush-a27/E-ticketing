import axios from "axios";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(
        '/api/login',
        { email, password },
        { withCredentials: true } // This enables sending and receiving cookies
      );
      response ? console.log('Login successful') : "";
  
      const lastVisited = localStorage.getItem('lastVisited');
      if (lastVisited) {
        const seatSelected = JSON.parse(localStorage.getItem('seatSelected'));
        const selectedTime = localStorage.getItem('selectedTime');
        const moviePoster = localStorage.getItem('moviePoster');
        const title = localStorage.getItem('title');
        const theaterName = localStorage.getItem('theaterName');
  
        // Navigate to the checkout route with the saved data
        navigate(lastVisited, {
          state: { seatSelected, selectedTime, title, theaterName, moviePoster },
        });
  
        // Clear the stored data
        localStorage.removeItem('lastVisited');
        localStorage.removeItem('seatSelected');
        localStorage.removeItem('selectedTime');
        localStorage.removeItem('title');
        localStorage.removeItem('theaterName');
        localStorage.removeItem('moviePoster');
      } else {
        navigate('/'); // Default redirect if no last visited path
      }
    } catch (error) {
      console.error('Login failed', error.response?.data?.message || error.message);
    }
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
              className="w-full px-3 py-2 border rounded-md"
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
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 w-full"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
