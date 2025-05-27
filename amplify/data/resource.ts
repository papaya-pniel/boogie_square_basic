import { Amplify } from 'aws-amplify';
import { get } from '@aws-amplify/api';
import outputs from '../../amplify_outputs.json';

Amplify.configure(outputs);

async function fetchData() {
  try {
    const restOperation = get({
      apiName: 'myApi', // Replace with your actual API name
      path: '/login', // Replace with your actual path
    });

    const { body } = await restOperation.response;
    const response = await body.json();
    console.log('Response:', response);
  } catch (error) {
    console.error('API error:', error);
  }
}

fetchData();