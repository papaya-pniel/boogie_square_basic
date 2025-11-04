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
        user,
        activeGridNumber,
        currentGridNumber,
        userContributedGridNumber,
        ensureActiveGrid,
        loadGridByNumber
  } = useContext(VideoContext);
  const [selectedSong, setSelectedSong] = useState("none.mp3");
  const [gridSize] = useState(4); // Fixed at 4x4 = 16 squares
  const [gridReady, setGridReady] = useState(false);

  // Synchronized playback state - always playing
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTake, setCurrentTake] = useState(1); // 1, 2, or 3
  const [playbackInterval, setPlaybackInterval] = useState(null);
  const [videosStarted, setVideosStarted] = useState(false); // Track if videos have been started for the first time
  const [startTimeout, setStartTimeout] = useState(null); // Track timeout for fallback start

  const audioRef = useRef();
  const totalSlots = 16; // Always 16 squares
  const [allTakeUrls, setAllTakeUrls] = useState([]); // Store URLs for all takes (for zero-delay switching)

  // Track which takes have been started (using ref to avoid re-renders)
  const videosStartedRef = useRef({});

  // Preload all takes for seamless transitions
  useEffect(() => {
    let isMounted = true;
    
    async function preloadAllTakes() {
      try {
        const allUrls = await Promise.all(
          videoTakes.map(async (takes, index) => {
            if (!takes || (!takes.take1 && !takes.take2 && !takes.take3)) {
              return { take1: null, take2: null, take3: null };
            }
            
            const takeUrls = { take1: null, take2: null, take3: null };
            
            // Preload all takes for this slot
            for (let takeNum = 1; takeNum <= 3; takeNum++) {
              const takeKey = `take${takeNum}`;
              const takeVideo = takes[takeKey];
              
              if (takeVideo) {
                try {
                  const url = await getS3VideoUrl(takeVideo);
                  if (url) {
                    takeUrls[takeKey] = url;
                  }
                } catch (error) {
                  console.error(`Error preloading take ${takeNum} for slot ${index}:`, error);
                }
              }
            }
            
            return takeUrls;
          })
        );
        
        if (isMounted) {
          setAllTakeUrls(allUrls);
        }
      } catch (error) {
        console.error('Error preloading takes:', error);
      }
    }
    
    preloadAllTakes();
    
    return () => {
      isMounted = false;
    };
  }, [videoTakes, getS3VideoUrl]);

  // Synchronize all videos of the current take across all squares
  // Ensures all squares show the same take at the exact same playback position
  // Also ensures all videos start playing simultaneously on first load
  useEffect(() => {
    const takeKey = `take${currentTake}`;
    
    // Use data-take attribute to find videos (fixed selector)
    const getVideoElements = () => {
      return document.querySelectorAll(`video[data-take="${currentTake}"]`);
    };
    
    let videoElements = getVideoElements();
    
    // If no videos found, wait a bit and try again
    if (videoElements.length === 0) {
      const retryTimeout = setTimeout(() => {
        videoElements = getVideoElements();
      }, 100);
      return () => clearTimeout(retryTimeout);
    }
    
    // Check if we've already started videos for this take
    const hasStartedForTake = videosStartedRef.current[takeKey] || false;
    
    // Wait for videos to be ready before starting them
    const checkAndStart = () => {
      // Refresh video elements in case DOM changed
      videoElements = getVideoElements();
      const allVideos = Array.from(videoElements);
      
      // Filter out videos that don't have a src (empty slots)
      const videosWithSrc = allVideos.filter(v => v.src && v.src.trim() !== '');
      
      if (videosWithSrc.length === 0) {
        return;
      }
      
      // Use readyState >= 2 (HAVE_CURRENT_DATA)
      const readyVideos = videosWithSrc.filter(v => v.readyState >= 2);
      
      // Wait for ALL videos (that have a src) to be ready before starting
      if (videosWithSrc.length > 0 && readyVideos.length === videosWithSrc.length) {
        // First time starting - reset all to beginning and start simultaneously
        if (!hasStartedForTake) {
          // Reset all ready videos to beginning
          readyVideos.forEach(video => {
            video.pause();
            video.currentTime = 0;
          });
          
          // Small delay to ensure all videos are paused and reset
          setTimeout(() => {
            // Start all ready videos simultaneously
            Promise.all(
              readyVideos.map(video => {
                return video.play().catch((err) => {
                  console.warn('Autoplay failed for video:', err);
                  return Promise.resolve();
                });
              })
            ).then(() => {
              // After all videos start, sync them to the same time
              if (readyVideos.length > 0) {
                const referenceTime = readyVideos[0].currentTime;
                readyVideos.forEach((video, index) => {
                  if (index > 0) {
                    video.currentTime = referenceTime;
                  }
                });
                videosStartedRef.current[takeKey] = true;
                setVideosStarted(true);
              }
            });
          }, 50);
        } else {
          // Subsequent syncs - ensure all ready videos are playing and synced
          if (readyVideos.length > 0) {
            const referenceVideo = readyVideos[0];
            const referenceTime = referenceVideo.currentTime;
            
            readyVideos.forEach((video, index) => {
              if (index > 0) {
                if (Math.abs(video.currentTime - referenceTime) > 0.1) {
                  video.currentTime = referenceTime;
                }
              }
              if (video.paused) {
                video.play().catch(() => {});
              }
            });
          }
        }
      }
    };
    
    // Check immediately
    checkAndStart();
    
    // Check periodically
    const checkInterval = setInterval(checkAndStart, 100);
    
    // Fallback: if videos don't start within 2 seconds, start whatever is ready
    const fallbackTimeout = setTimeout(() => {
      if (!videosStartedRef.current[takeKey]) {
        videoElements = getVideoElements();
        const allVideos = Array.from(videoElements);
        const videosWithSrc = allVideos.filter(v => v.src && v.src.trim() !== '');
        const readyVideos = videosWithSrc.filter(v => v.readyState >= 1);
        
        if (readyVideos.length > 0) {
          readyVideos.forEach(video => {
            video.currentTime = 0;
            video.play().catch(() => {});
          });
          videosStartedRef.current[takeKey] = true;
          setVideosStarted(true);
        }
      }
    }, 2000);
    
    // Sync periodically to prevent drift
    const syncInterval = setInterval(() => {
      if (!videosStartedRef.current[takeKey]) return;
      
      videoElements = getVideoElements();
      const allVideos = Array.from(videoElements);
      const readyVideos = allVideos.filter(v => v.readyState >= 2 && v.src);
      if (readyVideos.length === 0) return;
      
      const referenceVideo = readyVideos[0];
      const referenceTime = referenceVideo.currentTime;
      
      readyVideos.forEach((video, index) => {
        if (index > 0) {
          if (Math.abs(video.currentTime - referenceTime) > 0.1) {
            video.currentTime = referenceTime;
          }
        }
        if (video.paused) {
          video.play().catch(() => {});
        }
      });
    }, 100);
    
    return () => {
      clearInterval(checkInterval);
      clearInterval(syncInterval);
      clearTimeout(fallbackTimeout);
    };
  }, [currentTake, allTakeUrls]);


  // Create padded array for mapping (16 slots total)
  const paddedSlots = Array(totalSlots).fill(null).map((_, idx) => idx);

  // Initialize synchronized playback on mount
  useEffect(() => {
    console.log('🎬 Starting synchronized playback');
    setCurrentTake(1);
    setVideosStarted(false); // Reset when starting
    
    // Cycle through takes every 4 seconds
    // With preloaded videos, switching should be near-instant (no rebuffering)
    const interval = setInterval(() => {
      setCurrentTake(prevTake => {
        const nextTake = prevTake === 3 ? 1 : prevTake + 1;
        console.log(`🎬 Switching to take ${nextTake}`);
        setVideosStarted(false); // Reset for each new take
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
    // Check if all takes are loaded (for grid readiness)
    const totalVideos = allTakeUrls.reduce((count, slotTakes) => {
      if (!slotTakes) return count;
      return count + (slotTakes.take1 ? 1 : 0) + (slotTakes.take2 ? 1 : 0) + (slotTakes.take3 ? 1 : 0);
    }, 0);

    if (totalVideos === 0) {
      setGridReady(true);
      return;
    }

    // Wait for videos to be loaded in the DOM
    const videoElements = document.querySelectorAll('video[data-take]');
    
    if (videoElements.length === 0) {
      // Videos not in DOM yet, wait a bit
      const checkInterval = setInterval(() => {
        const videos = document.querySelectorAll('video[data-take]');
        if (videos.length > 0) {
          clearInterval(checkInterval);
          setGridReady(true);
        }
      }, 100);
      
      return () => clearInterval(checkInterval);
    }

    // Videos are in DOM, mark as ready (they'll load progressively)
    setGridReady(true);
  }, [allTakeUrls]);

  const handleSlotClick = async (index) => {
    // If viewing a grid that's not the active grid, don't allow contributions
    if (currentGridNumber !== activeGridNumber) {
      console.log(`📋 Viewing grid ${currentGridNumber}, but active grid is ${activeGridNumber}. Can only contribute to active grid.`);
      return;
    }
    
    // If user has already contributed, they can only interact with their own grid
    // If they haven't contributed, ensure we have an active grid that isn't full
    if (userContributedGridNumber === null) {
      // User hasn't contributed yet - ensure we have an active grid (will auto-create if current is full)
      const gridNum = await ensureActiveGrid();
      
      // If ensureActiveGrid created a new grid (different from what we're currently viewing), reload to show it
      if (gridNum !== currentGridNumber) {
        console.log(`📦 Switched to grid ${gridNum}, reloading to show new grid`);
        window.location.reload();
        return;
      }
    }
    
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
            <div className="flex items-center gap-4">
              <h1 className="text-4xl font-bold">Boogie Square</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadGridByNumber(Math.max(1, currentGridNumber - 1))}
                  disabled={currentGridNumber <= 1}
                  className="px-2 py-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ←
                </button>
                <div className="text-lg text-gray-400 font-semibold">
                  Grid #{currentGridNumber || 1}
                  {userContributedGridNumber && userContributedGridNumber === currentGridNumber && (
                    <span className="ml-2 text-sm text-green-400">(Your Grid)</span>
                  )}
                  {currentGridNumber === activeGridNumber && (
                    <span className="ml-2 text-sm text-blue-400">(Active)</span>
                  )}
                </div>
                <button
                  onClick={() => loadGridByNumber(currentGridNumber + 1)}
                  disabled={currentGridNumber >= activeGridNumber}
                  className="px-2 py-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  →
                </button>
              </div>
            </div>
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
        {paddedSlots.map((_, idx) => {
          const hasUserContribution = userContributions.has(idx);
          // Check if there are any takes recorded for this slot (not just current take)
          const hasAnyRecording = videoTakes[idx] && (videoTakes[idx].take1 || videoTakes[idx].take2 || videoTakes[idx].take3);
          
          return (
            <div
              key={idx}
              onClick={() => handleSlotClick(idx)}
              className={`relative flex items-center justify-center bg-black border border-gray-300 ${getSlotStyle(idx)}`}
            >
              {hasAnyRecording ? (
                <>
                  {/* Render all three takes as separate video elements, preloaded and ready */}
                  {/* This eliminates rebuffering delay when switching takes */}
                  {allTakeUrls[idx] && (
                    <>
                      {allTakeUrls[idx].take1 && (
                        <video
                          key={`${idx}-take1`}
                          data-take="1"
                          data-slot={idx}
                          src={allTakeUrls[idx].take1}
                          autoPlay={false}
                          muted
                          loop
                          playsInline
                          preload="auto"
                          className="absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-100"
                          style={{ 
                            opacity: currentTake === 1 && (videosStarted || videosStartedRef.current[`take1`]) ? 1 : 0,
                            pointerEvents: currentTake === 1 ? 'auto' : 'none'
                          }}
                        />
                      )}
                      {allTakeUrls[idx].take2 && (
                        <video
                          key={`${idx}-take2`}
                          data-take="2"
                          data-slot={idx}
                          src={allTakeUrls[idx].take2}
                          autoPlay={false}
                          muted
                          loop
                          playsInline
                          preload="auto"
                          className="absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-100"
                          style={{ 
                            opacity: currentTake === 2 && (videosStarted || videosStartedRef.current[`take2`]) ? 1 : 0,
                            pointerEvents: currentTake === 2 ? 'auto' : 'none'
                          }}
                        />
                      )}
                      {allTakeUrls[idx].take3 && (
                        <video
                          key={`${idx}-take3`}
                          data-take="3"
                          data-slot={idx}
                          src={allTakeUrls[idx].take3}
                          autoPlay={false}
                          muted
                          loop
                          playsInline
                          preload="auto"
                          className="absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-100"
                          style={{ 
                            opacity: currentTake === 3 && (videosStarted || videosStartedRef.current[`take3`]) ? 1 : 0,
                            pointerEvents: currentTake === 3 ? 'auto' : 'none'
                          }}
                        />
                      )}
                    </>
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



      {/* Audio Player */}
      <audio ref={audioRef} autoPlay loop className="hidden">
        <source src={`/music/${selectedSong}`} type="audio/mp3" />
      </audio>
    </div>
  );
}