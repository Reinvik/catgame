import React from 'react';

interface ModalProps {
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, children }) => {
  return (
    <div className="absolute inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="bg-gray-700 text-white p-8 rounded-xl shadow-2xl text-center w-full max-w-xl mx-4 animate-fade-in-down">
        <h2 className="text-3xl font-bold mb-4 text-yellow-400">{title}</h2>
        <div className="text-lg mb-6 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;