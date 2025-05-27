import React, { useState } from 'react';
import { signIn, getCurrentUser } from 'aws-amplify/auth';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { isSignedIn, nextStep } = await signIn({ username: email, password });
      if (isSignedIn) {
        const user = await getCurrentUser();
        onLogin(user);
      } else {
        console.log('Next step:', nextStep);
      }
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
      <button type="submit">Sign In</button>
    </form>
  );
}
