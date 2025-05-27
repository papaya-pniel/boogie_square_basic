import React from 'react';

export default function Home({ onSignOut }) {
  return (
    <div>
      <h1>Welcome to the Protected Page!</h1>
      <button onClick={onSignOut}>Sign Out</button>
    </div>
  );
}
