import React from "react";
import ReactDOM from "react-dom/client";
import AppRouter from "./router/AppRouter.jsx";
import { VideoProvider } from "./context/VideoContext";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";

import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';
Amplify.configure(outputs);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <VideoProvider>
        <AppRouter />
      </VideoProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
