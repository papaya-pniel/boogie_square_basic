export const handler = async () => {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Hello from Amplify REST API!' }),
    };
  };
  