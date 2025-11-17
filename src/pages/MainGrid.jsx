// src/pages/MainGrid.jsx
import React, { useContext, useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

  // Detect mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                   (typeof window !== 'undefined' && window.innerWidth < 768);
  
  const SYNC_INTERVAL_MS = isMobile ? 1000 : 500; // Slower sync on mobile
  const DRIFT_TOLERANCE = 0.25;

  // Synchronized playback state - always playing
  const [isPlaying, setIsPlaying] = useState(true);
  const [videosStarted, setVideosStarted] = useState(false); // Track if videos have been started for the first time
  const [startTimeout, setStartTimeout] = useState(null); // Track timeout for fallback start

  const audioRef = useRef();
  const totalSlots = 16; // Always 16 squares
  const createEmptyTakeRecord = () => ({ take1: null, take2: null, take3: null });
  const createInitialTakeUrls = () => Array.from({ length: totalSlots }, () => createEmptyTakeRecord());
  const [allTakeUrls, setAllTakeUrls] = useState(() => createInitialTakeUrls()); // Store URLs for loaded takes
  const allTakeUrlsRef = useRef(allTakeUrls);
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Track which takes have been started (using ref to avoid re-renders)
  const videosStartedRef = useRef({});
  
  // Check if user just completed recording
  useEffect(() => {
    const justRecorded = searchParams.get('justRecorded');
    if (justRecorded === 'true') {
      setShowCompletionPopup(true);
      // Remove the parameter from URL
      searchParams.delete('justRecorded');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    allTakeUrlsRef.current = allTakeUrls;
  }, [allTakeUrls]);

  const preloadTake = useCallback(
    async () => {
      // Always preload take1
      const takeKey = 'take1';
      await Promise.all(
        videoTakes.map(async (takes, index) => {
          if (!takes || !takes[takeKey]) return;
          if (allTakeUrlsRef.current[index]?.[takeKey]) return;
          try {
            const url = await getS3VideoUrl(takes[takeKey]);
            if (!url) return;
            setAllTakeUrls((prev) => {
              if (prev[index]?.[takeKey] === url) {
                return prev;
              }
              const next = prev.map((slot, idx) =>
                idx === index ? { ...slot, [takeKey]: url } : slot
              );
              return next;
            });
          } catch (error) {
            console.error(`Error preloading take1 for slot ${index}:`, error);
          }
        })
      );
    },
    [videoTakes, getS3VideoUrl]
  );

  // Reset cached URLs when takes data changes
  useEffect(() => {
    const initial = createInitialTakeUrls();
    setAllTakeUrls(initial);
    allTakeUrlsRef.current = initial;
    preloadTake();
  }, [videoTakes, preloadTake]);

  // Preload take1 on mount
  useEffect(() => {
    preloadTake();
  }, [preloadTake]);

  // Load and start ALL takes for all slots at once (so they're always playing and ready)
  // This ensures seamless switching - no reloading needed
  // Also starts and syncs tutorial videos
  useEffect(() => {
    // Always run - tutorials should start even if no user takes exist yet
    const hasLoadedTakes = allTakeUrls.some(
      (slot) => slot && slot.take1
    );
    // Don't return early - tutorials need to start even without user takes
    
    // Get ALL video elements (all three takes for all slots + tutorials)
    const getAllVideoElements = () => {
      return document.querySelectorAll('video[data-take], video[data-tutorial]');
    };
    
    // Start all videos once
    const startAllVideos = () => {
      const allVideoElements = getAllVideoElements();
      const videosWithSrc = Array.from(allVideoElements).filter(v => v.src && v.src.trim() !== '');
      
      if (videosWithSrc.length === 0) return;
      
      // Wait for all videos to be ready
      const readyVideos = videosWithSrc.filter(v => v.readyState >= 2);
      
      if (readyVideos.length === videosWithSrc.length && readyVideos.length > 0) {
        // Reset all to beginning
        readyVideos.forEach(video => {
          video.pause();
          video.currentTime = 0;
        });
        
        // Start all videos simultaneously
        setTimeout(() => {
          Promise.all(
            readyVideos.map(video => {
              return video.play().catch((err) => {
                console.warn('Autoplay failed for video:', err);
                return Promise.resolve();
              });
            })
          ).then(() => {
            // Sync all take1 videos together
            const take1Videos = Array.from(readyVideos).filter(v => 
              v.getAttribute('data-take') === '1'
            );
            if (take1Videos.length > 0) {
              const referenceTime = take1Videos[0].currentTime;
              take1Videos.forEach((video, index) => {
                if (index > 0) {
                  video.currentTime = referenceTime;
                }
              });
            }
            videosStartedRef.current.allStarted = true;
            setVideosStarted(true);
          });
        }, 50);
      }
    };
    
    // Sync all take1 videos together
    const syncTake1 = () => {
      const take1Videos = Array.from(document.querySelectorAll('video[data-take="1"]'))
        .filter(v => v.src && v.src.trim() !== '');
      
      if (take1Videos.length === 0) return;
      
      const referenceVideo = take1Videos[0];
      const referenceTime = referenceVideo.currentTime;
      
      take1Videos.forEach((video, index) => {
        if (index > 0) {
          if (Math.abs(video.currentTime - referenceTime) > DRIFT_TOLERANCE) {
            video.currentTime = referenceTime;
          }
        }
        if (video.paused) {
          video.play().catch(() => {});
        }
      });
    };
    
    // Sync tutorial videos to take1
    const syncTutorials = () => {
      if (isMobile) return; // Tutorials disabled on mobile
      
      const tutorialVideos = Array.from(document.querySelectorAll('video[data-tutorial]'))
        .filter(v => v.src && v.src.trim() !== '');
      
      if (tutorialVideos.length === 0) return;
      
      // Sync tutorials to take1 videos
      const take1Videos = Array.from(document.querySelectorAll('video[data-take="1"]'))
        .filter(v => v.src && v.src.trim() !== '');
      
      if (take1Videos.length > 0) {
        const referenceTime = take1Videos[0].currentTime;
        tutorialVideos.forEach(video => {
          if (Math.abs(video.currentTime - referenceTime) > DRIFT_TOLERANCE) {
            video.currentTime = referenceTime;
          }
          if (video.paused) {
            video.play().catch(() => {});
          }
        });
      }
    };
    
    // Sync all videos
    const syncAllVideos = () => {
      syncTake1();
      syncTutorials();
    };
    
    let allVideoElements = getAllVideoElements();
    
    // If no videos found, wait a bit and try again
    if (allVideoElements.length === 0) {
      const retryTimeout = setTimeout(() => {
        allVideoElements = getAllVideoElements();
        if (allVideoElements.length > 0) {
          startAllVideos();
        }
      }, 100);
      return () => clearTimeout(retryTimeout);
    }
    
    // Check if we've already started all videos
    if (videosStartedRef.current.allStarted) {
      // Sync all videos to keep them in sync
      syncAllVideos();
      return;
    }
    
    // Start all videos
    startAllVideos();
    
    // Check periodically for videos that become ready
    const checkInterval = setInterval(() => {
      if (!videosStartedRef.current.allStarted) {
        startAllVideos();
      } else {
        // Sync all videos periodically so they stay in sync even when hidden
        syncAllVideos();
      }
    }, SYNC_INTERVAL_MS);
    
    // Fallback: start whatever is ready after 2 seconds
    const fallbackTimeout = setTimeout(() => {
      if (!videosStartedRef.current.allStarted) {
        const allVideoElements = getAllVideoElements();
        const videosWithSrc = Array.from(allVideoElements).filter(v => v.src && v.src.trim() !== '');
        const readyVideos = videosWithSrc.filter(v => v.readyState >= 1);
        
        if (readyVideos.length > 0) {
          readyVideos.forEach(video => {
            if (video.paused) {
              video.play().catch(() => {});
            }
          });
          // Sync all videos after starting
          setTimeout(() => {
            syncAllVideos();
          }, SYNC_INTERVAL_MS);
          videosStartedRef.current.allStarted = true;
          setVideosStarted(true);
        }
      }
    }, 2000);
    
    // Sync all videos periodically to prevent drift
    const syncInterval = setInterval(() => {
      if (videosStartedRef.current.allStarted) {
        syncAllVideos();
      }
    }, SYNC_INTERVAL_MS);
    
    return () => {
      clearInterval(checkInterval);
      clearInterval(syncInterval);
      clearTimeout(fallbackTimeout);
    };
  }, [allTakeUrls]);



  // Create padded array for mapping (16 slots total)
  const paddedSlots = Array(totalSlots).fill(null).map((_, idx) => idx);

  // Initialize synchronized playback on mount
  useEffect(() => {
    console.log('🎬 Starting synchronized playback');
    setVideosStarted(false); // Reset when starting
  }, []);


  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.4;
      audioRef.current.load();
      audioRef.current.play().catch((err) => console.warn("Autoplay failed", err));
    }
  }, [selectedSong]);

  useEffect(() => {
    // Check if all videos are loaded (for grid readiness)
    const totalVideos = allTakeUrls.reduce((count, slotTakes) => {
      if (!slotTakes) return count;
      return count + (slotTakes.take1 ? 1 : 0);
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
    // Check if there are any takes recorded for this slot
    const hasAnyRecording = videoTakes[index] && videoTakes[index].take1;
    
    // Don't allow clicking on slots with recordings from other users
    if (hasAnyRecording && !hasUserContribution) return;
    
    if (!canContributeToPosition(index)) return;
    navigate(`/record/${index}`);
  };


  const getSlotStyle = (index) => {
    const hasUserContribution = userContributions.has(index);
    // Check if there are any takes recorded for this slot
    const hasAnyRecording = videoTakes[index] && videoTakes[index].take1;
    
    if (hasUserContribution) {
      return "bg-green-500/20 border-green-400 cursor-pointer hover:bg-green-500/30"; // User's contribution - green background
    } else if (hasAnyRecording) {
      return "bg-red-500/20 border-red-400 cursor-not-allowed"; // Someone else's recording - red background, no interaction
    } else {
      return "cursor-pointer hover:bg-gray-900"; // Available slot - default styling
    }
  };

  // Helper to get tutorial video (always tutorial_1)
  const getTutorialSrc = (index) => {
    const folder = "/tutorial_1/";
    const n = index + 1;
    return folder + encodeURIComponent(`Pattern-1_${n}.mp4`);
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
          // Check if there are any takes recorded for this slot
          const hasAnyRecording = videoTakes[idx] && videoTakes[idx].take1;
          
          return (
            <div
              key={idx}
              onClick={() => handleSlotClick(idx)}
              className={`relative flex items-center justify-center bg-black border border-gray-300 ${getSlotStyle(idx)}`}
            >
              {hasAnyRecording ? (
                <>
                  {/* Always show take1, looped */}
                  {allTakeUrls[idx] && allTakeUrls[idx].take1 && (
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
                      className="absolute inset-0 w-full h-full object-cover z-0"
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
                  {/* Tutorial video - disabled on mobile to save memory */}
                  {!isMobile && (
                    <video
                      key={`tutorial-${idx}`}
                      data-tutorial
                      data-slot={idx}
                      src={getTutorialSrc(idx)}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 transition-opacity duration-200"
                      style={{ opacity: 0.4 }}
                    />
                  )}
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

      {/* Completion Popup Modal */}
      {showCompletionPopup && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-white text-black rounded-lg p-8 max-w-md mx-4 shadow-2xl">
            <h2 className="text-3xl font-bold mb-4 text-center">🎉 Recording Complete!</h2>
            <p className="text-gray-700 mb-6 text-center">
              Thank you for your contribution! Your video has been saved to the grid.
            </p>
            <div className="flex flex-col gap-4">
              <a
                href="https://docs.google.com/forms/d/1HqmP4Zw-wgC_CSIkvhqnuFKqXjSOfaxHNe12_34zrwg/edit?ts=6908e4ed"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg text-center transition-colors"
              >
                Give Us Feedback →
              </a>
              <Button
                onClick={() => setShowCompletionPopup(false)}
                variant="secondary"
                className="w-full"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}