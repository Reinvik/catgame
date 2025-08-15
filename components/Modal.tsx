import React from 'react';

interface ModalProps {
  title: string;
  children: React.ReactNode;
  buttonText: string;
  onButtonClick: () => void;
}

const Modal: React.FC<ModalProps> = ({ title, children, buttonText, onButtonClick }) => {
  return (
    <div className="absolute inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
      <div className="bg-gray-700 text-white p-8 rounded-xl shadow-2xl text-center max-w-md mx-4 animate-fade-in-down">
        <h2 className="text-3xl font-bold mb-4 text-yellow-400">{title}</h2>
        <div className="text-lg mb-8 space-y-2">
          {children}
        </div>
        <button
          onClick={onButtonClick}
          className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-3 px-8 rounded-lg text-xl transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-yellow-300"
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
};

export default Modal;
