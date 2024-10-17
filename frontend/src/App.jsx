import { useEffect } from 'react';
import Navbar from './components/Navbar';
import Routing from './routes/Routing';
function App() {
  useEffect(()=>{
    
  })
  return (
    <div className="App h-screen w-full ">
        <Navbar />
        <Routing />
    </div>
  );
}

export default App;
