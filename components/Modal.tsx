import React from 'react';

interface ModalProps {
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, children }) => {
  return (
    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="backdrop-blur-md bg-slate-900/95 text-white p-6 sm:p-8 rounded-2xl border border-slate-700/40 shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center w-full max-w-xl mx-4 animate-fade-in-down flex flex-col max-h-[90dvh]">
        <h2 className="text-3xl font-extrabold mb-4 bg-gradient-to-r from-yellow-300 to-amber-400 bg-clip-text text-transparent shrink-0 filter drop-shadow">
          {title}
        </h2>
        <div className="text-base sm:text-lg mb-6 space-y-4 overflow-y-auto pr-2 font-medium text-slate-200">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;