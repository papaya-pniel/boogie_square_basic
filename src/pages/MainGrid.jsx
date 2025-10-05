// src/pages/MainGrid.jsx
import React, { useContext, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { VideoContext } from "../context/VideoContext";
import { Button } from "../components/ui/button";
import AuthButton from "../components/AuthButton";
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
    videoTakes,
    updateVideoAtIndex, 
    isLoading, 
    getS3VideoUrl, 
        canContributeToPosition,
        userContributions,
        clearSharedGrid,
        forceSyncFromShared,
        user
  } = useContext(VideoContext);
  const [selectedSong, setSelectedSong] = useState("none.mp3");
  const [gridSize] = useState(4); // Fixed at 4x4 = 16 squares
  const [gridReady, setGridReady] = useState(false);

  // Synchronized playback state - always playing
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTake, setCurrentTake] = useState(1); // 1, 2, or 3
  const [playbackInterval, setPlaybackInterval] = useState(null);

  const audioRef = useRef();
  const totalSlots = 16; // Always 16 squares
  const [videoUrls, setVideoUrls] = useState([]);
  const [allTakeUrls, setAllTakeUrls] = useState([]); // Store URLs for all takes

  // Preload all takes for seamless transitions
  useEffect(() => {
    console.log('🚀 MainGrid: Preloading useEffect triggered');
    console.log('🚀 MainGrid: videoTakes length:', videoTakes?.length);
    console.log('🚀 MainGrid: getS3VideoUrl type:', typeof getS3VideoUrl);
    
    let isMounted = true;
    
    async function preloadAllTakes() {
      try {
        console.log('🔄 MainGrid: Preloading all takes for seamless transitions');
        console.log('🔄 MainGrid: videoTakes:', videoTakes);
        console.log('🔄 MainGrid: getS3VideoUrl function:', typeof getS3VideoUrl);
        
        const allUrls = await Promise.all(
          videoTakes.map(async (takes, index) => {
            console.log(`🔄 Processing slot ${index}:`, takes);
            
            if (!takes || (!takes.take1 && !takes.take2 && !takes.take3)) {
              console.log(`📭 Slot ${index}: No takes found`);
              return { take1: null, take2: null, take3: null };
            }
            
            const takeUrls = { take1: null, take2: null, take3: null };
            
            // Preload all takes for this slot
            for (let takeNum = 1; takeNum <= 3; takeNum++) {
              const takeKey = `take${takeNum}`;
              const takeVideo = takes[takeKey];
              
              if (takeVideo) {
                try {
                  console.log(`🔄 Preloading take ${takeNum} for slot ${index}, S3 key:`, takeVideo);
                  const url = await getS3VideoUrl(takeVideo);
                  console.log(`🔗 getS3VideoUrl returned for take ${takeNum} slot ${index}:`, url);
                  
                  if (url) {
                    // Skip the HEAD request test for now - just use the URL
                    takeUrls[takeKey] = url;
                    console.log(`✅ Preloaded take ${takeNum} for slot ${index}:`, url);
                  } else {
                    console.error(`❌ getS3VideoUrl returned null for take ${takeNum} slot ${index}`);
                  }
                } catch (error) {
                  console.error(`❌ Error preloading take ${takeNum} for slot ${index}:`, error);
                }
              } else {
                console.log(`📭 Slot ${index} take ${takeNum}: No video`);
              }
            }
            
            console.log(`📋 Slot ${index} final takeUrls:`, takeUrls);
            return takeUrls;
          })
        );
        
        if (isMounted) {
          setAllTakeUrls(allUrls);
          console.log('📋 All takes preloaded successfully:', allUrls);
        }
      } catch (error) {
        console.error('❌ MainGrid: Error preloading takes:', error);
      }
    }
    
    preloadAllTakes();
    
    return () => {
      isMounted = false;
    };
  }, [videoTakes, getS3VideoUrl]);

  // Update current take URLs from preloaded data
  useEffect(() => {
    console.log('🔄 Updating video URLs for current take:', currentTake);
    console.log('🔄 allTakeUrls:', allTakeUrls);
    
    const currentUrls = allTakeUrls.map((slotTakes, index) => {
      if (!slotTakes) {
        console.log(`📭 Slot ${index}: No slotTakes`);
        return null;
      }
      const url = slotTakes[`take${currentTake}`] || null;
      console.log(`🎥 Slot ${index} take${currentTake}:`, url);
      return url;
    });
    
    console.log('📋 Final currentUrls:', currentUrls);
    setVideoUrls(currentUrls);
  }, [allTakeUrls, currentTake]);


  // Always use synchronized video sources
  const paddedVideos = [...videoUrls];
  while (paddedVideos.length < totalSlots) paddedVideos.push(null);

  // Initialize synchronized playback on mount
  useEffect(() => {
    console.log('🎬 Starting synchronized playback');
    setCurrentTake(1);
    
    // Cycle through takes every 4 seconds
    const interval = setInterval(() => {
      setCurrentTake(prevTake => {
        const nextTake = prevTake === 3 ? 1 : prevTake + 1;
        console.log(`🎬 Switching to take ${nextTake}`);
        return nextTake;
      });
    }, 4000); // 4 seconds per take
    
    setPlaybackInterval(interval);
    
    // Cleanup on unmount
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);


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
    const hasUserContribution = userContributions.has(index);
    // Check if there are any takes recorded for this slot (not just current take)
    const hasAnyRecording = videoTakes[index] && (videoTakes[index].take1 || videoTakes[index].take2 || videoTakes[index].take3);
    
    // Don't allow clicking on slots with recordings from other users
    if (hasAnyRecording && !hasUserContribution) return;
    
    if (!canContributeToPosition(index)) return;
    navigate(`/record/${index}`);
  };


  const getSlotStyle = (index) => {
    const hasUserContribution = userContributions.has(index);
    // Check if there are any takes recorded for this slot (not just current take)
    const hasAnyRecording = videoTakes[index] && (videoTakes[index].take1 || videoTakes[index].take2 || videoTakes[index].take3);
    
    if (hasUserContribution) {
      return "bg-green-500/20 border-green-400 cursor-pointer hover:bg-green-500/30"; // User's contribution - green background
    } else if (hasAnyRecording) {
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
          <div className="flex justify-between items-center w-full max-w-4xl mb-8">
            <h1 className="text-4xl font-bold">Boogie Square</h1>
            <AuthButton />
          </div>
      
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
          // Check if there are any takes recorded for this slot (not just current take)
          const hasAnyRecording = videoTakes[idx] && (videoTakes[idx].take1 || videoTakes[idx].take2 || videoTakes[idx].take3);
          const hasCurrentTake = src !== null;
          
          // Debug logging
          if (hasAnyRecording) {
            console.log(`🎥 Slot ${idx}: hasAnyRecording=${hasAnyRecording}, hasCurrentTake=${hasCurrentTake}, src=${src}, currentTake=${currentTake}`);
            console.log(`🎥 Slot ${idx} videoTakes:`, videoTakes[idx]);
            console.log(`🎥 Slot ${idx} allTakeUrls:`, allTakeUrls[idx]);
          }
          
          return (
            <div
              key={idx}
              onClick={() => handleSlotClick(idx)}
              className={`relative flex items-center justify-center bg-black border border-gray-300 ${getSlotStyle(idx)}`}
            >
              {hasAnyRecording ? (
                <>
                  {/* Show the actual recorded video */}
                  {src && (
                    <video
                      key={`${idx}-${currentTake}`}
                      src={src}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-200"
                      style={{ opacity: 1 }}
                    />
                  )}
                  {/* User's own recording indicator */}
                  {hasUserContribution && (
                    <div className="absolute top-1 right-1 bg-green-500/80 text-white text-xs px-1 rounded z-20 backdrop-blur-sm">
                      ✓
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Tutorial video looping in background for available slots */}
                  <video
                    key={`tutorial-${idx}-${currentTake}`}
                    src={getTutorialSrc(currentTake - 1, idx)}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 transition-opacity duration-200"
                    style={{ opacity: 0.4 }}
                  />
                  {/* Plus icon overlay */}
                  <div className="text-6xl text-cyan-400 z-10 relative">+</div>
                </>
              )}
            </div>
          );
        })}
      </div>


      {/* Synchronized Playback Status */}
      <div className="flex flex-col items-center gap-4 mt-8">
        {/* Playback Status */}
        <div className="text-center">
          <div className="text-2xl font-bold text-cyan-400 mb-2">
            🎬 Take {currentTake} Playing
          </div>
          <div className="text-sm text-gray-400">
            All squares showing Take {currentTake} videos
          </div>
        </div>
        
            {/* Controls */}
            <div className="flex gap-4">
              <Button
                onClick={async () => {
                  if (confirm('Clear all videos from the grid? This will reset everything for testing.')) {
                    await clearSharedGrid();
                    window.location.reload();
                  }
                }}
                className="bg-gray-600 hover:bg-gray-700 px-6 py-3"
              >
                🗑️ Clear Grid (Testing)
              </Button>
              <Button
                onClick={async () => {
                  console.log('🔄 Manual sync triggered by user');
                  await forceSyncFromShared();
                }}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-3"
              >
                🔄 Force Sync
              </Button>
            </div>
        
        {/* Instructions */}
        <div className="text-center text-sm text-gray-400 max-w-md">
          <p>
            🎵 All squares are playing Take {currentTake} videos in sync. 
            The takes automatically cycle every 4 seconds: Take 1 → Take 2 → Take 3 → repeat.
          </p>
        </div>
      </div>

      {/* Audio Player */}
      <audio ref={audioRef} autoPlay loop className="hidden">
        <source src={`/music/${selectedSong}`} type="audio/mp3" />
      </audio>
    </div>
  );
}