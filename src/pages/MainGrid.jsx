// src/pages/MainGrid.jsx
import React, { useContext, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { VideoContext } from "../context/VideoContext";
import { Button } from "../components/ui/button";
import { uploadData, downloadData, remove } from "aws-amplify/storage";

const Storage = {
  async put(filename, blob, options) {
    return await uploadData(filename, blob, options);
  },
  async get(s3Key, options) {
    return await downloadData(s3Key, options);
  }
};

export default function MainGrid() {
  const navigate = useNavigate();
  const { 
    videos, 
    updateVideoAtIndex, 
    isLoading, 
    getS3VideoUrl, 
    canContributeToPosition, 
    userContributions,
    clearSharedGrid,
    user 
  } = useContext(VideoContext);
  const [selectedSong, setSelectedSong] = useState("none.mp3");
  const [gridSize] = useState(4); // Fixed at 4x4 = 16 squares
  const [gridReady, setGridReady] = useState(false);

  const audioRef = useRef();
  const totalSlots = 16; // Always 16 squares
  const [videoUrls, setVideoUrls] = useState([]);

  useEffect(() => {
    let isMounted = true;
    
    async function fetchVideoUrls() {
      try {
        const urls = await Promise.all(
          videos.map(async (video) => {
            if (!video) return null;
            try {
              const url = await getS3VideoUrl(video);
              // Test if the URL is accessible
              const response = await fetch(url, { method: 'HEAD' });
              if (response.ok) {
                return url;
              } else {
                console.warn(`Video URL not accessible: ${url}`);
                return null;
              }
            } catch (error) {
              console.error('Error fetching video URL:', error);
              return null;
            }
          })
        );
        
        // Only update state if component is still mounted
        if (isMounted) {
          setVideoUrls(urls);
        }
      } catch (error) {
        console.error('Error fetching video URLs:', error);
        if (isMounted) {
          setVideoUrls([]);
        }
      }
    }
    
    fetchVideoUrls();
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [videos, getS3VideoUrl]);

  const paddedVideos = [...videoUrls];
  while (paddedVideos.length < totalSlots) paddedVideos.push(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.4;
      audioRef.current.load();
      audioRef.current.play().catch((err) => console.warn("Autoplay failed", err));
    }
  }, [selectedSong]);

  useEffect(() => {
    let loaded = 0;
    const total = paddedVideos.filter(Boolean).length;
    const videoElements = [];

    if (total === 0) {
      setGridReady(true);
      return;
    }

    paddedVideos.forEach((src) => {
      if (!src) return;
      const video = document.createElement("video");
      video.src = src;
      videoElements.push(video);
      
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

    // Cleanup function to remove video elements and event listeners
    return () => {
      videoElements.forEach(video => {
        video.onloadeddata = null;
        video.onerror = null;
        video.src = '';
      });
    };
  }, [paddedVideos]);

  const handleSlotClick = (index) => {
    if (!canContributeToPosition(index)) return;
    navigate(`/record/${index}`);
  };

  const handlePlaybackClick = (index) => {
    navigate(`/playback/${index}`);
  };

  const getSlotStyle = (index) => {
    const canContribute = canContributeToPosition(index);
    const hasUserContribution = userContributions.has(index);
    const isFilled = videos[index] !== null;

    if (hasUserContribution) {
      return "bg-green-500/20 border-green-400"; // User's contribution
    } else if (isFilled) {
      return "bg-blue-500/20 border-blue-400"; // Other user's contribution
    } else if (canContribute) {
      return "bg-yellow-500/20 border-yellow-400 cursor-pointer hover:bg-yellow-500/30"; // Available for user
    } else {
      return "bg-gray-500/20 border-gray-400"; // Not available (user already contributed)
    }
  };

  // Optional helper reused from RecordPage for preview (step 0)
  const getTutorialSrc = (step, index) => {
    const folders = ["/tutorial_1/", "/tutorial_2/", "/tutorial_3/"];
    const folder = folders[Math.max(0, Math.min(step, folders.length - 1))];
    const n = index + 1;
    return folder + encodeURIComponent(`Pattern-${step + 1}_${n}.mp4`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>Loading grid state...</p>
      </div>
    );
  }

  if (!gridReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>Loading videos...</p>
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
        <p className="text-gray-200 text-center">Collaborative Dance Grid - Choose an available square to contribute!</p>
        
        {/* Testing Mode Notice */}
        <div className="bg-yellow-500/20 border border-yellow-400 rounded-lg p-3 mb-4">
          <p className="text-yellow-200 text-sm text-center">
            🧪 <strong>Testing Mode:</strong> You can record videos for multiple squares to test the synchronized playback!
          </p>
        </div>
        
        {/* User Info */}
        {user && (
          <div className="text-sm text-gray-200 mb-2">
            Welcome, {user.username || user.email}! 
            {userContributions.size === 0 
              ? "Choose one empty square to record your dance." 
              : "You've already contributed to this grid!"}
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-4 text-xs mb-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-400 rounded"></div>
            <span>Available</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-400 rounded"></div>
            <span>Your slot</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-400 rounded"></div>
            <span>Other users</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-400 rounded"></div>
            <span>Unavailable</span>
          </div>
        </div>

        {/* Grid */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 shadow-xl">
          <div
            className="grid gap-0"
            style={{
              gridTemplateColumns: `repeat(4, 1fr)`,
              gridTemplateRows: `repeat(4, 1fr)`,
              width: "min(70vw, 70vh)",
              height: "min(70vw, 70vh)"
            }}
          >
            {paddedVideos.map((src, idx) => (
              <div
                key={idx}
                onClick={() => handleSlotClick(idx)}
                className={`relative flex items-center justify-center rounded-none overflow-hidden border-2 ${getSlotStyle(idx)}`}
              >
                {src ? (
                  // Show lock icon for recorded slots instead of video
                  <div className="flex flex-col items-center justify-center w-full h-full">
                    <div className="text-6xl mb-2">🔒</div>
                    <div className="text-sm text-white/80 font-bold">RECORDED</div>
                  </div>
                ) : (
                  <>
                    <video
                      src={getTutorialSrc(0, idx)}
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
            ))}
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex justify-center gap-4 mt-6">
          <Button
            onClick={() => handlePlaybackClick(0)}
            className="bg-purple-600 hover:bg-purple-700 px-6 py-3"
          >
            🎬 View Synchronized Playback
          </Button>
          <Button
            onClick={async () => {
              if (confirm('Clear all videos from the grid? This will reset everything for testing.')) {
                await clearSharedGrid();
                window.location.reload();
              }
            }}
            className="bg-red-600 hover:bg-red-700 px-6 py-3"
          >
            🗑️ Clear Grid (Testing)
          </Button>
        </div>

        {/* Audio Player */}
        <audio ref={audioRef} autoPlay loop className="hidden">
          <source src={`/music/${selectedSong}`} type="audio/mp3" />
        </audio>
      </div>
    </div>
  );
}