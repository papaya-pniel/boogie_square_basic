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
    const hasRecording = paddedVideos[index] !== null;
    const hasUserContribution = userContributions.has(index);
    
    // Don't allow clicking on slots with recordings from other users
    if (hasRecording && !hasUserContribution) return;
    
    if (!canContributeToPosition(index)) return;
    navigate(`/record/${index}`);
  };


  const getSlotStyle = (index) => {
    const hasUserContribution = userContributions.has(index);
    const hasRecording = paddedVideos[index] !== null;
    
    if (hasUserContribution) {
      return "bg-green-500/20 border-green-400 cursor-pointer hover:bg-green-500/30"; // User's contribution - green background
    } else if (hasRecording) {
      return "bg-red-500/20 border-red-400 cursor-not-allowed"; // Someone else's recording - red background, no interaction
    } else {
      return "cursor-pointer hover:bg-gray-900"; // Available slot - default styling
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
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-8">Boogie Square</h1>
      
      {/* Grid */}
      <div 
        className="grid gap-0 border border-gray-300"
        style={{
          gridTemplateColumns: `repeat(4, 1fr)`,
          gridTemplateRows: `repeat(4, 1fr)`,
          width: "400px",
          height: "400px"
        }}
      >
        {paddedVideos.map((src, idx) => {
          const hasUserContribution = userContributions.has(idx);
          const hasRecording = src !== null;
          
          return (
            <div
              key={idx}
              onClick={() => handleSlotClick(idx)}
              className={`relative flex items-center justify-center bg-black border border-gray-300 ${getSlotStyle(idx)}`}
            >
              {hasRecording ? (
                <>
                  {/* Show the actual recorded video */}
                  <video
                    src={src}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover z-0"
                  />
                  {/* Lock overlay for other users' recordings */}
                  {!hasUserContribution && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                      <div className="text-6xl text-red-400">🔒</div>
                    </div>
                  )}
                  {/* User's own recording indicator */}
                  {hasUserContribution && (
                    <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-1 rounded z-20">
                      ✓
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Tutorial video looping in background for available slots */}
                  <video
                    src={getTutorialSrc(0, idx)}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover opacity-40 z-0"
                  />
                  {/* Plus icon overlay */}
                  <div className="text-6xl text-cyan-400 z-10 relative">+</div>
                </>
              )}
            </div>
          );
        })}
      </div>


      {/* Controls */}
      <div className="flex justify-center gap-4 mt-8">
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
  );
}