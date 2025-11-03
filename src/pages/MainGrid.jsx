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

  // Track which takes have been started (using ref to avoid re-renders)
  const videosStartedRef = useRef({});

  // Synchronize all videos of the current take across all squares
  // Ensures all squares show the same take at the exact same playback position
  // Also ensures all videos start playing simultaneously on first load
  useEffect(() => {
    const takeKey = `take${currentTake}`;
    
    // Use a more reliable selector - wait a bit for DOM to update
    const getVideoElements = () => {
      return document.querySelectorAll(`video[src*="${takeKey}"]`);
    };
    
    let videoElements = getVideoElements();
    
    // If no videos found, wait a bit and try again
    if (videoElements.length === 0) {
      console.log(`⚠️ No video elements found for ${takeKey}, waiting...`);
      const retryTimeout = setTimeout(() => {
        videoElements = getVideoElements();
        if (videoElements.length === 0) {
          console.log(`⚠️ Still no video elements found for ${takeKey}`);
          return;
        }
        console.log(`✅ Found ${videoElements.length} video elements after retry`);
      }, 100);
      return () => clearTimeout(retryTimeout);
    }
    
    console.log(`🎬 Found ${videoElements.length} video elements for ${takeKey}`);
    
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
        console.log(`📭 No videos with src found for ${takeKey}`);
        return;
      }
      
      // Use readyState >= 2 (HAVE_CURRENT_DATA) - more lenient for faster loading
      const readyVideos = videosWithSrc.filter(v => v.readyState >= 2);
      
      // Debug: log first few videos
      if (!hasStartedForTake && readyVideos.length < videosWithSrc.length) {
        console.log(`📊 Videos with src: ${videosWithSrc.length}, Ready videos: ${readyVideos.length}/${videosWithSrc.length}`);
        videosWithSrc.forEach((v, idx) => {
          if (v.readyState < 2) {
            console.log(`⏳ Video ${idx} not ready: readyState=${v.readyState}, src="${v.src?.substring(0, 50)}..."`);
          }
        });
      }
      
      // Wait for ALL videos (that have a src) to be ready before starting (for seamless load)
      // Only start if we have videos and ALL of them are ready
      if (videosWithSrc.length > 0 && readyVideos.length === videosWithSrc.length) {
        // First time starting - reset all to beginning and start simultaneously
        if (!hasStartedForTake) {
          console.log(`🔄 Resetting and starting ${readyVideos.length} videos simultaneously`);
          
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
                  return Promise.resolve(); // Continue even if one fails
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
                console.log(`✅ All ${readyVideos.length} videos started for ${takeKey}`);
                videosStartedRef.current[takeKey] = true;
                setVideosStarted(true); // Update state for UI re-render
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
                video.play().catch(() => {
                  // Ignore autoplay errors
                });
              }
            });
          }
        }
      }
    };
    
    // Check immediately
    checkAndStart();
    
    // Also listen for video loaded events
    const handleVideoLoaded = () => {
      checkAndStart();
    };
    window.addEventListener('videoloaded', handleVideoLoaded);
    
    // Check more frequently for faster initial load (every 25ms)
    const checkInterval = setInterval(checkAndStart, 25);
    
    // Fallback: if videos don't start within 2 seconds, start whatever is ready
    const fallbackTimeout = setTimeout(() => {
      if (!videosStartedRef.current[takeKey]) {
        console.log(`⏰ Fallback: Starting videos after timeout for ${takeKey}`);
        videoElements = getVideoElements();
        const allVideos = Array.from(videoElements);
        const videosWithSrc = allVideos.filter(v => v.src && v.src.trim() !== '');
        const readyVideos = videosWithSrc.filter(v => v.readyState >= 1); // Lower threshold for fallback
        
        if (readyVideos.length > 0) {
          console.log(`🔄 Fallback: Starting ${readyVideos.length} ready videos (${videosWithSrc.length - readyVideos.length} still loading)`);
          readyVideos.forEach(video => {
            video.currentTime = 0;
            video.play().catch(() => {});
          });
          videosStartedRef.current[takeKey] = true;
          setVideosStarted(true);
        } else {
          console.log(`⚠️ Fallback: No ready videos found for ${takeKey}`);
        }
      }
    }, 2000); // Reduced to 2 seconds
    
    // Sync periodically to prevent drift (every 100ms)
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
          video.play().catch(() => {
            // Ignore autoplay errors
          });
        }
      });
    }, 100);
    
    return () => {
      clearInterval(checkInterval);
      clearInterval(syncInterval);
      clearTimeout(fallbackTimeout);
      window.removeEventListener('videoloaded', handleVideoLoaded);
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
    // Since we now have multiple video elements per slot, we check allTakeUrls instead
    const totalVideos = allTakeUrls.reduce((count, slotTakes) => {
      if (!slotTakes) return count;
      return count + (slotTakes.take1 ? 1 : 0) + (slotTakes.take2 ? 1 : 0) + (slotTakes.take3 ? 1 : 0);
    }, 0);

    if (totalVideos === 0) {
      setGridReady(true);
      return;
    }

    // Wait for videos to be loaded in the DOM
    // The videos are already being rendered, so we just need to check if they're ready
    let loaded = 0;
    const videoElements = document.querySelectorAll('video[src*="take"]');
    
    if (videoElements.length === 0) {
      // Videos not in DOM yet, wait a bit
      const checkInterval = setInterval(() => {
        const videos = document.querySelectorAll('video[src*="take"]');
        if (videos.length > 0) {
          clearInterval(checkInterval);
          // Videos are being loaded by the browser, mark as ready
          setGridReady(true);
        }
      }, 100);
      
      return () => clearInterval(checkInterval);
    }

    // Videos are in DOM, check their ready state
    const checkReadiness = () => {
      const readyVideos = Array.from(videoElements).filter(v => v.readyState >= 2).length;
      if (readyVideos >= videoElements.length) {
        setGridReady(true);
      }
    };

    // Check immediately
    checkReadiness();
    
    // Also check periodically
    const checkInterval = setInterval(checkReadiness, 100);
    
    return () => clearInterval(checkInterval);
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
          
          // Debug logging
          if (hasAnyRecording) {
            console.log(`🎥 Slot ${idx}: hasAnyRecording=${hasAnyRecording}, currentTake=${currentTake}`);
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
                  {/* Render all three takes as separate video elements, preloaded and ready */}
                  {/* This eliminates rebuffering delay when switching takes */}
                  {allTakeUrls[idx] && (
                    <>
                      {allTakeUrls[idx].take1 && (
                        <video
                          key={`${idx}-take1`}
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
                          onLoadedData={(e) => {
                            console.log(`📹 Video loaded: slot ${idx} take1, readyState=${e.target.readyState}`);
                            // Trigger check when video loads
                            const event = new Event('videoloaded');
                            window.dispatchEvent(event);
                          }}
                        />
                      )}
                      {allTakeUrls[idx].take2 && (
                        <video
                          key={`${idx}-take2`}
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
                          onLoadedData={(e) => {
                            console.log(`📹 Video loaded: slot ${idx} take2, readyState=${e.target.readyState}`);
                            // Trigger check when video loads
                            const event = new Event('videoloaded');
                            window.dispatchEvent(event);
                          }}
                        />
                      )}
                      {allTakeUrls[idx].take3 && (
                        <video
                          key={`${idx}-take3`}
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
                          onLoadedData={(e) => {
                            console.log(`📹 Video loaded: slot ${idx} take3, readyState=${e.target.readyState}`);
                            // Trigger check when video loads
                            const event = new Event('videoloaded');
                            window.dispatchEvent(event);
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