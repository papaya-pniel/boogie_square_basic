import React, { createContext, useState, useEffect, useContext } from "react";
import { uploadData, getUrl } from "aws-amplify/storage";
import { getCurrentUser } from "@aws-amplify/auth";

export const VideoContext = createContext();

export function VideoProvider({ children }) {
  const [videos, setVideos] = useState(Array(16).fill(null));
  const [videoTakes, setVideoTakes] = useState(Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null })));
  const [currentGridId, setCurrentGridId] = useState('shared-grid-1');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [userContributions, setUserContributions] = useState(new Set()); // Track which positions user has filled

  // Single userEmail reference for the component
  const userEmail = user?.username || user?.email || null;
  const isProd = true; // Always use S3, skip localhost server

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
        const safe = Array.isArray(data) ? data : Array(16).fill(null);
        setVideos(safe);
      } else if (key === SHARED_CONTRIBUTIONS_KEY) {
        // Recalculate user contributions using email as persistent identifier
        if (user) {
          const userEmail = user.username || user.email;
          const userContribs = new Set();
          const list = Array.isArray(data) ? data : [];
          list.forEach(contrib => {
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
        
        const safeVideos = Array.isArray(currentVideos) ? currentVideos : Array(16).fill(null);
        // Check if videos have changed
        const videosChanged = JSON.stringify(safeVideos) !== JSON.stringify(videos);
        if (videosChanged) {
          console.log('Detected external video changes, syncing...');
          setVideos(safeVideos);
        }
        
        // Update user contributions
        const userContribs = new Set();
        const list = Array.isArray(currentContribs) ? currentContribs : [];
        list.forEach(contrib => {
          if (contrib.userEmail === userEmail || contrib.userId === user.userId) {
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
    }, 3000);

    return () => clearInterval(syncInterval);
  }, [user, videos, userContributions]);

  // Shared grid storage keys - using more universal storage
  const SHARED_GRID_KEY = 'shared-boogie-grid';
  const SHARED_VIDEO_TAKES_KEY = 'shared-boogie-video-takes';
  const SHARED_CONTRIBUTIONS_KEY = 'shared-boogie-contributions';
  
  // Create a universal grid identifier that works across all browser contexts
  const UNIVERSAL_GRID_ID = 'universal-boogie-grid-v1';

  // Server-based shared storage (works across all browser contexts)
  const getSharedData = async (key) => {
    try {
      // Skip localhost server - use localStorage directly
      let data = localStorage.getItem(key);
      if (!data) {
        const emptyData = key.includes('grid') ? Array(16).fill(null) : [];
        localStorage.setItem(key, JSON.stringify(emptyData));
        return emptyData;
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('Error getting shared data:', error);
      // Fallback to default values
      const emptyData = key.includes('grid') ? Array(16).fill(null) : [];
      return emptyData;
    }
  };

  const setSharedData = async (key, data) => {
    try {
      // Save to localStorage (skip localhost server)
      localStorage.setItem(key, JSON.stringify(data));
      
      // Trigger event for same-browser tabs to sync
      window.dispatchEvent(new CustomEvent('shared-grid-update', { detail: { key, data } }));
      
      console.log('📊 Data saved to localStorage:', key, data);
      
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
      
      // Load shared videos, video takes, and contributions
      const sharedVideos = await getSharedData(SHARED_GRID_KEY);
      const sharedVideoTakes = await getSharedData(SHARED_VIDEO_TAKES_KEY);
      const sharedContributions = await getSharedData(SHARED_CONTRIBUTIONS_KEY);

      // Ensure 16 slots for videos
      while (sharedVideos.length < 16) {
        sharedVideos.push(null);
      }
      setVideos(sharedVideos);

      // Ensure 16 slots for video takes
      const takesData = Array.isArray(sharedVideoTakes) ? sharedVideoTakes : [];
      while (takesData.length < 16) {
        takesData.push({ take1: null, take2: null, take3: null });
      }
      setVideoTakes(takesData);

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
      console.log('uploadVideoToS3 called with:', { index, videoUrl, currentGridId });
      
      if (!currentGridId) throw new Error('Grid not initialized. Please refresh the page.');
      const authenticatedUser = await ensureAuthenticated();
      console.log('Authenticated user:', authenticatedUser.userId);

      // Test Amplify configuration
      try {
        console.log('Testing Amplify configuration...');
        // This will fail if Amplify isn't configured properly
        const testKey = 'test/connection-test.txt';
        await uploadData({ 
          key: testKey, 
          data: new Blob(['test'], { type: 'text/plain' }),
          options: { level: 'private' }
        });
        console.log('Amplify configuration test passed');
      } catch (configError) {
        console.error('Amplify configuration test failed:', configError);
        throw new Error('Amplify not configured properly. Please check amplify_outputs.json');
      }

      // If we already have a hosted URL (e.g., from /api/concat), don't re-upload
      if (typeof videoUrl === 'string' && (videoUrl.startsWith('http://') || videoUrl.startsWith('https://'))) {
        console.log('Video URL is already hosted, returning as-is');
        return videoUrl;
      }

      // Handle blob URLs
      if (typeof videoUrl === 'string' && videoUrl.startsWith('blob:')) {
        console.log('Processing blob URL:', videoUrl);
        const blobRes = await fetch(videoUrl);
        const blob = await blobRes.blob();
        console.log('Blob created:', blob.size, 'bytes');
        
        const key = `videos/${currentGridId}_${index}_${authenticatedUser.userId}_${Date.now()}.webm`;
        console.log('Uploading to S3 with key:', key);
        
        await uploadData({ 
          key, 
          data: blob, 
          options: { 
            contentType: 'video/webm',
            level: 'private'
          } 
        });
        
        console.log('Successfully uploaded to S3:', key);
        return key;
      }

      // Handle direct blob objects
      if (videoUrl instanceof Blob) {
        console.log('Processing blob object:', videoUrl.size, 'bytes');
        const key = `videos/${currentGridId}_${index}_${authenticatedUser.userId}_${Date.now()}.webm`;
        console.log('Uploading blob to S3 with key:', key);
        
        await uploadData({ 
          key, 
          data: videoUrl, 
          options: { 
            contentType: 'video/webm',
            level: 'private'
          } 
        });
        
        console.log('Successfully uploaded blob to S3:', key);
        return key;
      }

      throw new Error('Unsupported video URL type: ' + typeof videoUrl);
      
    } catch (error) {
      console.error('Error processing video:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        videoUrl: videoUrl,
        index: index,
        currentGridId: currentGridId
      });
      
      // Fallback: return the original videoUrl if S3 upload fails
      console.warn('S3 upload failed, using original videoUrl as fallback');
      return videoUrl;
    }
  };

  const updateVideoAtIndex = async (index, videoUrl) => {
    try {
      console.log('🎬 VideoContext: updateVideoAtIndex called with index:', index, 'currentGridId:', currentGridId);
      console.log('🎬 VideoContext: videoUrl type:', typeof videoUrl, videoUrl);

      const ownedIndex = getUserOwnedIndex();
      const isUpdatingOwnSlot = ownedIndex === index || userContributions.has(index);

      // TESTING MODE: Allow multiple squares per user for easy testing
      // Comment out the restrictions below for production use
      
      // Enforce one-square-per-user, but allow re-recording your own slot
      // if (ownedIndex !== null && !isUpdatingOwnSlot) {
      //   throw new Error('You can only upload to one square per grid');
      // }

      // Prevent overwriting someone else's slot
      // if (videos[index] !== null && !isUpdatingOwnSlot) {
      //   throw new Error('This position is already filled by another user');
      // }

      console.log('☁️ VideoContext: Uploading video to S3...');
      // Upload (local server in dev, S3 in prod)
      const storedValue = await uploadVideoToS3(index, videoUrl);
      console.log('✅ VideoContext: Video uploaded, stored value:', storedValue);

      // Cache-bust if it is an http(s) URL
      const mergedSaved = (typeof storedValue === 'string' && (storedValue.startsWith('http://') || storedValue.startsWith('https://')))
        ? storedValue + (storedValue.includes('?') ? `&t=${Date.now()}` : `?t=${Date.now()}`)
        : storedValue;

      console.log('💾 VideoContext: Updating videos array with stored value:', mergedSaved);
      // Update shared state
      const updatedVideos = [...videos];
      updatedVideos[index] = mergedSaved;
      setVideos(updatedVideos);
      console.log('📋 VideoContext: Updated videos array:', updatedVideos);

      // Save to shared storage
      console.log('💾 VideoContext: Saving to shared storage...');
      await setSharedData(SHARED_GRID_KEY, updatedVideos);
      console.log('✅ VideoContext: Saved to shared storage');

      // Track user's contribution (replace existing record for this user)
      const updatedContributions = new Set(userContributions);
      updatedContributions.add(index);
      setUserContributions(updatedContributions);
      console.log('👤 VideoContext: Updated user contributions:', Array.from(updatedContributions));

      const allContributionsRaw = await getSharedData(SHARED_CONTRIBUTIONS_KEY);
      const allContributions = Array.isArray(allContributionsRaw) ? allContributionsRaw : [];
      const filtered = allContributions.filter(c => c.userEmail !== userEmail);
      filtered.push({
        position: index,
        userId: user.userId,
        userEmail: userEmail,
        username: user.username || user.email,
        timestamp: new Date().toISOString(),
      });
      await setSharedData(SHARED_CONTRIBUTIONS_KEY, filtered);
      console.log('✅ VideoContext: Updated contributions in shared storage');

      // Skip localhost server - data is already saved to localStorage
      
      // Check if grid is complete
      if (updatedVideos.every(v => v !== null)) {
        await handleGridCompletion();
      }
      
      console.log('🎉 VideoContext: updateVideoAtIndex completed successfully');
    } catch (error) {
      console.error('❌ VideoContext: Error updating video:', error);
      setError(`Failed to update video: ${error.message}`);
      throw error;
    }
  };

  // Function to update individual takes for a slot
  const updateVideoTakesAtIndex = async (index, take1, take2, take3) => {
    try {
      console.log('updateVideoTakesAtIndex called with index:', index, 'takes:', { take1: !!take1, take2: !!take2, take3: !!take3 });

      // Upload each take
      const uploadedTakes = { take1: null, take2: null, take3: null };
      
      if (take1) {
        uploadedTakes.take1 = await uploadVideoToS3(index, take1);
      }
      if (take2) {
        uploadedTakes.take2 = await uploadVideoToS3(index, take2);
      }
      if (take3) {
        uploadedTakes.take3 = await uploadVideoToS3(index, take3);
      }

      // Update video takes state
      const updatedTakes = [...videoTakes];
      updatedTakes[index] = uploadedTakes;
      setVideoTakes(updatedTakes);

      // Save to shared storage
      await setSharedData(SHARED_VIDEO_TAKES_KEY, updatedTakes);

      // Also update the main video with the merged version (for backward compatibility)
      if (take1 && take2 && take3) {
        // Use the last take as the main video for now
        await updateVideoAtIndex(index, take3);
      }

      console.log('Video takes updated successfully');
    } catch (error) {
      console.error('Error updating video takes:', error);
      setError(`Failed to update video takes: ${error.message}`);
      throw error;
    }
  };

  const handleGridCompletion = async () => {
    try {
      console.log('Grid completed with 16 videos! Creating final mosaic...');

      // Build recipients from shared contributions
      const sharedContribs = await getSharedData(SHARED_CONTRIBUTIONS_KEY);
      const emails = Array.isArray(sharedContribs)
        ? [...new Set(sharedContribs.map(c => c.userEmail).filter(Boolean))]
        : [];

      // Persist current videos
      const safeVideos = Array.isArray(videos) ? videos : Array(16).fill(null);

      // Skip localhost finalize - grid completion handled locally
      console.log('Grid completed locally:', safeVideos);

      // Reset for new grid
      setVideos(Array(16).fill(null));
      setVideoTakes(Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null })));
      setUserContributions(new Set());
      await setSharedData(SHARED_GRID_KEY, Array(16).fill(null));
      await setSharedData(SHARED_VIDEO_TAKES_KEY, Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null })));
      await setSharedData(SHARED_CONTRIBUTIONS_KEY, []);

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
        if (isProd && value.includes('localhost')) return null;
        const bust = `t=${Date.now()}`;
        return value + (value.includes('?') ? `&${bust}` : `?${bust}`);
      }
      // Prod: value is an S3 key → pre-signed URL
      const { url } = await getUrl({ key: value });
      return url.toString();
    } catch (error) {
      console.error('Error getting video URL:', error);
      return null;
    }
  };

  // Find the index already owned by current user by inspecting stored values (S3 key contains userId)
  const getUserOwnedIndex = () => {
    if (!user || !user.userId) return null;
    for (let i = 0; i < videos.length; i += 1) {
      const value = videos[i];
      if (typeof value === 'string' && value.includes(user.userId)) {
        return i;
      }
    }
    return null;
  };

  // Check if user can contribute to a position
  const canContributeToPosition = (index) => {
    // TESTING MODE: Allow user to contribute to any slot for easy testing
    // In production, you'd want to restrict this to one slot per user
    return true; // Allow all slots for testing
    
    // Production code (commented out for testing):
    // const ownedIndex = getUserOwnedIndex();
    // const isOwnSlot = ownedIndex === index || userContributions.has(index);
    // return isOwnSlot || (videos[index] === null && ownedIndex === null);
  };

  // Helper function to clear shared grid (for testing)
  const clearSharedGrid = async () => {
    await setSharedData(SHARED_GRID_KEY, Array(16).fill(null));
    await setSharedData(SHARED_VIDEO_TAKES_KEY, Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null })));
    await setSharedData(SHARED_CONTRIBUTIONS_KEY, []);
    setVideos(Array(16).fill(null));
    setVideoTakes(Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null })));
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
      videoTakes,
      updateVideoAtIndex, 
      updateVideoTakesAtIndex,
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
