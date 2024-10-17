import { useNavigate } from 'react-router-dom';
const Home = () => {
  const navigate = useNavigate();
  const handleButtonClick = () => {
    navigate('/Book'); // Navigate to Book page
  };
  return (
    <div className="h-[90%] w-full text-black">
        <div className="py-24 w-full flex flex-col items-center justify-center">
          <h1 className="text-7xl">Wants to Book something?</h1>
          <button className='bg-green-500 py-3 px-4 rounded-xl mt-24 hover:shadow-xl hover:shadow-green-700/50' onClick={handleButtonClick}>Go to Book Page</button>
        </div>
    </div>
  )
}

export default Home