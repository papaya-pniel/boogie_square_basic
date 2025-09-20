import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

import MainGrid from "../pages/MainGrid.jsx";
import TrainPage from "../pages/TrainPage.jsx";
import RecordPage from "../pages/RecordPage.jsx";
import GridPlaybackPage from "../pages/GridPlaybackPage.jsx";

export default function AppRouter() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<MainGrid user={user} signOut={signOut} />} />
            <Route path="/train/:index" element={<TrainPage user={user} />} />
            <Route path="/record/:index" element={<RecordPage user={user} />} />
            <Route path="/playback/:index" element={<GridPlaybackPage user={user} />} />
          </Routes>
        </BrowserRouter>
      )}
    </Authenticator>
  );
}
