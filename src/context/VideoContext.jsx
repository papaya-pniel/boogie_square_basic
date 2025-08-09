import React, { createContext, useState, useEffect, useContext } from "react";
import { uploadData, getUrl } from "aws-amplify/storage";
import { getCurrentUser } from "@aws-amplify/auth";

export const VideoContext = createContext();

export function VideoProvider({ children }) {
  const [videos, setVideos] = useState(Array(16).fill(null));
  const [currentGridId, setCurrentGridId] = useState('shared-grid-1');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [userContributions, setUserContributions] = useState(new Set()); // Track which positions user has filled

  // Single userEmail reference for the component
  const userEmail = user?.username || user?.email || null;
  const isProd = typeof window !== 'undefined' && !window.location.origin.includes('localhost');

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
        // Recalculate user contributions using email as persistent identifier
        if (user) {
          const userEmail = user.username || user.email;
          const userContribs = new Set();
          data.forEach(contrib => {
            if (contrib.userEmail === userEmail || contrib.userId === user.userId) {
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

  // Periodic sync to catch updates from other browser contexts (like incognito)
  useEffect(() => {
    if (!user) return;

    const syncInterval = setInterval(async () => {
      try {
        const currentVideos = await getSharedData(SHARED_GRID_KEY);
        const currentContribs = await getSharedData(SHARED_CONTRIBUTIONS_KEY);
        
        // Check if videos have changed
        const videosChanged = JSON.stringify(currentVideos) !== JSON.stringify(videos);
        if (videosChanged) {
          console.log('Detected external video changes, syncing...');
          setVideos([...currentVideos]);
        }
        
        // Update user contributions using email as persistent identifier
        const userContribs = new Set();
        const safeContribs = Array.isArray(currentContribs) ? currentContribs : [];
        safeContribs.forEach(contrib => {
          if (contrib.userEmail === userEmail || contrib.userId === user?.userId) {
            userContribs.add(contrib.position);
          }
        });
        
        // Check if contributions changed
        const contribsChanged = userContribs.size !== userContributions.size || 
          ![...userContribs].every(pos => userContributions.has(pos));
        if (contribsChanged) {
          console.log('Detected contribution changes, updating...');
          setUserContributions(userContribs);
        }
      } catch (error) {
        console.error('Error during periodic sync:', error);
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(syncInterval);
  }, [user, videos, userContributions]);

  // Shared grid storage keys - using more universal storage
  const SHARED_GRID_KEY = 'shared-boogie-grid';
  const SHARED_CONTRIBUTIONS_KEY = 'shared-boogie-contributions';
  
  // Create a universal grid identifier that works across all browser contexts
  const UNIVERSAL_GRID_ID = 'universal-boogie-grid-v1';

  // Server-based shared storage (works across all browser contexts)
  const getSharedData = async (key) => {
    try {
      // Try to get from server first
      const response = await fetch('http://localhost:3001/api/shared-grid');
      if (response.ok) {
        const serverData = await response.json();
        if (key === SHARED_GRID_KEY) {
          return serverData.videos || Array(16).fill(null);
        } else if (key === SHARED_CONTRIBUTIONS_KEY) {
          return serverData.contributions || [];
        }
      }
      
      // Fallback to localStorage
      let data = localStorage.getItem(key);
      if (!data) {
        const emptyData = key.includes('grid') ? Array(16).fill(null) : [];
        localStorage.setItem(key, JSON.stringify(emptyData));
        return emptyData;
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('Error getting shared data:', error);
      // Fallback to localStorage
      let data = localStorage.getItem(key);
      if (!data) {
        const emptyData = key.includes('grid') ? Array(16).fill(null) : [];
        localStorage.setItem(key, JSON.stringify(emptyData));
        return emptyData;
      }
      return JSON.parse(data);
    }
  };

  const setSharedData = async (key, data) => {
    try {
      // Save to localStorage as backup
      localStorage.setItem(key, JSON.stringify(data));
      
      // Update server
      const currentVideos = key === SHARED_GRID_KEY ? data : getSharedData(SHARED_GRID_KEY);
      const currentContribs = key === SHARED_CONTRIBUTIONS_KEY ? data : getSharedData(SHARED_CONTRIBUTIONS_KEY);
      
      const response = await fetch('http://localhost:3001/api/shared-grid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videos: key === SHARED_GRID_KEY ? data : currentVideos,
          contributions: key === SHARED_CONTRIBUTIONS_KEY ? data : currentContribs
        })
      });
      
      if (response.ok) {
        console.log('📊 Server data updated:', key, data);
      } else {
        console.warn('⚠️ Server update failed, using localStorage only');
      }
      
      // Trigger event for same-browser tabs to sync
      window.dispatchEvent(new CustomEvent('shared-grid-update', { detail: { key, data } }));
      
    } catch (error) {
      console.error('Error setting shared data:', error);
      // Fallback to localStorage only
      localStorage.setItem(key, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('shared-grid-update', { detail: { key, data } }));
    }
  };

  const initializeGrid = async () => {
    try {
      console.log('Initializing shared grid for user:', user.userId);
      
      // Set a storage context identifier for debugging
      localStorage.setItem('storage-context', `${userEmail}-${Date.now()}`);
      localStorage.setItem('current-user-email', userEmail);
      
      // Load shared videos and contributions
      const sharedVideos = await getSharedData(SHARED_GRID_KEY);
      const sharedContributions = await getSharedData(SHARED_CONTRIBUTIONS_KEY);

      // Ensure 16 slots
      while (sharedVideos.length < 16) {
        sharedVideos.push(null);
      }
      setVideos(sharedVideos);

      // Calculate user's contributions from shared data using email as persistent identifier
      const userContribs = new Set();
      sharedContributions.forEach(contrib => {
        if (contrib.userEmail === userEmail) {
          userContribs.add(contrib.position);
        }
      });
      setUserContributions(userContribs);

      console.log('Grid initialized from shared storage');
      console.log('🎭 User Identity:', { 
        userId: user.userId, 
        email: userEmail, 
        transientId: user.userId.substring(0, 8) + '...' 
      });
      console.log('📊 Shared videos count:', sharedVideos.filter(v => v !== null).length);
      console.log('🎯 User contributions:', Array.from(userContribs));
      console.log('📋 All contributions:', sharedContributions.map(c => ({ 
        position: c.position, 
        email: c.userEmail, 
        isThisUser: c.userEmail === userEmail 
      })));
    } catch (error) {
      console.error('Error initializing grid:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const uploadVideoToS3 = async (index, videoUrl) => {
    try {
      if (!currentGridId) throw new Error('Grid not initialized. Please refresh the page.');
      const authenticatedUser = await ensureAuthenticated();

      if (!isProd) {
        // DEV: upload to local server
        const blobResponse = await fetch(videoUrl);
        const arrayBuffer = await blobResponse.arrayBuffer();
        const uploadRes = await fetch('http://localhost:3001/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'video/webm' },
          body: new Uint8Array(arrayBuffer)
        });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const { url } = await uploadRes.json();
        return url; // sharable local URL
      }

      // PROD: upload to S3 via Amplify Storage v6
      const blobRes = await fetch(videoUrl);
      const blob = await blobRes.blob();
      const key = `videos/${currentGridId}_${index}_${authenticatedUser.userId}_${Date.now()}.webm`;
      await uploadData({ key, data: blob, options: { contentType: 'video/webm' } });
      return key; // store S3 key in prod
    } catch (error) {
      console.error('Error processing video:', error);
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
      await setSharedData(SHARED_GRID_KEY, updatedVideos);
      
      const updatedContributions = new Set(userContributions);
      updatedContributions.add(index);
      setUserContributions(updatedContributions);
      
      // Save contributions to shared storage using email as persistent identifier
      const allContributions = await getSharedData(SHARED_CONTRIBUTIONS_KEY);
      allContributions.push({ 
        position: index, 
        userId: user.userId, // Keep for backward compatibility
        userEmail: userEmail, // Primary identifier for persistence
        username: user.username || user.email,
        timestamp: new Date().toISOString()
      });
      await setSharedData(SHARED_CONTRIBUTIONS_KEY, allContributions);
      
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
        contributions: await getSharedData(SHARED_CONTRIBUTIONS_KEY),
        completedAt: new Date().toISOString()
      };
      
      // Save completed grid to history
      const gridHistory = JSON.parse(localStorage.getItem('completed-grids') || '[]');
      gridHistory.push(completedGrid);
      localStorage.setItem('completed-grids', JSON.stringify(gridHistory));
      
      // Reset shared storage for new grid
      await setSharedData(SHARED_GRID_KEY, Array(16).fill(null));
      await setSharedData(SHARED_CONTRIBUTIONS_KEY, []);
      
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
  const getS3VideoUrl = async (value) => {
    try {
      if (!value) return null;
      // Direct URLs (dev local server or already public URLs)
      if (typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('http://') || value.startsWith('https://'))) {
        // In prod, ignore localhost URLs (sanitize stale entries)
        if (isProd && value.includes('localhost')) return null;
        return value;
      }
      // Prod: value is an S3 key → pre-signed URL
      const { url } = await getUrl({ key: value });
      return url.toString();
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
  const clearSharedGrid = async () => {
    await setSharedData(SHARED_GRID_KEY, Array(16).fill(null));
    await setSharedData(SHARED_CONTRIBUTIONS_KEY, []);
    setVideos(Array(16).fill(null));
    setUserContributions(new Set());
    console.log('Shared grid cleared');
  };

  // Helper function to sync user data across browser contexts
  const syncUserAcrossContexts = async (targetUserEmail) => {
    try {
      const allContributionsRaw = await getSharedData(SHARED_CONTRIBUTIONS_KEY);
      const allContributions = Array.isArray(allContributionsRaw) ? allContributionsRaw : [];
      const userContribs = new Set();
      allContributions.forEach(contrib => {
        if (contrib.userEmail === targetUserEmail) {
          userContribs.add(contrib.position);
        }
      });
      setUserContributions(userContribs);
      console.log(`🔄 Synced user data for ${targetUserEmail}:`, Array.from(userContribs));
      return userContribs;
    } catch (error) {
      console.error('Error syncing user across contexts:', error);
      return new Set();
    }
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
      clearSharedGrid,
      syncUserAcrossContexts
    }}>
      {children}
    </VideoContext.Provider>
  );
}
