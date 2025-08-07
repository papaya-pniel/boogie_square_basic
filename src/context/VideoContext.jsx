import React, { createContext, useState, useEffect, useContext } from "react";
import { uploadData, downloadData, remove } from "aws-amplify/storage";
import { getCurrentUser } from "@aws-amplify/auth";

export const VideoContext = createContext();

export function VideoProvider({ children }) {
  const [videos, setVideos] = useState(Array(16).fill(null));
  const [currentGridId, setCurrentGridId] = useState('local-grid-1');
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

  const initializeGrid = async () => {
    try {
      console.log('Initializing grid for user:', user.userId);
      
      // Load from localStorage for now
      const savedVideos = localStorage.getItem('boogie-square-videos');
      const savedContributions = localStorage.getItem('boogie-square-contributions');
      
      if (savedVideos) {
        const savedVideoArray = JSON.parse(savedVideos);
        // Ensure we have 16 slots
        while (savedVideoArray.length < 16) {
          savedVideoArray.push(null);
        }
        setVideos(savedVideoArray);
      }
      
      if (savedContributions) {
        const contributions = JSON.parse(savedContributions);
        // Only show user's own contributions
        const userContribs = new Set();
        contributions.forEach(pos => {
          if (pos.userId === user.userId) {
            userContribs.add(pos.position);
          }
        });
        setUserContributions(userContribs);
      }
      
      console.log('Grid initialized from localStorage');
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
      
      // Update local state
      const updatedVideos = [...videos];
      updatedVideos[index] = s3Key;
      setVideos(updatedVideos);
      
      // Save to localStorage
      localStorage.setItem('boogie-square-videos', JSON.stringify(updatedVideos));
      
      const updatedContributions = new Set(userContributions);
      updatedContributions.add(index);
      setUserContributions(updatedContributions);
      
      // Save contributions to localStorage
      const allContributions = JSON.parse(localStorage.getItem('boogie-square-contributions') || '[]');
      allContributions.push({ position: index, userId: user.userId });
      localStorage.setItem('boogie-square-contributions', JSON.stringify(allContributions));
      
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
      console.log('Grid completed! Creating new grid...');
      
      // Reset for new grid
      setVideos(Array(16).fill(null));
      setUserContributions(new Set());
      localStorage.setItem('boogie-square-videos', JSON.stringify(Array(16).fill(null)));
      localStorage.setItem('boogie-square-contributions', JSON.stringify([]));
      
      // Update grid ID
      const newGridId = `local-grid-${Date.now()}`;
      setCurrentGridId(newGridId);
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
      userContributions
    }}>
      {children}
    </VideoContext.Provider>
  );
}
