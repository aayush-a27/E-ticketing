import axios from "axios"
import { useState } from "react";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();  // Check if both email and password are filled
    try {
      const response = await axios.post(
        '/api/login',
        { email, password }
      );
      await console.log(response.data)
      await localStorage.setItem('token', response.data.token);
      await console.log('Login successful', response.data.token);
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
                    value = {email}
                    onChange={(e)=>setEmail(e.target.value)}
                  />
                </div>
                <div className="mb-4">
                  <label className="block mb-1" htmlFor="login-password">Password:</label>
                  <input
                    id="login-password"
                    type="password"
                    className="w-full px-3 py-2 border rounded-md"
                    placeholder="Enter your password"
                    value = {password}
                    onChange={(e)=>setPassword(e.target.value)}
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
  )
}

export default Login