import { useEffect, useState } from "react";
import Cards from "../components/Cards"
import axios from 'axios';

const Book = () => {
  const [data, setData] = useState([]);
  useEffect(() => {
    axios.get('/api/shows')
      .then(response => setData(response.data))
      .catch(error => console.error('Error fetching data:', error));
  }, []);
  
  return (
    <div className="w-full flex flex-wrap justify-center">
      {
      data.map((movie, index) => (
        <Cards key={index} movie={movie} />
      ))
      }
    </div>
  )
}

export default Book;
