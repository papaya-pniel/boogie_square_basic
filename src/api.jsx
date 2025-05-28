import { generateClient } from 'aws-amplify/data';
const client = generateClient();

export async function saveUserProfile(id, name, email) {
  return await client.models.User.create({
    id,
    name,
    email,
    createdAt: new Date().toISOString(),
  });
}

export async function getUserProfiles() {
  return await client.models.User.list();
}
