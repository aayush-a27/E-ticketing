const cookieParser = require('cookie-parser');
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const Razorpay = require('razorpay');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const userModal = require('./models/UserData');
const Booking = require('./models/BookingData');
const app = express();
const connectDB = require('./db');
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;


app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({extended: true}));
app.use(cors());

// Route for fetching upcoming movies (TMDB)
const apiKey = 'fa21ba67e8bbb1960e14f06e47248b9b';  // Replace with your actual API key
const baseURL = 'https://api.themoviedb.org/3';
const SERPAPI_KEY = '041e0f378f0c8d8d780ee656f23409f67c504811e7c8075f5a24bd894199bc9e';

const loggedInToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).send("You must be logged in first!");
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send("Invalid or expired token.");
    }

    req.user = decoded;
    console.log(req.user,"here is user")  // Attach decoded user info to the request object
    next();  // Proceed to the next middleware or route handler
  });
};
connectDB();
app.get('/api/shows', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 2);
  const lastMonthDate = lastMonth.toISOString().split('T')[0];

  async function getUpcomingMovies() {
    try {
      const fetchHindiMovies = await axios.get(`${baseURL}/movie/now_playing`, {
        params: {
          api_key: apiKey,
          language: 'en-IN',
          region: 'IN',
          sort_by: 'release_date.desc',
          'release_date.gte': lastMonthDate,
          'release_date.lte': today,
        },
      });

      const fetchEnglishMovies = axios.get('https://api.themoviedb.org/3/movie/now_playing', {
        params: {
          api_key: apiKey,
          language: 'en-US',
          region: 'US',
          sort_by: 'release_date.desc',
          'release_date.gte': lastMonthDate,
          'release_date.lte': today,
        },
      });

      const [hindiMoviesResponse, englishMoviesResponse] = await Promise.all([fetchHindiMovies, fetchEnglishMovies]);

      const allMovies = [
        ...hindiMoviesResponse.data.results,
        ...englishMoviesResponse.data.results,
      ];

      for (let movie of allMovies) {
        movie.cast = await getUpcomingMoviesCasts(movie.id);
      }

      res.json(allMovies);
    } catch (error) {
      console.error('Error fetching upcoming movies:', error);
      res.status(500).send('Error fetching upcoming movies');
    }
  }

  async function getUpcomingMoviesCasts(movie_id) {
    try {
      const response = await axios.get(`${baseURL}/movie/${movie_id}/credits`, {
        params: {
          api_key: apiKey,
        },
      });
      return response.data.cast;
    } catch (error) {
      console.error('Error fetching movie cast:', error);
      return [];
    }
  }

  getUpcomingMovies();
});

app.post('/api/location', async (req, res) => {
  console.log("this route working");

  const { lat, lon, title, releaseDate } = req.body;
  console.log({ lat, lon, title, releaseDate });

  if (!lat || !lon) {
    console.error('Latitude or Longitude missing');
    return res.status(400).send({ error: 'Latitude and Longitude are required' });
  }

  try {
    const response = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
      headers: {
        'User-Agent': 'Movie Mania/1.0 (aayushbhadula567@gmail.com)', // Add your app name and contact email
      }
    });

    if (response.data && response.data.address) {
      const city = response.data.address.city;
      const country = response.data.address.country;
      console.log(city, country);
      return res.send({ city, country });
    } else {
      console.error('No address data found');
      return res.status(500).send({ error: 'Address not found' });
    }
  } catch (err) {
    console.error('Error fetching location data:', err);
    return res.status(500).send({ error: 'Error fetching location data' });
  }
});

app.post('/api/theaterDetails', async (req, res) => {
  const {city, country, movieTitle, releaseDate} = req.body;
  console.log({city: city, country: country, movieTitle: movieTitle, releaseDate: releaseDate});
  try {

    const response = await axios.get('https://serpapi.com/search.json', {
        params: {
            q: `${movieTitle} ${releaseDate} theater`,  // Movie name and 'theater' for fetching showtimes
            location: `${city},${country}`,  // User's latitude and longitude
            hl: 'en',
            gl: 'in',  // Can be modified based on region
            api_key: SERPAPI_KEY,
        }
    });
    const showtimesData = response.data.showtimes;
    res.json(showtimesData);  // Send showtime data back to frontend
    console.log(showtimesData);  // Send showtime data back to frontend
} catch (error) {
    console.error('Error fetching showtimes from SerpApi:', error);
    res.status(500).json({ error: 'Failed to fetch showtimes' });
}
});


