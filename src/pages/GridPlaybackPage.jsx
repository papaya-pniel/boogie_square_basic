import React, { useContext, useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { VideoContext } from "../context/VideoContext";
import { Button } from "../components/ui/button";

export default function GridPlaybackPage() {
  const { index } = useParams();
  const { videos, videoTakes, getS3VideoUrl } = useContext(VideoContext);
  const navigate = useNavigate();
  
  const [currentTake, setCurrentTake] = useState(1); // 1, 2, or 3
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [videoElements, setVideoElements] = useState([]);
  const [videoUrls, setVideoUrls] = useState([]);
  const [allTakeUrls, setAllTakeUrls] = useState({ take1: [], take2: [], take3: [] }); // Preload all takes
  const [isLoading, setIsLoading] = useState(true);
  
  const videoRefs = useRef([]);
  const audioRef = useRef(null);
  
  // Get the actual takes for a slot from videoTakes
  const getTakesForSlot = (slotIndex) => {
    const slotTakes = videoTakes[slotIndex];
    if (slotTakes && typeof slotTakes === 'object') {
      return {
        take1: slotTakes.take1,
        take2: slotTakes.take2,
        take3: slotTakes.take3
      };
    }
    // Fallback to main video if no takes data
    const mainVideo = videos[slotIndex];
    return {
      take1: mainVideo,
      take2: mainVideo,
      take3: mainVideo
    };
  };
  
  // Load all takes once when component mounts or data changes
  useEffect(() => {
    loadAllVideoUrls();
  }, [videos, videoTakes]);

  // Switch to current take without reloading
  useEffect(() => {
    switchToTake(currentTake);
  }, [currentTake, allTakeUrls]);

  // Start auto-looping when videos are loaded
  useEffect(() => {
    if (!isLoading && videoUrls.some(url => url !== null)) {
      setIsLooping(true);
      setIsPlaying(true);
      playAllVideos();
    }
  }, [isLoading, videoUrls]);

  // Auto-advance takes every 5 seconds
  useEffect(() => {
    if (isLooping) {
      const interval = setInterval(() => {
        const nextTake = currentTake === 3 ? 1 : currentTake + 1;
        setCurrentTake(nextTake);
      }, 5000); // Switch takes every 5 seconds
      
      return () => clearInterval(interval);
    }
  }, [isLooping, currentTake]);
  
  const loadAllVideoUrls = async () => {
    setIsLoading(true);
    try {
      // Load video URLs for all 16 slots and all 3 takes
      const take1Urls = [];
      const take2Urls = [];
      const take3Urls = [];
      
      for (let i = 0; i < 16; i++) {
        const takes = getTakesForSlot(i);
        
        // Load take 1
        if (takes.take1) {
          try {
            const url = await getS3VideoUrl(takes.take1);
            take1Urls.push(url);
          } catch (error) {
            console.error(`Error loading take 1 for slot ${i}:`, error);
            take1Urls.push(null);
          }
        } else {
          take1Urls.push(null);
        }
        
        // Load take 2
        if (takes.take2) {
          try {
            const url = await getS3VideoUrl(takes.take2);
            take2Urls.push(url);
          } catch (error) {
            console.error(`Error loading take 2 for slot ${i}:`, error);
            take2Urls.push(null);
          }
        } else {
          take2Urls.push(null);
        }
        
        // Load take 3
        if (takes.take3) {
          try {
            const url = await getS3VideoUrl(takes.take3);
            take3Urls.push(url);
          } catch (error) {
            console.error(`Error loading take 3 for slot ${i}:`, error);
            take3Urls.push(null);
          }
        } else {
          take3Urls.push(null);
        }
      }
      
      setAllTakeUrls({ take1: take1Urls, take2: take2Urls, take3: take3Urls });
      
      // Set initial take
      switchToTake(currentTake, { take1: take1Urls, take2: take2Urls, take3: take3Urls });
    } catch (error) {
      console.error('Error loading video URLs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const switchToTake = (takeNumber, urls = allTakeUrls) => {
    const takeKey = `take${takeNumber}`;
    const currentUrls = urls[takeKey] || [];
    setVideoUrls(currentUrls);
  };
  
  const playAllVideos = () => {
    setIsPlaying(true);
    videoRefs.current.forEach((video, index) => {
      if (video && videoUrls[index]) {
        video.currentTime = 0;
        video.play().catch(console.warn);
      }
    });
  };
  
  const pauseAllVideos = () => {
    setIsPlaying(false);
    videoRefs.current.forEach((video) => {
      if (video) {
        video.pause();
      }
    });
  };
  
  const stopAllVideos = () => {
    setIsPlaying(false);
    videoRefs.current.forEach((video) => {
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
    });
  };
  
  
  const handleVideoEnded = (index) => {
    // Videos loop automatically, no need to handle ended events
    // Take switching is handled by the interval timer
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading synchronized grid...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div
      className="relative min-h-screen text-white overflow-hidden"
      style={{ background: "linear-gradient(to top, #4466ff, #66bbff)" }}
    >
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-2 gap-2">
        <h1 className="text-4xl font-bold text-center">🎬 Synchronized Grid Playback</h1>
        <p className="text-gray-200 text-center">Watch all takes play together in perfect synchronization!</p>
        
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
            {videoUrls.map((url, idx) => (
              <div
                key={idx}
                className="relative flex items-center justify-center rounded-none overflow-hidden border-2 border-white/20"
              >
                {url ? (
                  <video
                    ref={(el) => (videoRefs.current[idx] = el)}
                    src={url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                    onEnded={() => handleVideoEnded(idx)}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-700/50 flex items-center justify-center">
                    <span className="text-gray-400 text-sm">Empty</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Back button */}
        <div className="mt-6">
          <Button
            onClick={() => navigate('/')}
            className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-6 py-3"
          >
            ← Back to Main Grid
          </Button>
        </div>
      </div>
    </div>
  );
}