import React from 'react';

const ForkliftIcon: React.FC<{ className?: string; color?: string }> = ({ className, color = '#FBBF24' }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 64 56" // Adjusted for a less tall appearance
    className={className} 
    aria-label="Carretilla elevadora" 
    role="img"
  >
    {/* Mast with lights */}
    <path fill="#2D3748" d="M16 0h8v42h-8z" />
    <rect x="18" y="4" width="4" height="4" rx="1" fill="#EF4444" />
    <rect x="18" y="12" width="4" height="4" rx="1" fill="#EF4444" />
    <rect x="18" y="20" width="4" height="4" rx="1" fill="#EF4444" />

    {/* Body and Cabin */}
    <path fill={color} d="M22 28h30l6 14h-36z" />
    <path fill="#1F2937" d="M25 28v-12c0-2.2 1.8-4 4-4h14c2.2 0 4 1.8 4 4v12z" />
    
    {/* Cabin Frame */}
    <path d="M47 16c2.2 0 4 1.8 4 4v2m-24-6c-2.2 0-4 1.8-4 4v10" stroke="#4A5568" strokeWidth="3" fill="none" />

    {/* Steering Wheel & Seat */}
    <circle cx="34" cy="24" r="3" fill="none" stroke="#4A5568" strokeWidth="1.5" />
    <path d="M34 24l-2.5 1.5" stroke="#4A5568" strokeWidth="1.5" />
    <path fill="#2D3748" d="M40 22h5v6h-5z" />
    
    {/* Forks */}
    <path fill="#4A5568" d="M0 42h16v5h-16z" />
    <path fill="#4A5568" d="M0 49h16v5h-16z" />

    {/* Wheels */}
    <circle cx="28" cy="42" r="8" fill="#2D3748" />
    <circle cx="28" cy="42" r="3" fill="#9CA3AF" />
    <circle cx="52" cy="42" r="6" fill="#2D3748" />
    <circle cx="52" cy="42" r="2.5" fill="#9CA3AF" />
  </svg>
);

export default ForkliftIcon;