app.post('/api/signup', async (req, res) => {
  try{
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    let createUser = await userModal.create({
      username:username,
      emailId: email,
      password: hashedPassword
    })
    console.log(createUser);
  }
  catch{
    console.log("user already exist")
  }
  

});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userModal.findOne({ emailId: email });

    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const passwordCompared = await bcrypt.compare(password, user.password);
    if (!passwordCompared) {
      return res.status(400).json({ message: 'Email or password is wrong' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.emailId },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Send the token as an HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true, // Prevent access from JavaScript
      secure: process.env.NODE_ENV === 'production', // Set to true in production (for HTTPS)
      maxAge: 3600000, // Cookie expires in 1 hour
      sameSite: 'Strict', // Prevent CSRF attacks
    });

    return res.status(200).json({ message: 'Login successful' });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ message: 'Server error, please try again' });
  }
});

app.post('/api/checkOut', loggedInToken, async (req, res) => {
  try {
    const { seatSelected } = req.body;
    // Mock confirmation message for testing
    res.status(200).json({ message: "Checkout route is working and protected!", seatSelected });
  } catch (error) {
    res.status(500).json({ error: "Failed to access checkout route" });
  }
});
// In your backend
const BookingData = require('./models/BookingData');  // Make sure to import your model

// Booking Route
app.post('/api/bookTicket', loggedInToken, async (req, res) => {
  const { seatSelected, selectedTime, title, theaterName } = req.body;
  const userId = req.user.userId;  // Get userId from the JWT token attached by the loggedInToken middleware

  try {
    const newBooking = new Booking({
      userId,              // Associate the booking with the user
      movieTitle: title,
      seatSelected,
      showTime: selectedTime,
      theaterName,
    });
    console.log(newBooking)
    await newBooking.save();
    res.status(200).json({ message: 'Booking confirmed' });
  } catch (error) {
    console.error("Error during booking:", error);
    res.status(500).json({ message: 'Failed to process booking' });
  }
});

// In your backend (Express)
app.get('/api/getBookingHistory', loggedInToken, async (req, res) => {
  try {
    // Get the userId from the decoded token (req.user contains user info from the loggedInToken middleware)
    const userId = req.user.userId;

    // Fetch the bookings associated with the user from the BookingData model
    const bookings = await BookingData.find({ userId }).sort({ date: -1 }); // Sort by date in descending order

    // Send the bookings as a response
    return res.status(200).json(bookings);
  } catch (error) {
    console.error('Error fetching booking history:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/deleteBooking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    console.log(`Attempting to delete booking with ID: ${bookingId}`);

    const deletedBooking = await BookingData.findByIdAndDelete(bookingId);

    if (!deletedBooking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    console.log(`Deleted booking: ${deletedBooking}`);
    res.status(200).json({ message: 'Booking history deleted successfully' });
  } catch (error) {
    console.error("Error deleting booking:", error);
    res.status(500).json({ message: 'Server error' });
  }
});

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID, // Add your Razorpay Key ID
  key_secret: process.env.RAZORPAY_KEY_SECRET, // Add your Razorpay Key Secret
});
app.post('/api/payment', async (req, res) => {
  const { amount } = req.body; // Example: amount = 250 (in INR)

  try {
    const paymentOrder = await razorpayInstance.orders.create({
      amount: amount * 100, // Razorpay expects amount in paise (100 paise = 1 INR)
      currency: 'INR',
      receipt: `receipt_order_${Math.random()}`,
    });

    res.status(200).json({
      id: paymentOrder.id,
      currency: paymentOrder.currency,
      amount: paymentOrder.amount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
