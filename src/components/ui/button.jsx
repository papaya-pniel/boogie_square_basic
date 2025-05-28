import React from "react";
export function Button({ children, onClick, className = "", ...props }) {
    return (
      <button
        onClick={onClick}
        className={`bg-blue-600 text-white font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
  