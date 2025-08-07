import React, { useContext, useRef, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { VideoContext } from "../context/VideoContext";
import { Button } from "../components/ui/button";
import { uploadData, downloadData, remove } from "aws-amplify/storage";

export default function RecordPage() {
  const { index } = useParams();
  const idxNum = parseInt(index, 10);
  // If we're in center-focus pattern, map indices 5,6,9,10 → 5
  const slotToUpdate = [5, 6, 9, 10].includes(idxNum) ? 5 : idxNum;

  const { updateVideoAtIndex, getS3VideoUrl, canContributeToPosition } = useContext(VideoContext);
  const navigate = useNavigate();

  const [recording, setRecording] = useState(false);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const videoRef = useRef(null);
  const tutorialRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Check if user can contribute to this position
  useEffect(() => {
    if (!canContributeToPosition(slotToUpdate)) {
      alert('You cannot contribute to this position. It may already be filled or you have already contributed to it.');
      navigate('/');
    }
  }, [canContributeToPosition, slotToUpdate, navigate]);

  // Map grid slot index to tutorial filename
  const tutorialMap = {
    0: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
    1: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
    2: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
    3: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
    4: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
    5: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
    6: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
    7: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
    8: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
    9: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
    10: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
    11: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
    12: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
    13: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
    14: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
    15: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
  };
  const tutorial = tutorialMap[idxNum] || { src: "/boogie_square_tutorial.mp4", title: "Default" };
  const tutorialVideoUrl = tutorial.src;

  useEffect(() => {
    const tryPlay = () => {
      tutorialRef.current?.play().catch((err) => {
        console.warn("Tutorial autoplay failed:", err);
      });
    };
    const timeout = setTimeout(tryPlay, 100);
    return () => clearTimeout(timeout);
  }, []);

  const startRecording = async () => {
    try {
      console.log('Starting recording...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('Got media stream');
      streamRef.current = stream;
      videoRef.current.srcObject = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        try {
          console.log('Recorder stopped');
          setIsUploading(true);
          setUploadError(null);
          
          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          
          // Create a blob URL for preview
          const blobUrl = URL.createObjectURL(blob);
          setRecordedBlobUrl(blobUrl);

          // stop webcam
          stream.getTracks().forEach((t) => t.stop());
          console.log('Recording completed successfully');
        } catch (error) {
          console.error('Error in recorder.onstop:', error);
          setUploadError('Failed to process recording. Please try again.');
        } finally {
          setIsUploading(false);
        }
      };

      recorder.start();
      setRecording(true);
      console.log('Recorder started');

      // Restart tutorial from beginning when recording begins
      if (tutorialRef.current) {
        tutorialRef.current.currentTime = 0;
        tutorialRef.current.play().catch((err) =>
          console.warn("Tutorial restart failed:", err)
        );
      }
    } catch (error) {
      console.error('Error in startRecording:', error);
      throw error;
    }
  };

  const startCountdownThenRecord = () => {
    try {
      console.log('Starting countdown');
      tutorialRef.current?.pause();
      setCountdown(3);
      let current = 3;

      const countdownInterval = setInterval(() => {
        current -= 1;
        if (current === 0) {
          clearInterval(countdownInterval);
          setCountdown(null);
          startRecording();
        } else {
          setCountdown(current);
        }
      }, 1000);
    } catch (error) {
      console.error('Error in startCountdownThenRecord:', error);
      throw error;
    }
  };

  const stopRecording = () => {
    try {
      console.log('Stopping recording');
      mediaRecorderRef.current?.stop();
      setRecording(false);
    } catch (error) {
      console.error('Error in stopRecording:', error);
      throw error;
    }
  };

  const handleSaveVideo = async () => {
    try {
      setIsUploading(true);
      setUploadError(null);
      
      // Get the blob from the blob URL
      const response = await fetch(recordedBlobUrl);
      const blob = await response.blob();
      
      // Update the grid (this will handle S3 upload and database update)
      await updateVideoAtIndex(slotToUpdate, recordedBlobUrl);
      
      // Navigate back to grid
      navigate("/");
    } catch (error) {
      console.error('Error saving video:', error);
      setUploadError('Failed to save video. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReRecord = async () => {
    setRecordedBlobUrl(null);
    setRecording(false);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative">
      <h2 className="text-2xl font-semibold mb-6">
        Record Your Version (Slot #{slotToUpdate})
      </h2>

      {!recordedBlobUrl ? (
        <>
          <div className="relative w-full max-w-xl">
            {/* Webcam preview */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-none bg-black"
            />

            {/* Tutorial overlay */}
            <video
              ref={tutorialRef}
              src={tutorialVideoUrl}
              muted
              autoPlay
              playsInline
              onEnded={() => recording && stopRecording()}
              className="absolute top-4 right-4 w-40 h-28 rounded-none shadow border border-white z-10"
            />

            {/* Countdown overlay */}
            {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center z-50 bg-black bg-opacity-60">
                <div className="text-6xl font-bold animate-pulse">{countdown}</div>
              </div>
            )}
          </div>

          <div className="flex gap-4 mt-4">
            <Button
              onClick={startCountdownThenRecord}
              disabled={recording || countdown !== null}
            >
              Start Recording
            </Button>
            <Button onClick={stopRecording} disabled={!recording}>
              Stop Recording
            </Button>
          </div>
        </>
      ) : (
        <>
          {isUploading && (
            <div className="text-center mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-gray-300">Saving your video...</p>
            </div>
          )}
          
          {uploadError && (
            <div className="text-center mb-4">
              <p className="text-red-400 mb-4">{uploadError}</p>
              <Button onClick={handleReRecord} className="mt-2">
                Try Again
              </Button>
            </div>
          )}
          
          {recordedBlobUrl && !isUploading && (
            <>
              <video
                src={recordedBlobUrl}
                controls
                className="w-full max-w-xl rounded-none"
              />

              <div className="flex gap-4 mt-4">
                <Button
                  onClick={handleSaveVideo}
                  disabled={isUploading}
                >
                  Save & Return to Grid
                </Button>
                <Button variant="secondary" onClick={handleReRecord}>
                  Re-record
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
