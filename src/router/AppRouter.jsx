// src/client/router/AppRouter.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "../pages/Login.jsx";
import MainGrid from "../pages/MainGrid.jsx";
import TrainPage from "../pages/TrainPage.jsx";
import RecordPage from "../pages/RecordPage.jsx";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<MainGrid />} />
        <Route path="/train/:index" element={<TrainPage />} />
        <Route path="/record/:index" element={<RecordPage />} />
      </Routes>
    </BrowserRouter>
  );
}
