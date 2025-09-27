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
    if (slotTakes && typeof slotTakes === 'object' && (slotTakes.take1 || slotTakes.take2 || slotTakes.take3)) {
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
      console.log('Loading video URLs...');
      console.log('videos array:', videos);
      console.log('videoTakes array:', videoTakes);
      
      // Load video URLs for all 16 slots and all 3 takes
      const take1Urls = [];
      const take2Urls = [];
      const take3Urls = [];
      
      for (let i = 0; i < 16; i++) {
        const takes = getTakesForSlot(i);
        console.log(`Slot ${i} takes:`, takes);
        
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
      
      console.log('Loaded URLs:', { take1: take1Urls, take2: take2Urls, take3: take3Urls });
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
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-8">🎬 Synchronized Grid Playback</h1>
      
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
        {videoUrls.map((url, idx) => (
          <div
            key={idx}
            className="relative flex items-center justify-center bg-black border border-gray-300 overflow-hidden"
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
              <div className="text-6xl text-cyan-400">+</div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-8 mt-8">
        <div className="flex flex-col items-center gap-2">
          <div className="w-4 h-4 bg-green-500"></div>
          <span className="text-white text-sm">SHARE</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-4 h-4 bg-pink-500"></div>
          <span className="text-white text-sm">LOCK</span>
        </div>
      </div>
      
      {/* Back button */}
      <div className="mt-8">
        <Button
          onClick={() => navigate('/')}
          className="bg-purple-600 hover:bg-purple-700 px-6 py-3"
        >
          ← Back to Main Grid
        </Button>
      </div>
    </div>
  );
}