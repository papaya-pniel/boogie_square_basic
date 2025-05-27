import React, { useEffect, useState } from 'react';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import Login from './login';
import Home from './home';

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        setUser(null);
      }
    }
    fetchUser();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
  };

  return user ? <Home onSignOut={handleSignOut} /> : <Login onLogin={setUser} />;
}
