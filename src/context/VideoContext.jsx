import React, { createContext, useState, useEffect, useContext } from "react";
import { uploadData, getUrl } from "aws-amplify/storage";
import { getCurrentUser } from "@aws-amplify/auth";

export const VideoContext = createContext();

export function VideoProvider({ children }) {
  const [videos, setVideos] = useState(Array(16).fill(null));
  const [videoTakes, setVideoTakes] = useState(Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null })));
  const [currentGridId, setCurrentGridId] = useState('shared-grid-1');
  const [activeGridNumber, setActiveGridNumber] = useState(1); // Track which grid number is currently active for new contributions
  const [currentGridNumber, setCurrentGridNumber] = useState(1); // Track which grid number the user is currently viewing
  const [userContributedGridNumber, setUserContributedGridNumber] = useState(null); // Track which grid this user has contributed to
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
        console.log('No authenticated user, using anonymous mode');
        // Create anonymous user for backward compatibility
        const anonymousUser = {
          userId: `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          username: `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          email: `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
        setUser(anonymousUser);
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
      console.log('No authenticated user, using anonymous mode for upload');
      // Return the current user (which might be anonymous)
      return user;
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
        // Get current active grid number
        const gridNum = await getActiveGridNumber();
        const gridKey = getGridKey(gridNum, 'grid');
        const contribsKey = getGridKey(gridNum, 'contributions');
        
        const currentVideos = await getSharedData(gridKey);
        const currentContribs = await getSharedData(contribsKey);
        
        const safeVideos = Array.isArray(currentVideos) ? currentVideos : Array(16).fill(null);
        // Ensure 16 slots
        while (safeVideos.length < 16) safeVideos.push(null);
        
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
        
        // Update active grid number if it changed
        if (gridNum !== activeGridNumber) {
          setActiveGridNumber(gridNum);
          setCurrentGridId(`shared-grid-${gridNum}`);
          // Reload grid data if we switched grids
          await initializeGrid();
        }
      } catch (error) {
        console.error('Error during periodic sync:', error);
      }
    }, 3000);

    return () => clearInterval(syncInterval);
  }, [user, videos, userContributions]);

  // Shared grid storage keys - using grid-specific keys
  const getGridKey = (gridNum, type) => {
    // type: 'grid', 'takes', or 'contributions'
    return `shared-boogie-${type}-${gridNum}`;
  };
  
  // Active grid tracker key
  const ACTIVE_GRID_KEY = 'shared-boogie-active-grid-number';
  
  // User grid mapping key - stores which grid each user has contributed to
  const USER_GRID_MAPPING_KEY = 'shared-boogie-user-grid-mapping';
  
  // Legacy keys for backward compatibility (grid-1)
  const SHARED_GRID_KEY = 'shared-boogie-grid';
  const SHARED_VIDEO_TAKES_KEY = 'shared-boogie-video-takes';
  const SHARED_CONTRIBUTIONS_KEY = 'shared-boogie-contributions';

  // AWS Amplify-based shared storage (works across all users)
  const getSharedData = async (key) => {
    try {
      // Use AWS Amplify Storage for cross-user sharing
      const s3Key = `shared-data/${key}.json`;
      console.log('🔍 Getting shared data from S3:', s3Key, 'for user:', userEmail);
      
      try {
        // Use getUrl to get a pre-signed URL, then fetch the data
        const { url } = await getUrl({ 
          key: s3Key,
          options: { level: 'public' }
        });
        console.log('🔗 Got S3 URL:', url.toString());
        
        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text();
        const parsed = JSON.parse(text);
        console.log('✅ Retrieved shared data from S3:', key, 'data:', parsed);
        return parsed;
      } catch (s3Error) {
        console.log('📭 No shared data found in S3, using defaults:', s3Error.message);
        console.log('📭 S3 Error details:', s3Error);
        // Return default empty data
        const emptyData = key.includes('grid') ? Array(16).fill(null) : 
                         key.includes('takes') ? Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null })) : [];
        return emptyData;
      }
    } catch (error) {
      console.error('Error getting shared data:', error);
      // Fallback to localStorage
      let data = localStorage.getItem(key);
      if (!data) {
        const emptyData = key.includes('grid') ? Array(16).fill(null) : 
                         key.includes('takes') ? Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null })) : [];
        localStorage.setItem(key, JSON.stringify(emptyData));
        return emptyData;
      }
      return JSON.parse(data);
    }
  };

  const setSharedData = async (key, data) => {
    try {
      // Use AWS Amplify Storage for cross-user sharing
      const s3Key = `shared-data/${key}.json`;
      console.log('💾 Saving shared data to S3:', s3Key, 'data:', data, 'for user:', userEmail);
      
      try {
        await uploadData({
          key: s3Key,
          data: JSON.stringify(data),
          options: {
            contentType: 'application/json',
            level: 'public' // Make it public so all users can access it
          }
        });
        console.log('✅ Shared data saved to S3 successfully:', key);
        
        // Also save to localStorage for offline access
        localStorage.setItem(key, JSON.stringify(data));
        window.dispatchEvent(new CustomEvent('shared-grid-update', { detail: { key, data } }));
        
      } catch (s3Error) {
        console.error('❌ Failed to save to S3, using localStorage:', s3Error);
        console.error('❌ S3 Error details:', s3Error);
        // Fallback to localStorage
        localStorage.setItem(key, JSON.stringify(data));
        window.dispatchEvent(new CustomEvent('shared-grid-update', { detail: { key, data } }));
      }
      
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
      
      // Check if user has already contributed to a grid
      const userGridNum = await getUserContributedGridNumber();
      let gridNum;
      
      if (userGridNum !== null) {
        // User has contributed - load their grid
        console.log(`👤 User has contributed to grid ${userGridNum}, loading that grid`);
        gridNum = userGridNum;
        setUserContributedGridNumber(userGridNum);
      } else {
        // User hasn't contributed yet - get an active grid (will auto-create if current is full)
        console.log('👤 User has not contributed yet, getting active grid');
        gridNum = await ensureActiveGrid();
        setActiveGridNumber(gridNum);
      }
      
      setCurrentGridNumber(gridNum);
      setCurrentGridId(`shared-grid-${gridNum}`);
      
      // Load shared videos, video takes, and contributions from the active grid
      const gridKey = getGridKey(gridNum, 'grid');
      const takesKey = getGridKey(gridNum, 'takes');
      const contribsKey = getGridKey(gridNum, 'contributions');
      
      // Try to load from new grid-specific keys, fall back to legacy keys for backward compatibility
      let sharedVideos = await getSharedData(gridKey);
      let sharedVideoTakes = await getSharedData(takesKey);
      let sharedContributions = await getSharedData(contribsKey);
      
      // If new keys don't have data, try legacy keys (for backward compatibility)
      if ((!Array.isArray(sharedVideos) || sharedVideos.filter(v => v !== null).length === 0) && gridNum === 1) {
        console.log('📦 Loading from legacy keys for backward compatibility');
        sharedVideos = await getSharedData(SHARED_GRID_KEY);
        sharedVideoTakes = await getSharedData(SHARED_VIDEO_TAKES_KEY);
        sharedContributions = await getSharedData(SHARED_CONTRIBUTIONS_KEY);
        
        // Migrate legacy data to grid-1 keys
        if (Array.isArray(sharedVideos) && sharedVideos.filter(v => v !== null).length > 0) {
          await setSharedData(gridKey, sharedVideos);
          await setSharedData(takesKey, sharedVideoTakes);
          await setSharedData(contribsKey, sharedContributions);
        }
      }

      // Ensure 16 slots for videos
      if (!Array.isArray(sharedVideos)) {
        sharedVideos = Array(16).fill(null);
      }
      while (sharedVideos.length < 16) {
        sharedVideos.push(null);
      }
      setVideos(sharedVideos);

      // Ensure 16 slots for video takes
      if (!Array.isArray(sharedVideoTakes)) {
        sharedVideoTakes = Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null }));
      }
      const takesData = Array.isArray(sharedVideoTakes) ? sharedVideoTakes : [];
      while (takesData.length < 16) {
        takesData.push({ take1: null, take2: null, take3: null });
      }
      setVideoTakes(takesData);

      // Calculate user's contributions from shared data using email as persistent identifier
      const userContribs = new Set();
      if (Array.isArray(sharedContributions)) {
        sharedContributions.forEach(contrib => {
          if (contrib.userEmail === userEmail) {
            userContribs.add(contrib.position);
          }
        });
      }
      setUserContributions(userContribs);

      console.log(`Grid ${gridNum} initialized from shared storage`);
      console.log('🎭 User Identity:', { 
        userId: user.userId, 
        email: userEmail, 
        transientId: user.userId.substring(0, 8) + '...' 
      });
      console.log('📊 Shared videos count:', sharedVideos.filter(v => v !== null).length);
      console.log('🎯 User contributions:', Array.from(userContribs));
      console.log('📋 All contributions:', Array.isArray(sharedContributions) ? sharedContributions.map(c => ({ 
        position: c.position, 
        email: c.userEmail, 
        isThisUser: c.userEmail === userEmail 
      })) : []);
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
      // Check if user has already contributed to a grid
      let gridNum;
      const userGridNum = await getUserContributedGridNumber();
      
      if (userGridNum !== null) {
        // User has already contributed - use their grid
        gridNum = userGridNum;
        console.log(`👤 User has contributed to grid ${gridNum}, using that grid`);
      } else {
        // User hasn't contributed yet - ensure we have an active grid that isn't full
        gridNum = await ensureActiveGrid();
        setActiveGridNumber(gridNum);
      }
      
      setCurrentGridNumber(gridNum);
      setCurrentGridId(`shared-grid-${gridNum}`);
      
      // Reload grid data if we switched to a different grid
      if (gridNum !== currentGridNumber) {
        const gridKey = getGridKey(gridNum, 'grid');
        const takesKey = getGridKey(gridNum, 'takes');
        const contribsKey = getGridKey(gridNum, 'contributions');
        
        const gridVideos = await getSharedData(gridKey);
        const gridTakes = await getSharedData(takesKey);
        const gridContribs = await getSharedData(contribsKey);
        
        // Ensure 16 slots
        let updatedVideos = Array.isArray(gridVideos) ? [...gridVideos] : Array(16).fill(null);
        while (updatedVideos.length < 16) updatedVideos.push(null);
        
        let updatedTakes = Array.isArray(gridTakes) ? [...gridTakes] : Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null }));
        while (updatedTakes.length < 16) updatedTakes.push({ take1: null, take2: null, take3: null });
        
        setVideos(updatedVideos);
        setVideoTakes(updatedTakes);
        
        // Update user contributions for this grid
        const userContribs = new Set();
        if (Array.isArray(gridContribs)) {
          gridContribs.forEach(contrib => {
            if (contrib.userEmail === userEmail) {
              userContribs.add(contrib.position);
            }
          });
        }
        setUserContributions(userContribs);
      }
      
      console.log('🎬 VideoContext: updateVideoAtIndex called with index:', index, 'currentGridId:', currentGridId, 'gridNum:', gridNum);
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

      // Save to grid-specific shared storage
      const gridKey = getGridKey(gridNum, 'grid');
      console.log('💾 VideoContext: Saving to shared storage...');
      await setSharedData(gridKey, updatedVideos);
      console.log('✅ VideoContext: Saved to shared storage');

      // Track user's contribution (replace existing record for this user)
      const updatedContributions = new Set(userContributions);
      updatedContributions.add(index);
      setUserContributions(updatedContributions);
      console.log('👤 VideoContext: Updated user contributions:', Array.from(updatedContributions));

      const contribsKey = getGridKey(gridNum, 'contributions');
      const allContributionsRaw = await getSharedData(contribsKey);
      const allContributions = Array.isArray(allContributionsRaw) ? allContributionsRaw : [];
      const filtered = allContributions.filter(c => c.userEmail !== userEmail);
      filtered.push({
        position: index,
        userId: user.userId,
        userEmail: userEmail,
        username: user.username || user.email,
        timestamp: new Date().toISOString(),
      });
      await setSharedData(contribsKey, filtered);
      console.log('✅ VideoContext: Updated contributions in shared storage');
      
      // Store which grid this user contributed to (if not already set)
      await setUserContributedGridNumberInStorage(gridNum);

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
      // Check if user has already contributed to a grid
      let gridNum;
      const userGridNum = await getUserContributedGridNumber();
      
      if (userGridNum !== null) {
        // User has already contributed - use their grid
        gridNum = userGridNum;
        console.log(`👤 User has contributed to grid ${gridNum}, using that grid for takes`);
      } else {
        // User hasn't contributed yet - ensure we have an active grid that isn't full
        gridNum = await ensureActiveGrid();
        setActiveGridNumber(gridNum);
      }
      
      setCurrentGridNumber(gridNum);
      setCurrentGridId(`shared-grid-${gridNum}`);
      
      console.log('updateVideoTakesAtIndex called with index:', index, 'takes:', { take1: !!take1, take2: !!take2, take3: !!take3 }, 'gridNum:', gridNum);

      // Upload only take1 (take2 and take3 are no longer used)
      const uploadedTakes = { take1: null, take2: null, take3: null };
      
      if (take1) {
        uploadedTakes.take1 = await uploadVideoToS3(index, take1);
      }
      
      // Note: take2 and take3 are kept as null for backward compatibility with data structure,
      // but we no longer upload or use them

      // Update video takes state
      const updatedTakes = [...videoTakes];
      updatedTakes[index] = uploadedTakes;
      setVideoTakes(updatedTakes);

      // Save to grid-specific shared storage
      const takesKey = getGridKey(gridNum, 'takes');
      await setSharedData(takesKey, updatedTakes);

      // Store which grid this user contributed to (if not already set)
      await setUserContributedGridNumberInStorage(gridNum);

      // Also update the main video with take1 (for backward compatibility)
      if (take1) {
        await updateVideoAtIndex(index, take1);
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
      console.log(`✅ Grid ${activeGridNumber} completed with 16 videos!`);
      
      // Build recipients from shared contributions
      const gridContribsKey = getGridKey(activeGridNumber, 'contributions');
      const sharedContribs = await getSharedData(gridContribsKey);
      const emails = Array.isArray(sharedContribs)
        ? [...new Set(sharedContribs.map(c => c.userEmail).filter(Boolean))]
        : [];

      console.log(`🎉 Grid ${activeGridNumber} completed! Contributors:`, emails.length);
      console.log('📦 Grid preserved - users can still view it');

      // Don't reset - keep the completed grid visible
      // The next user will automatically create a new grid when they try to contribute
    } catch (error) {
      console.error('Error handling grid completion:', error);
    }
  };

  // Get or create the active grid number
  const getActiveGridNumber = async () => {
    try {
      const stored = await getSharedData(ACTIVE_GRID_KEY);
      if (typeof stored === 'number' && stored > 0) {
        return stored;
      }
      // Default to grid 1 if not set
      await setSharedData(ACTIVE_GRID_KEY, 1);
      return 1;
    } catch (error) {
      console.error('Error getting active grid number:', error);
      return 1;
    }
  };

  // Check if a specific grid is full
  const isGridFull = async (gridNum) => {
    try {
      const takesKey = getGridKey(gridNum, 'takes');
      const gridTakes = await getSharedData(takesKey);
      
      if (!Array.isArray(gridTakes)) return false;
      
      // A slot is considered filled if it has at least one take (take1, take2, or take3)
      const filledSlots = gridTakes.filter(takes => {
        return takes && (takes.take1 || takes.take2 || takes.take3);
      });
      
      const isFull = filledSlots.length >= 16;
      console.log(`🔍 Checking if grid ${gridNum} is full: ${filledSlots.length}/16 slots filled`);
      return isFull;
    } catch (error) {
      console.error('Error checking if grid is full:', error);
      return false;
    }
  };

  // Ensure we have an active grid that isn't full, creating a new one if needed
  const ensureActiveGrid = async () => {
    try {
      let currentActive = await getActiveGridNumber();
      
      // Keep checking grids until we find one that's not full
      while (true) {
        const isFull = await isGridFull(currentActive);
        
        if (!isFull) {
          // Found a grid that's not full - use it
          console.log(`✅ Grid ${currentActive} is available (not full)`);
          break;
        }
        
        // Current grid is full - create next grid
        currentActive += 1;
        console.log(`📦 Grid ${currentActive - 1} is full, creating grid ${currentActive}`);
        
        // Initialize new grid with empty data
        await setSharedData(getGridKey(currentActive, 'grid'), Array(16).fill(null));
        await setSharedData(getGridKey(currentActive, 'takes'), Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null })));
        await setSharedData(getGridKey(currentActive, 'contributions'), []);
        
        // Update active grid number
        await setSharedData(ACTIVE_GRID_KEY, currentActive);
        setActiveGridNumber(currentActive);
        setCurrentGridId(`shared-grid-${currentActive}`);
      }
      
      return currentActive;
    } catch (error) {
      console.error('Error ensuring active grid:', error);
      return activeGridNumber;
    }
  };

  // Get which grid a user has contributed to
  const getUserContributedGridNumber = async () => {
    try {
      if (!userEmail) return null;
      
      const userGridMapping = await getSharedData(USER_GRID_MAPPING_KEY);
      if (!Array.isArray(userGridMapping)) return null;
      
      const userEntry = userGridMapping.find(entry => entry.userEmail === userEmail);
      if (userEntry && typeof userEntry.gridNumber === 'number') {
        return userEntry.gridNumber;
      }
      return null;
    } catch (error) {
      console.error('Error getting user contributed grid number:', error);
      return null;
    }
  };

  // Set which grid a user has contributed to
  const setUserContributedGridNumberInStorage = async (gridNum) => {
    try {
      if (!userEmail) return;
      
      const userGridMapping = await getSharedData(USER_GRID_MAPPING_KEY);
      const mapping = Array.isArray(userGridMapping) ? [...userGridMapping] : [];
      
      // Remove existing entry for this user
      const filtered = mapping.filter(entry => entry.userEmail !== userEmail);
      
      // Add new entry
      filtered.push({
        userEmail: userEmail,
        userId: user.userId,
        gridNumber: gridNum,
        timestamp: new Date().toISOString()
      });
      
      await setSharedData(USER_GRID_MAPPING_KEY, filtered);
      setUserContributedGridNumber(gridNum); // Update state
      console.log(`✅ Set user contributed grid number to ${gridNum}`);
    } catch (error) {
      console.error('Error setting user contributed grid number:', error);
    }
  };

  // Add a function to get S3 video URL
  const getS3VideoUrl = async (value) => {
    try {
      console.log('🔗 getS3VideoUrl called with:', value, 'type:', typeof value);
      
      if (!value) {
        console.log('❌ getS3VideoUrl: No value provided');
        return null;
      }
      
      // Direct URLs (dev local server or already public URLs)
      if (typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('http://') || value.startsWith('https://'))) {
        if (isProd && value.includes('localhost')) {
          console.log('❌ getS3VideoUrl: Localhost URL in production');
          return null;
        }
        const bust = `t=${Date.now()}`;
        const result = value + (value.includes('?') ? `&${bust}` : `?${bust}`);
        console.log('✅ getS3VideoUrl: Direct URL result:', result);
        return result;
      }
      
      // Prod: value is an S3 key → pre-signed URL
      console.log('🔗 getS3VideoUrl: Getting pre-signed URL for S3 key:', value);
      const { url } = await getUrl({ 
        key: value,
        options: { level: 'private' }
      });
      const result = url.toString();
      console.log('✅ getS3VideoUrl: S3 URL result:', result);
      return result;
    } catch (error) {
      console.error('❌ getS3VideoUrl: Error getting video URL:', error);
      console.error('❌ getS3VideoUrl: Error details:', { value, error: error.message });
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

  // Helper function to force sync from shared storage (for debugging)
  const forceSyncFromShared = async () => {
    try {
      console.log('🔄 Force syncing from shared storage...');
      const sharedVideos = await getSharedData(SHARED_GRID_KEY);
      const sharedVideoTakes = await getSharedData(SHARED_VIDEO_TAKES_KEY);
      const sharedContributions = await getSharedData(SHARED_CONTRIBUTIONS_KEY);
      
      console.log('🔄 Synced videos:', sharedVideos);
      console.log('🔄 Synced video takes:', sharedVideoTakes);
      console.log('🔄 Synced contributions:', sharedContributions);
      
      setVideos(sharedVideos);
      setVideoTakes(sharedVideoTakes);
      
      // Update user contributions
      const userContribs = new Set();
      sharedContributions.forEach(contrib => {
        if (contrib.userEmail === userEmail) {
          userContribs.add(contrib.position);
        }
      });
      setUserContributions(userContribs);
      
      console.log('✅ Force sync completed');
    } catch (error) {
      console.error('❌ Force sync failed:', error);
    }
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

  // Load a specific grid by number (for browsing)
  const loadGridByNumber = async (gridNum) => {
    try {
      setIsLoading(true);
      console.log(`📂 Loading grid ${gridNum} for viewing`);
      
      const gridKey = getGridKey(gridNum, 'grid');
      const takesKey = getGridKey(gridNum, 'takes');
      const contribsKey = getGridKey(gridNum, 'contributions');
      
      // Load grid data
      let sharedVideos = await getSharedData(gridKey);
      let sharedVideoTakes = await getSharedData(takesKey);
      let sharedContributions = await getSharedData(contribsKey);
      
      // If new keys don't have data, try legacy keys (for backward compatibility)
      if ((!Array.isArray(sharedVideos) || sharedVideos.filter(v => v !== null).length === 0) && gridNum === 1) {
        console.log('📦 Loading from legacy keys for backward compatibility');
        sharedVideos = await getSharedData(SHARED_GRID_KEY);
        sharedVideoTakes = await getSharedData(SHARED_VIDEO_TAKES_KEY);
        sharedContributions = await getSharedData(SHARED_CONTRIBUTIONS_KEY);
      }

      // Ensure 16 slots for videos
      if (!Array.isArray(sharedVideos)) {
        sharedVideos = Array(16).fill(null);
      }
      while (sharedVideos.length < 16) {
        sharedVideos.push(null);
      }
      setVideos(sharedVideos);

      // Ensure 16 slots for video takes
      if (!Array.isArray(sharedVideoTakes)) {
        sharedVideoTakes = Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null }));
      }
      const takesData = Array.isArray(sharedVideoTakes) ? sharedVideoTakes : [];
      while (takesData.length < 16) {
        takesData.push({ take1: null, take2: null, take3: null });
      }
      setVideoTakes(takesData);

      // Calculate user's contributions from shared data
      const userContribs = new Set();
      if (Array.isArray(sharedContributions)) {
        sharedContributions.forEach(contrib => {
          if (contrib.userEmail === userEmail) {
            userContribs.add(contrib.position);
          }
        });
      }
      setUserContributions(userContribs);
      
      // Update state
      setCurrentGridNumber(gridNum);
      setCurrentGridId(`shared-grid-${gridNum}`);
      
      console.log(`✅ Grid ${gridNum} loaded successfully`);
    } catch (error) {
      console.error('Error loading grid by number:', error);
      setError(`Failed to load grid ${gridNum}`);
    } finally {
      setIsLoading(false);
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
      activeGridNumber,
      currentGridNumber,
      userContributedGridNumber,
      user,
      error,
      canContributeToPosition,
      userContributions,
      clearSharedGrid,
      forceSyncFromShared,
      syncUserAcrossContexts,
      isGridFull,
      ensureActiveGrid,
      getUserContributedGridNumber,
      loadGridByNumber
    }}>
      {children}
    </VideoContext.Provider>
  );
}
