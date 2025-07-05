import React, { useContext, useRef, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { VideoContext } from "../context/VideoContext";
import { Button } from "../components/ui/button";
import { uploadData, downloadData, remove } from "aws-amplify/storage";

const Storage = {
  async put(filename, blob, options) {
    return await uploadData(filename, blob, options);
  },
  async get(s3Key, options) {
    return await downloadData(s3Key, options);
  }
};

export default function RecordPage() {
  const { index } = useParams();
  const idxNum = parseInt(index, 10);
  // If we're in center-focus pattern, map indices 5,6,9,10 → 5
  const slotToUpdate = [5, 6, 9, 10].includes(idxNum) ? 5 : idxNum;

  const { updateVideoAtIndex, getS3VideoUrl } = useContext(VideoContext);
  const navigate = useNavigate();

  const [recording, setRecording] = useState(false);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState(null);
  const [countdown, setCountdown] = useState(null);

  const videoRef = useRef(null);
  const tutorialRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Map grid slot index to tutorial filename
  const tutorialMap = {
    0: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
    1: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
    2: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
    3: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
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
          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          
          // First upload to S3
          const timestamp = new Date().toISOString();
          const filename = `videos/${slotToUpdate}_${timestamp}.webm`;
          console.log('Uploading to S3:', filename);
          await Storage.put(filename, blob, {
            contentType: 'video/webm',
            level: 'private'
          });

          // Then update the grid with the S3 key
          console.log('Updating grid with S3 key:', filename);
          await updateVideoAtIndex(slotToUpdate, filename);

          // Get the S3 URL for display
          const s3Url = await getS3VideoUrl(filename);
          console.log('Got S3 URL:', s3Url);
          setRecordedBlobUrl(s3Url);

          // stop webcam
          stream.getTracks().forEach((t) => t.stop());
          console.log('Recording completed successfully');
        } catch (error) {
          console.error('Error in recorder.onstop:', error);
          throw error;
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

  const handleReRecord = async () => {
    setRecordedBlobUrl(null);
    // Clear the grid slot
    await updateVideoAtIndex(slotToUpdate, null);
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
          <video
            src={recordedBlobUrl}
            controls
            className="w-full max-w-xl rounded-none"
          />

          <div className="flex gap-4 mt-4">
            <Button
              onClick={() => {
                updateVideoAtIndex(slotToUpdate, recordedBlobUrl);
                navigate("/");
              }}
            >
              Save & Return to Grid
            </Button>
            <Button variant="secondary" onClick={handleReRecord}>
              Re-record
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
