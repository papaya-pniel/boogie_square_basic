import React from "react";

// Detect mobile for touch-friendly sizing
const isMobile = typeof window !== 'undefined' && (
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
  window.innerWidth < 768
);

export function Button({ children, onClick, className = "", variant = "default", ...props }) {
  const baseClasses = "font-medium rounded-xl transition touch-manipulation";
  const mobileClasses = isMobile ? "min-h-[44px] min-w-[44px] px-6 py-3 text-base" : "px-4 py-2";
  
  const variantClasses = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-600 text-white hover:bg-gray-700",
  };
  
  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${mobileClasses} ${variantClasses[variant] || variantClasses.default} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
  