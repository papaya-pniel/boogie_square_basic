import React, { createContext, useState } from "react";

export const VideoContext = createContext();

export function VideoProvider({ children }) {
  const [videos, setVideos] = useState(Array(4).fill(null));

  const updateVideoAtIndex = (index, videoUrl) => {
    setVideos((prev) => {
      const updated = [...prev];
      updated[index] = videoUrl;
      return updated;
    });
  };

  return (
    <VideoContext.Provider value={{ videos, updateVideoAtIndex }}>
      {children}
    </VideoContext.Provider>
  );
}
