import { signIn, signUp, getCurrentUser } from 'aws-amplify/auth';

export async function signUpUser(email, password) {
  return await signUp({ username: email, password });
}

export async function signInUser(email, password) {
  return await signIn({ username: email, password });
}

export async function getUser() {
  return await getCurrentUser();
}
