const cookieParser = require('cookie-parser');
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const userModal = require('./models/UserData');
const app = express();

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

app.get('/api/shows', async (req, res) => {
  const today = new Date().toISOString().split('T')[0]; // Today's date
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 2);  // 1 month ago
  const lastMonthDate = lastMonth.toISOString().split('T')[0];

  async function getUpcomingMovies() {
    try {
      const fetchHindiMovies = await axios.get(`${baseURL}/movie/now_playing`, {
        params: {
          api_key: apiKey,
          language: 'en-IN',
          region: 'IN',  // Modify based on your region
          sort_by: 'release_date.desc',  // Sort by most recent release
          'release_date.gte': lastMonthDate,  // Movies released after this date
          'release_date.lte': today,  // Movies released before today
        },
      });

      const fetchEnglishMovies = axios.get('https://api.themoviedb.org/3/movie/now_playing', {
        params: {
          api_key: apiKey,
          language: 'en-US',  // English movies
          region: 'US',  // US region
          sort_by: 'release_date.desc',
          'release_date.gte': lastMonthDate,
          'release_date.lte': today,
        }
      });

      const [hindiMoviesResponse, englishMoviesResponse] = await Promise.all([fetchHindiMovies, fetchEnglishMovies]);
      
      const allMovies = [
        ...hindiMoviesResponse.data.results,
        ...englishMoviesResponse.data.results,
      ];

      for (let movie of allMovies) {  // Use 'allMovies' instead of 'allmovies'
        movie.cast = await getUpcomingMoviesCasts(movie.id);
      }

      res.json(allMovies);  // Return the combined movie list
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

app.post('/api/location',async (req, res)=>{
  const {lat, lon, title, releaseDate} = req.body;
  console.log({lat: lat, lon: lon, title: title, releaseDate: releaseDate});
  try{
    const response = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
    const city = response.data.address.city;
    const country = response.data.address.country;
    console.log(city, country);
    res.send({city, country});
  } catch (err){
    console.error('Error fetching location data:', error);
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

app.get('/api/theaters',async (req, res) => {
  const response = await axios.get('https://serpapi.com/search.json?q=theaters&location=Ghaziabad,India&hl=en&gl=us');
  
})

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
  console.log(req.body);
  const { email, password } = req.body;
  const user = await userModal.findOne({ email });
  if (!user) {
    return res.status(400).json({ message: 'User not found' });
  }
  const passwordCompared = await bcrypt.compare(password, user.password);
  if (!passwordCompared) {
    return res.status(400).json({ message: 'Email or password is wrong' });
  }
  const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });

  res.status(200).json({ message: 'Login successful' , token});
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
