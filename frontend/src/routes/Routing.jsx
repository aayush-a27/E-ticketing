import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home';
import Bookings from '../pages/Bookings';
import Book from '../pages/Book';
import Moviedetails from '../pages/Moviedetails';
import Theaterfetch from '../pages/Theaterfetch';
import SeatsBooking from '../pages/SeatsBooking';
import CheckOut from '../pages/CheckOut';

const Routing = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/Bookings" element={<Bookings />} />
      <Route path="/movie/:id" element={<Moviedetails />} />
      <Route path="/Book" element={<Book />}/>
      <Route path="/theater" element={<Theaterfetch/>} />
      <Route path="/seatsBooking" element={<SeatsBooking/>} />
      <Route path = "/checkOut" element = {<CheckOut/>}/>
    </Routes>
  );
};

export default Routing;
