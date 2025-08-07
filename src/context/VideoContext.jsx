import React, { createContext, useState, useEffect, useContext } from "react";
import { uploadData, downloadData, remove } from "aws-amplify/storage";
import { getCurrentUser } from "@aws-amplify/auth";

export const VideoContext = createContext();

export function VideoProvider({ children }) {
  const [videos, setVideos] = useState(Array(16).fill(null));
  const [currentGridId, setCurrentGridId] = useState('shared-grid-1');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [userContributions, setUserContributions] = useState(new Set()); // Track which positions user has filled

  // Get current user on mount
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        console.log('Current user loaded:', currentUser);
        setUser(currentUser);
      } catch (error) {
        console.error('Error getting current user:', error);
        setError('Failed to get user authentication');
      }
    };
    fetchCurrentUser();
  }, []);

  // Function to ensure user is authenticated
  const ensureAuthenticated = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser || !currentUser.userId) {
        throw new Error('User not properly authenticated');
      }
      console.log('User authentication confirmed:', currentUser.userId);
      return currentUser;
    } catch (error) {
      console.error('Authentication check failed:', error);
      throw new Error('Please sign in again to upload videos');
    }
  };

  // Initialize grid when user is authenticated
  useEffect(() => {
    if (user) {
      initializeGrid();
    }
  }, [user]);

  // Listen for shared grid updates from other tabs/windows
  useEffect(() => {
    const handleSharedGridUpdate = (event) => {
      const { key, data } = event.detail;
      console.log('Received shared grid update:', key, data);
      
      if (key === SHARED_GRID_KEY) {
        setVideos([...data]);
      } else if (key === SHARED_CONTRIBUTIONS_KEY) {
        // Recalculate user contributions
        if (user) {
          const userContribs = new Set();
          data.forEach(contrib => {
            if (contrib.userId === user.userId) {
              userContribs.add(contrib.position);
            }
          });
          setUserContributions(userContribs);
        }
      }
    };

    window.addEventListener('shared-grid-update', handleSharedGridUpdate);
    return () => window.removeEventListener('shared-grid-update', handleSharedGridUpdate);
  }, [user]);

  // Shared grid storage keys
  const SHARED_GRID_KEY = 'shared-boogie-grid';
  const SHARED_CONTRIBUTIONS_KEY = 'shared-boogie-contributions';

  // Shared storage helpers
  const getSharedData = (key) => {
    try {
      let data = localStorage.getItem(key);
      if (!data) {
        const emptyData = key.includes('grid') ? JSON.stringify(Array(16).fill(null)) : JSON.stringify([]);
        localStorage.setItem(key, emptyData);
        return JSON.parse(emptyData);
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('Error getting shared data:', error);
      return key.includes('grid') ? Array(16).fill(null) : [];
    }
  };

  const setSharedData = (key, data) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      // Trigger event for other tabs to sync
      window.dispatchEvent(new CustomEvent('shared-grid-update', { detail: { key, data } }));
    } catch (error) {
      console.error('Error setting shared data:', error);
    }
  };

  const initializeGrid = async () => {
    try {
      console.log('Initializing shared grid for user:', user.userId);
      
      // Load shared videos and contributions
      const sharedVideos = getSharedData(SHARED_GRID_KEY);
      const sharedContributions = getSharedData(SHARED_CONTRIBUTIONS_KEY);

      // Ensure 16 slots
      while (sharedVideos.length < 16) {
        sharedVideos.push(null);
      }
      setVideos(sharedVideos);

      // Calculate user's contributions from shared data
      const userContribs = new Set();
      sharedContributions.forEach(contrib => {
        if (contrib.userId === user.userId) {
          userContribs.add(contrib.position);
        }
      });
      setUserContributions(userContribs);

      console.log('Grid initialized from shared storage');
      console.log('Shared videos count:', sharedVideos.filter(v => v !== null).length);
      console.log('User contributions:', Array.from(userContribs));
    } catch (error) {
      console.error('Error initializing grid:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const uploadVideoToS3 = async (index, videoUrl) => {
    try {
      // Ensure we have a currentGridId
      if (!currentGridId) {
        console.error('No currentGridId available');
        throw new Error('Grid not initialized. Please refresh the page.');
      }

      // Ensure user is properly authenticated
      const authenticatedUser = await ensureAuthenticated();
      console.log('User authenticated for upload:', authenticatedUser.userId);

      // For now, just return the blob URL instead of uploading to S3
      // This bypasses the S3 permissions issue
      console.log('Using blob URL instead of S3 upload for now');
      
      // Create a unique filename for the video (for reference)
      const timestamp = new Date().toISOString();
      const filename = `videos/${currentGridId}_${index}_${authenticatedUser.userId}_${timestamp}.webm`;
      
      console.log('Video stored as blob URL:', videoUrl);
      
      // Return the blob URL instead of S3 key
      return videoUrl;
    } catch (error) {
      console.error('Error processing video:', error);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      throw error;
    }
  };

  const updateVideoAtIndex = async (index, videoUrl) => {
    try {
      console.log('updateVideoAtIndex called with index:', index, 'currentGridId:', currentGridId);
      
      // Check if user has already contributed to the grid
      if (userContributions.size > 0) {
        throw new Error('You can only upload to one square per grid');
      }

      // Check if position is already taken
      if (videos[index] !== null) {
        throw new Error('This position is already filled by another user');
      }

      // Upload video to S3 first
      const s3Key = await uploadVideoToS3(index, videoUrl);
      
      // Update shared state
      const updatedVideos = [...videos];
      updatedVideos[index] = s3Key;
      setVideos(updatedVideos);
      
      // Save to shared storage
      setSharedData(SHARED_GRID_KEY, updatedVideos);
      
      const updatedContributions = new Set(userContributions);
      updatedContributions.add(index);
      setUserContributions(updatedContributions);
      
      // Save contributions to shared storage
      const allContributions = getSharedData(SHARED_CONTRIBUTIONS_KEY);
      allContributions.push({ position: index, userId: user.userId, username: user.username || user.email });
      setSharedData(SHARED_CONTRIBUTIONS_KEY, allContributions);
      
      // Check if grid is complete
      if (updatedVideos.every(v => v !== null)) {
        await handleGridCompletion();
      }
    } catch (error) {
      console.error('Error updating video:', error);
      setError(`Failed to update video: ${error.message}`);
      throw error;
    }
  };

  const handleGridCompletion = async () => {
    try {
      console.log('Grid completed with 16 videos! Creating new grid...');
      
      // Archive the completed grid
      const completedGrid = {
        id: currentGridId,
        videos: [...videos],
        contributions: getSharedData(SHARED_CONTRIBUTIONS_KEY),
        completedAt: new Date().toISOString()
      };
      
      // Save completed grid to history
      const gridHistory = JSON.parse(localStorage.getItem('completed-grids') || '[]');
      gridHistory.push(completedGrid);
      localStorage.setItem('completed-grids', JSON.stringify(gridHistory));
      
      // Reset shared storage for new grid
      setSharedData(SHARED_GRID_KEY, Array(16).fill(null));
      setSharedData(SHARED_CONTRIBUTIONS_KEY, []);
      
      // Reset local state
      setVideos(Array(16).fill(null));
      setUserContributions(new Set());
      
      // Update grid ID
      const newGridId = `shared-grid-${Date.now()}`;
      setCurrentGridId(newGridId);
      
      console.log('New grid created:', newGridId);
    } catch (error) {
      console.error('Error handling grid completion:', error);
    }
  };

  // Add a function to get S3 video URL
  const getS3VideoUrl = async (s3Key) => {
    try {
      // If it's already a blob URL, return it directly
      if (s3Key.startsWith('blob:')) {
        return s3Key;
      }
      
      // Otherwise, try to download from S3 (for future use)
      const result = await downloadData({
        key: s3Key
      });
      return result.body;
    } catch (error) {
      console.error('Error getting video URL:', error);
      return null;
    }
  };

  // Check if user can contribute to a position
  const canContributeToPosition = (index) => {
    // User can only contribute to one square: position must be empty AND user hasn't contributed yet
    return videos[index] === null && userContributions.size === 0;
  };

  // Helper function to clear shared grid (for testing)
  const clearSharedGrid = () => {
    setSharedData(SHARED_GRID_KEY, Array(16).fill(null));
    setSharedData(SHARED_CONTRIBUTIONS_KEY, []);
    setVideos(Array(16).fill(null));
    setUserContributions(new Set());
    console.log('Shared grid cleared');
  };

  return (
    <VideoContext.Provider value={{ 
      videos, 
      updateVideoAtIndex, 
      isLoading, 
      getS3VideoUrl,
      currentGridId,
      user,
      error,
      canContributeToPosition,
      userContributions,
      clearSharedGrid
    }}>
      {children}
    </VideoContext.Provider>
  );
}
