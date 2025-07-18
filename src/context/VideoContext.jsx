import React, { createContext, useState, useEffect, useContext } from "react";
import { uploadData, downloadData, remove } from "aws-amplify/storage";
import { GraphQLAPI, graphqlOperation } from "@aws-amplify/api-graphql";
import { Auth } from "aws-amplify/auth";

const Storage = {
  async put(filename, blob, options) {
    return await uploadData(filename, blob, options);
  },
  async get(s3Key, options) {
    return await downloadData(s3Key, options);
  }
};

import * as queries from '../graphql/queries';
import * as mutations from '../graphql/mutations';

export const VideoContext = createContext();

export function VideoProvider({ children }) {
  const [videos, setVideos] = useState(Array(4).fill(null));
  const [currentGridId, setCurrentGridId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  // Get current user on mount
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const currentUser = await Auth.currentAuthenticatedUser();
        setUser(currentUser);
      } catch (error) {
        console.error('Error getting current user:', error);
        setError('Failed to get user authentication');
      }
    };
    getCurrentUser();
  }, []);

  // Initialize grid when user is authenticated
  useEffect(() => {
    if (user) {
      initializeGrid();
    }
  }, [user]);

  const initializeGrid = async () => {
    try {
      // Get the most recent active grid
      const grids = await GraphQLAPI.graphql(graphqlOperation(queries.listGrids, {
        filter: {
          isActive: { eq: true }
        },
        sort: {
          field: "createdAt",
          direction: "desc"
        }
      }));

      if (grids.data.listGrids.items.length > 0) {
        const grid = grids.data.listGrids.items[0];
        setCurrentGridId(grid.id);
        setVideos(grid.videos);
      } else {
        // Create a new grid if none exists
        await createNewGrid();
      }
    } catch (error) {
      console.error('Error initializing grid:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewGrid = async () => {
    try {
      const response = await GraphQLAPI.graphql(graphqlOperation(mutations.createGrid, {
        input: {
          videos: Array(4).fill(null),
          isActive: true
        }
      }));
      const newGrid = response.data.createGrid;
      setCurrentGridId(newGrid.id);
      setVideos(newGrid.videos);
    } catch (error) {
      console.error('Error creating new grid:', error);
    }
  };

  const uploadVideoToS3 = async (index, videoUrl) => {
    try {
      // Create a unique filename for the video
      const timestamp = new Date().toISOString();
      const filename = `videos/${currentGridId}_${index}_${timestamp}.webm`;
      
      // Get the Blob from the URL
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      
      // Upload to S3
      await Storage.put(filename, blob, {
        contentType: 'video/webm',
        level: 'private'
      });
      
      // Return the S3 URL
      return filename;
    } catch (error) {
      console.error('Error uploading video:', error);
      throw error;
    }
  };

  const updateVideoAtIndex = async (index, videoUrl) => {
    try {
      // Upload video to S3 first
      const s3Key = await uploadVideoToS3(index, videoUrl);
      
      const updatedVideos = [...videos];
      updatedVideos[index] = s3Key;
      
      await GraphQLAPI.graphql(graphqlOperation(mutations.updateGrid, {
        input: {
          id: currentGridId,
          videos: updatedVideos
        }
      }));
      
      setVideos(updatedVideos);
      
      // Check if grid is complete
      if (updatedVideos.every(v => v !== null)) {
        await handleGridCompletion();
      }
    } catch (error) {
      console.error('Error updating video:', error);
    }
  };

  const handleGridCompletion = async () => {
    try {
      // Mark current grid as inactive and save it as completed
      const completedGrid = await GraphQLAPI.graphql(graphqlOperation(mutations.updateGrid, {
        input: {
          id: currentGridId,
          isActive: false,
          completedAt: new Date().toISOString(),
          status: 'COMPLETED'
        }
      }));

      // Create a new empty grid
      const newGrid = await createNewGrid();
      
      // Update local state
      setCurrentGridId(newGrid.id);
      setVideos(newGrid.videos);

      // Save grid completion in UserGrid model
      await GraphQLAPI.graphql(graphqlOperation(mutations.createUserGrid, {
        input: {
          userId: user.id,
          gridId: currentGridId,
          completedAt: new Date().toISOString()
        }
      }));
    } catch (error) {
      console.error('Error handling grid completion:', error);
    }
  };

  // Add a function to get all completed grids
  const getCompletedGrids = async () => {
    try {
      const grids = await GraphQLAPI.graphql(graphqlOperation(queries.listGrids, {
        filter: {
          status: { eq: 'COMPLETED' }
        },
        sort: {
          field: "completedAt",
          direction: "desc"
        }
      }));
      return grids.data.listGrids.items;
    } catch (error) {
      console.error('Error getting completed grids:', error);
      return [];
    }
  };

  // Add a function to get grid history for a user
  const getUserGridHistory = async (userId) => {
    try {
      const grids = await GraphQLAPI.graphql(graphqlOperation(queries.listGrids, {
        filter: {
          status: { eq: 'COMPLETED' },
          users: {
            contains: userId
          }
        },
        sort: {
          field: "completedAt",
          direction: "desc"
        }
      }));
      return grids.data.listGrids.items;
    } catch (error) {
      console.error('Error getting user grid history:', error);
      return [];
    }
  };

  // Add a function to get S3 video URL
  const getS3VideoUrl = async (s3Key) => {
    try {
      return await Storage.get(s3Key, { level: 'private' });
    } catch (error) {
      console.error('Error getting S3 video URL:', error);
      return null;
    }
  };

  return (
    <VideoContext.Provider value={{ videos, updateVideoAtIndex, isLoading }}>
      {children}
    </VideoContext.Provider>
  );
}
