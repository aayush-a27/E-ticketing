import { useNavigate } from 'react-router-dom';
import cinemaImage1 from '../assets/cinema_image1-removebg-preview (1).png'
import cinemaImage2 from  '../assets/cinema_image_2-removebg-preview.png'
import  cinemaImage3 from '../assets/ccinema_image__3-removebg-preview.png'
import cinemaImage4 from '../assets/cinemaImage4-removebg-preview.png'
const Home = () => {
  const navigate = useNavigate();
  const handleButtonClick = () => {
    navigate('/Book'); // Navigate to Book page
  };
  return (
    <div className="h-[90%] w-full text-black">
      <img className='absolute z-[-1] ' src={cinemaImage1} alt="" />
      <img className=' absolute z-[-1] right-0' src={cinemaImage2} alt="" />
      <img className='absolute z-[-1] scale-[0.6] left-[20%] py-44 bottom-0' src={cinemaImage3} alt="" />
      <img className='absolute z-[-1] scale-[0.8] left-[55%] top-48 bottom-0' src={cinemaImage4} alt="" />
        <div className="py-24 w-full flex flex-col items-center justify-center">
          <h1 className="text-7xl">Wants to Book something?</h1>
          <button className='bg-green-500 py-3 px-4 rounded-xl mt-24 hover:shadow-xl hover:shadow-green-700/50' onClick={handleButtonClick}>Go to Book Page</button>
        </div>
    </div>
  )
}

export default Home