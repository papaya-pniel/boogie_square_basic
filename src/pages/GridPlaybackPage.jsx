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
  
  useEffect(() => {
    loadVideoUrls();
  }, [currentTake, videos, videoTakes]);

  // Auto-play when take changes and we're in looping mode
  useEffect(() => {
    if (isLooping && !isLoading) {
      const timer = setTimeout(() => {
        playAllVideos();
      }, 500); // Small delay to ensure videos are loaded
      return () => clearTimeout(timer);
    }
  }, [currentTake, isLooping, isLoading]);
  
  const loadVideoUrls = async () => {
    setIsLoading(true);
    try {
      // Load video URLs for all 16 slots
      const urls = [];
      for (let i = 0; i < 16; i++) {
        const takes = getTakesForSlot(i);
        const takeKey = `take${currentTake}`;
        const videoData = takes[takeKey];
        
        if (videoData) {
          try {
            const url = await getS3VideoUrl(videoData);
            urls.push(url);
          } catch (error) {
            console.error(`Error loading video for slot ${i}:`, error);
            urls.push(null);
          }
        } else {
          urls.push(null);
        }
      }
      setVideoUrls(urls);
    } catch (error) {
      console.error('Error loading video URLs:', error);
    } finally {
      setIsLoading(false);
    }
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
  
  const switchTake = (takeNumber) => {
    setCurrentTake(takeNumber);
    stopAllVideos();
  };

  const startLooping = () => {
    setIsLooping(true);
    setIsPlaying(true);
    playAllVideos();
  };

  const stopLooping = () => {
    setIsLooping(false);
    setIsPlaying(false);
    stopAllVideos();
  };
  
  const handleVideoEnded = (index) => {
    // Check if all videos have ended
    const allEnded = videoRefs.current.every((video, i) => {
      if (!video || !videoUrls[i]) return true;
      return video.ended;
    });
    
    if (allEnded) {
      if (isLooping) {
        // Auto-advance to next take
        const nextTake = currentTake === 3 ? 1 : currentTake + 1;
        setCurrentTake(nextTake);
        // Videos will auto-play when take changes
      } else {
        setIsPlaying(false);
      }
    }
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
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">🎬 Synchronized Grid Playback</h1>
          <p className="text-gray-300 mb-6">
            Watch all your takes play together in perfect synchronization!
          </p>
          
          {/* Take Selection */}
          <div className="flex justify-center gap-4 mb-6">
            <Button
              onClick={() => switchTake(1)}
              disabled={isLooping}
              className={`px-6 py-3 ${currentTake === 1 ? 'bg-blue-600' : 'bg-gray-600'} ${isLooping ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Take 1
            </Button>
            <Button
              onClick={() => switchTake(2)}
              disabled={isLooping}
              className={`px-6 py-3 ${currentTake === 2 ? 'bg-blue-600' : 'bg-gray-600'} ${isLooping ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Take 2
            </Button>
            <Button
              onClick={() => switchTake(3)}
              disabled={isLooping}
              className={`px-6 py-3 ${currentTake === 3 ? 'bg-blue-600' : 'bg-gray-600'} ${isLooping ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Take 3
            </Button>
          </div>
          
          {/* Playback Controls */}
          <div className="flex justify-center gap-4 mb-8">
            <Button
              onClick={playAllVideos}
              disabled={isPlaying || isLooping}
              className="bg-green-600 hover:bg-green-700 px-6 py-3"
            >
              ▶️ Play All
            </Button>
            <Button
              onClick={pauseAllVideos}
              disabled={!isPlaying}
              className="bg-yellow-600 hover:bg-yellow-700 px-6 py-3"
            >
              ⏸️ Pause All
            </Button>
            <Button
              onClick={stopAllVideos}
              className="bg-red-600 hover:bg-red-700 px-6 py-3"
            >
              ⏹️ Stop All
            </Button>
          </div>

          {/* Looping Controls */}
          <div className="flex justify-center gap-4 mb-8">
            <Button
              onClick={startLooping}
              disabled={isLooping}
              className="bg-purple-600 hover:bg-purple-700 px-6 py-3"
            >
              🔄 Start Auto-Loop (Take 1→2→3→1...)
            </Button>
            <Button
              onClick={stopLooping}
              disabled={!isLooping}
              className="bg-orange-600 hover:bg-orange-700 px-6 py-3"
            >
              ⏹️ Stop Auto-Loop
            </Button>
          </div>
        </div>
        
        {/* Grid */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 shadow-xl rounded-lg p-4 mb-8">
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(4, 1fr)`,
              gridTemplateRows: `repeat(4, 1fr)`,
              width: "min(80vw, 80vh)",
              height: "min(80vw, 80vh)",
              margin: "0 auto"
            }}
          >
            {videoUrls.map((url, index) => (
              <div key={index} className="relative bg-gray-800 rounded-lg overflow-hidden">
                <div className="absolute top-1 left-1 z-10 bg-black bg-opacity-75 px-1 py-0.5 rounded text-xs">
                  {index + 1}
                </div>
                {url ? (
                  <video
                    ref={(el) => (videoRefs.current[index] = el)}
                    src={url}
                    className="w-full h-full object-cover"
                    onEnded={() => handleVideoEnded(index)}
                    muted
                    playsInline
                  />
                ) : (
                  <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">Empty</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Status */}
        <div className="text-center">
          <p className="text-gray-300 mb-4">
            Currently playing: <span className="font-bold">Take {currentTake}</span>
            {isPlaying && <span className="ml-2 text-green-400">● Playing</span>}
            {isLooping && <span className="ml-2 text-purple-400">🔄 Auto-Looping</span>}
          </p>
          {isLooping && (
            <p className="text-sm text-gray-400 mb-4">
              Auto-cycling through all takes: Take 1 → Take 2 → Take 3 → Take 1...
            </p>
          )}
          
          <div className="flex justify-center gap-4">
            <Button
              onClick={() => navigate('/')}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3"
            >
              ← Back to Main Grid
            </Button>
            <Button
              onClick={() => navigate(`/record/${index}`)}
              className="bg-purple-600 hover:bg-purple-700 px-6 py-3"
            >
              🔄 Record New Takes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}