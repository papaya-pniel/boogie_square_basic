import React, { useEffect, useRef, useState, useContext } from "react";
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

export default function TrainPage() {
  const { index } = useParams();
  const { updateVideoAtIndex, getS3VideoUrl } = useContext(VideoContext);
  const navigate = useNavigate();

  const [countdown, setCountdown] = useState(3);
  const [showTutorial, setShowTutorial] = useState(false);
  const [recordingReady, setRecordingReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState(null);
  const tutorialRef = useRef(null);

  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const handleReRecord = () => {
    setRecordedBlobUrl(null);
    setRecordingReady(true);
  };

 // Map grid slot index to tutorial video filename
  const tutorialMap = {
        0: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
        1: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
        2: { src: "/boogie_square_tutorial_2.mp4", title: "Hip Hop Flow B" },
        3: { src: "/boogie_square_tutorial.mp4", title: "Boogie Square A" },
    };
  const tutorial = tutorialMap[index] || { src: "/boogie_square_tutorial.mp4", title: "Default" };
  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === 1) {
          clearInterval(timer);
          setShowTutorial(true);
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Start recording
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    streamRef.current = stream;
    videoRef.current.srcObject = stream;

    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      
      // First upload to S3
      const timestamp = new Date().toISOString();
      const filename = `videos/${index}_${timestamp}.webm`;
      await Storage.put(filename, blob, {
        contentType: 'video/webm',
        level: 'private'
      });

      // Then update the grid with the S3 key
      await updateVideoAtIndex(parseInt(index), filename);

      // Get the S3 URL for display
      const s3Url = await getS3VideoUrl(filename);
      setRecordedBlobUrl(s3Url);

      // stop webcam
      stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorder.start();
    setRecording(true);
  };

  // Stop recording
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 animate-fadeIn">
      <h2 className="text-2xl font-semibold mb-6">Boogie Square #{index}</h2>

      {countdown > 0 && (
        <div className="text-[5rem] font-bold animate-pulse mb-4">{countdown}</div>
      )}

      {showTutorial && (
        <>
            <video
            ref={tutorialRef}
            src={tutorial.src}
            controls
            autoPlay
            muted
            className="w-full max-w-xl my-4 rounded-lg shadow-md"
            onEnded={() => setRecordingReady(true)}
            />
            <p className="text-gray-400 mb-4">Watch the tutorial above</p>

            {recordingReady && !recordedBlobUrl && (
            <Button
                onClick={() => {
                if (tutorialRef.current) {
                    tutorialRef.current.currentTime = 0;
                    tutorialRef.current.play();
                }
                }}
                className="mt-2"
            >
                Rewatch Tutorial
            </Button>
            )}
            {recordingReady && (
            <Button
                className="mt-4"
                onClick={() => navigate(`/record/${index}`)}
            >
                Continue to Recording
            </Button>
            )}

        </>
      )}
    </div>
  );
}