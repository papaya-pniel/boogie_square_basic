// src/clinet/MainGrid.jsx
import React, { useContext, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { VideoContext } from "../context/VideoContext";

export default function MainGrid() {
  const navigate = useNavigate();
  const { videos } = useContext(VideoContext);
  const [selectedSong, setSelectedSong] = useState("none.mp3");
  const [gridSize, _setGridSize] = useState(4);
  const [pattern, _setPattern] = useState(() => localStorage.getItem("pattern") || "default");
  const [gridReady, setGridReady] = useState(false);

  const setGridSize = (size) => {
    _setGridSize(size);
    localStorage.setItem("gridSize", size.toString());
  };

  const setPattern = (pat) => {
    _setPattern(pat);
    localStorage.setItem("pattern", pat);
  };

  const audioRef = useRef();
  const totalSlots = gridSize * gridSize;
  const paddedVideos = [...videos];
  while (paddedVideos.length < totalSlots) paddedVideos.push(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.4;
      audioRef.current.load();
      audioRef.current.play().catch((err) => console.warn("Autoplay failed", err));
    }
  }, [selectedSong]);

  useEffect(() => {
    if (pattern === "center-focus") setGridSize(4);
  }, [pattern]);

  useEffect(() => {
    if (pattern === "center-focus" && gridSize !== 4) setPattern("default");
  }, [gridSize, pattern]);

  useEffect(() => {
    let loaded = 0;
    const total = paddedVideos.filter(Boolean).length;

    if (total === 0) {
      setGridReady(true);
      return;
    }

    paddedVideos.forEach((src) => {
      if (!src) return;
      const video = document.createElement("video");
      video.src = src;
      video.onloadeddata = () => {
        loaded += 1;
        if (loaded >= total) {
          setGridReady(true);
        }
      };
      video.onerror = () => {
        console.warn("Failed to load:", src);
        loaded += 1;
        if (loaded >= total) {
          setGridReady(true);
        }
      };
    });
  }, [paddedVideos]);

  const handleSlotClick = (index) => {
    navigate(`/train/${index}`);
  };

  if (!gridReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>Loading grid...</p>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen text-white overflow-hidden"
      style={{ background: "linear-gradient(to top, #4466ff, #66bbff)" }}
    >
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-2 gap-2">
        <h1 className="text-4xl font-bold text-center">Boogie Square</h1>
        <p className="text-gray-200 text-center">Choose a square to learn a choreography and record yourself.</p>

        {/* Pattern Dropdown */}
        <div className="flex items-center gap-2 mb-4">
          <label htmlFor="pattern" className="text-sm text-white">🧩 Choose Pattern:</label>
          <select
            id="pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="bg-white/10 border border-white/20 text-white px-3 py-1 rounded-none"
          >
            <option value="default">Default Grid</option>
            {gridSize === 4 && <option value="center-focus">Center Focus</option>}
          </select>
        </div>

        {/* Grid */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 shadow-xl">
          {pattern === "center-focus" ? (
            <div
              className="grid gap-0"
              style={{
                gridTemplateColumns: `repeat(4, 1fr)`,
                gridTemplateRows: `repeat(4, 1fr)`,
                width: "min(70vw, 70vh)",
                height: "min(70vw, 70vh)"
              }}
            >
              {Array.from({ length: 16 }).map((_, idx) => {
                const isCenter = [5, 6, 9, 10].includes(idx);
                if (isCenter) return null;

                const centerVideo = paddedVideos[5];
                const src = paddedVideos[idx];
                const gridStyle = {};

                return (
                  <div
                    key={idx}
                    onClick={() => handleSlotClick(idx)}
                    style={gridStyle}
                    className="relative flex items-center justify-center cursor-pointer bg-white/10 rounded-none overflow-hidden"
                  >
                    {src ? (
                      <video src={src} autoPlay muted loop playsInline className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <video
                          src="/boogie_square_tutorial.mp4"
                          autoPlay
                          muted
                          loop
                          playsInline
                          className="absolute inset-0 w-full h-full object-cover opacity-40 z-0"
                        />
                        <span className="text-4xl text-white/40 font-bold z-10 relative">+</span>
                      </>
                    )}
                  </div>
                );
              })}
              <div
                className="relative flex items-center justify-center cursor-pointer bg-purple-600 overflow-hidden"
                style={{ gridColumn: "2 / span 2", gridRow: "2 / span 2", zIndex: 10 }}
                onClick={() => handleSlotClick(5)}
              >
                {paddedVideos[5] ? (
                  <video src={paddedVideos[5]} autoPlay muted loop playsInline className="w-full h-full object-cover" />
                ) : (
                  <>
                    <video
                      src="/boogie_square_tutorial.mp4"
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover opacity-40 z-0"
                    />
                    <span className="text-4xl text-white/40 font-bold z-10 relative">+</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div
              className="grid gap-0"
              style={{
                gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                gridTemplateRows: `repeat(${gridSize}, 1fr)`,
                width: "min(70vw, 70vh)",
                height: "min(70vw, 70vh)"
              }}
            >
              {paddedVideos.map((src, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSlotClick(idx)}
                  className="relative flex items-center justify-center bg-white/10 cursor-pointer rounded-none overflow-hidden"
                >
                  {src ? (
                    <video src={src} autoPlay muted loop playsInline className="w-full h-full object-cover" />
                  ) : (
                    <>
                      {gridSize === 4 && (
                        <video
                          src="/boogie_square_tutorial.mp4"
                          autoPlay
                          muted
                          loop
                          playsInline
                          className="absolute inset-0 w-full h-full object-cover opacity-40 z-0"
                        />
                      )}
                      <span className="text-4xl text-white/40 font-bold z-10 relative">+</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audio Player */}
        <audio ref={audioRef} autoPlay loop className="hidden">
          <source src={`/music/${selectedSong}`} type="audio/mp3" />
        </audio>
      </div>
    </div>
  );
}