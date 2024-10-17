import PropTypes from 'prop-types';

const DialogBox = ({ onSeatSelect, onClose }) => {
  const arr = [1, 2, 3, 4, 5, 6];

  const handleClick = (seat) => {
    onSeatSelect(seat); // Call the onSeatSelect function with the selected seat
    onClose(); // Close the dialog box
  };

  return (
    <div className="border-2 border-black h-56 w-96 flex flex-col items-center justify-center absolute top-[40%] left-[40%] rounded-3xl">
      <div className="text-xl">How many seats you want to book</div>
      <div className="flex gap-3 w-full items-center justify-center mt-10">
        {arr.map((items) => (
          <div
            onClick={() => handleClick(items)} // Pass the seat number on click
            className="rounded-full hover:bg-green-500 border-2 border-black px-4 py-2 cursor-pointer"
            key={items}
          >
            {items}
          </div>
        ))}
      </div>
    </div>
  );
};

// Prop validation
DialogBox.propTypes = {
  onSeatSelect: PropTypes.func.isRequired, // onSeatSelect should be a function and is required
  onClose: PropTypes.func.isRequired, // onClose should be a function and is required
};

export default DialogBox;
