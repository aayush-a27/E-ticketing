import { Link } from "react-router-dom";
import { useState } from "react";
import { Menu, X } from "lucide-react"; // Using Lucide for icons

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { name: "Home", path: "/" },
    { name: "Bookings", path: "/Bookings" },
    { name: "Login", path: "/Login" },
  ];

  return (
    <nav className="w-full bg-black border-b border-white font-sans z-50 relative">
      <div className="h-20 flex items-center justify-between px-6 md:px-24">
        <h1 className="text-white text-2xl font-bold tracking-wider">🎬 CineReserve</h1>

        {/* Desktop Nav */}
        <div className="hidden md:flex gap-8">
          {navItems.map(({ name, path }) => (
            <Link
              key={name}
              to={path}
              className="relative px-6 py-2 rounded-full border border-white text-white font-medium overflow-hidden group transition-all duration-300"
            >
              <span className="relative z-10">{name}</span>
              <div className="absolute inset-0 bg-white scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300 ease-in-out z-0" />
              <style>{`
                .group:hover span {
                  color: black;
                }
              `}</style>
            </Link>
          ))}
        </div>

        {/* Mobile Hamburger */}
        <div className="md:hidden z-50">
          <button onClick={() => setMenuOpen(!menuOpen)} className="text-white">
            {menuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {menuOpen && (
        <div className="md:hidden absolute w-full top-20 left-0 bg-black flex flex-col items-center gap-4 py-6 border-t border-white shadow-md">
          {navItems.map(({ name, path }) => (
            <Link
              key={name}
              to={path}
              className="text-white text-lg border-b border-white w-full text-center py-2 hover:bg-white hover:text-black transition"
              onClick={() => setMenuOpen(false)}
            >
              {name}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
