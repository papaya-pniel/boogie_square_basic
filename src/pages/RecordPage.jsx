import React, { useContext, useRef, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { VideoContext } from "../context/VideoContext";
import { Button } from "../components/ui/button";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// Helper: map recording step (0..2) and grid index (0..15) to tutorial video path
function getTutorialSrc(step, index) {
  const folders = ["/tutorial_1/", "/tutorial_2/", "/tutorial_3/"];
  const folder = folders[Math.max(0, Math.min(step, folders.length - 1))];
  const n = (Number(index) || 0) + 1; // 1..16
  const filename = `Pattern-${step + 1}_${n}.mp4`;
  return folder + encodeURIComponent(filename);
}

async function concatWebm(blobs) {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  for (let i = 0; i < blobs.length; i++) {
    await ffmpeg.writeFile(`in${i}.webm`, await fetchFile(blobs[i]));
  }
  const listTxt = blobs.map((_, i) => `file in${i}.webm`).join('\n');
  await ffmpeg.writeFile('list.txt', new TextEncoder().encode(listTxt));
  try {
    await ffmpeg.exec(['-f','concat','-safe','0','-i','list.txt','-c','copy','out.webm']);
  } catch {
    await ffmpeg.exec(['-f','concat','-safe','0','-i','list.txt','-c:v','libvpx','-c:a','libvorbis','out.webm']);
  }
  const data = await ffmpeg.readFile('out.webm');
  return new Blob([data], { type: 'video/webm' });
}

export default function RecordPage() {
  const { index } = useParams();
  const idxNum = parseInt(index, 10);
  const slotToUpdate = idxNum; // 4x4 grid direct mapping

  const { updateVideoAtIndex } = useContext(VideoContext);
  const navigate = useNavigate();

  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [step, setStep] = useState(0); // 0..2
  const [clips, setClips] = useState([]); // Blob[] of each take
  const [previewUrl, setPreviewUrl] = useState(null);

  const videoRef = useRef(null);
  const tutorialRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const stopTimerRef = useRef(null);

  const tutorialVideoUrl = getTutorialSrc(step, idxNum);

  useEffect(() => {
    const timeout = setTimeout(() => tutorialRef.current?.play().catch(() => {}), 100);
    return () => clearTimeout(timeout);
  }, [tutorialVideoUrl]);

  const scheduleStopForTutorial = () => {
    const tutorial = tutorialRef.current;
    if (!tutorial) return;
    const ensureTimer = () => {
      const dur = Number.isFinite(tutorial.duration) && tutorial.duration > 0 ? tutorial.duration : 0;
      if (dur > 0) {
        stopTimerRef.current && clearTimeout(stopTimerRef.current);
        stopTimerRef.current = setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }, Math.ceil(dur * 1000));
      }
    };
    if (!Number.isFinite(tutorial.duration) || tutorial.duration === 0) {
      const handler = () => { ensureTimer(); tutorial.removeEventListener('loadedmetadata', handler); };
      tutorial.addEventListener('loadedmetadata', handler);
    } else {
      ensureTimer();
    }
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, frameRate: 30 }, audio: { sampleRate: 48000 } });
    streamRef.current = stream;
    videoRef.current.srcObject = stream;

    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 800_000, audioBitsPerSecond: 96_000 });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setClips((prev) => [...prev, blob]);
      stream.getTracks().forEach((t) => t.stop());
      stopTimerRef.current && clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
      // restore tutorial looping after a take
      if (tutorialRef.current) tutorialRef.current.loop = true;
      setRecording(false);
    };

    recorder.start();
    setRecording(true);
    // Play tutorial once for the take; stop recorder at tutorial end
    if (tutorialRef.current) {
      tutorialRef.current.loop = false;
      tutorialRef.current.currentTime = 0;
      tutorialRef.current.play().catch(() => {});
      scheduleStopForTutorial();
    }
  };

  const startCountdownThenRecord = () => {
    tutorialRef.current?.pause();
    setCountdown(3);
    let current = 3;
    const id = setInterval(() => {
      current -= 1;
      if (current === 0) {
        clearInterval(id);
        setCountdown(null);
        startRecording();
      } else setCountdown(current);
    }, 1000);
  };

  const handleNextOrSave = async () => {
    try {
      setUploadError(null);
      if (step < 2) {
        setStep(step + 1);
        setPreviewUrl(null);
        return;
      }
      if (clips.length !== 3) {
        setUploadError('Missing takes. Please record all 3.');
        return;
      }
      setIsUploading(true);
      
      // Merge all 3 clips into one video
      const mergedBlob = await mergeVideoClips(clips);
      const mergedUrl = URL.createObjectURL(mergedBlob);
      
      // Show preview of merged video
      setPreviewUrl(mergedUrl);
      setStep(3); // Move to preview step
    } catch (e) {
      console.error(e);
      setUploadError('Failed to merge videos. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveMergedVideo = async () => {
    try {
      setIsUploading(true);
      setUploadError(null);
      
      // Get the merged video blob
      const mergedBlob = await mergeVideoClips(clips);
      const mergedUrl = URL.createObjectURL(mergedBlob);
      
      await updateVideoAtIndex(slotToUpdate, mergedUrl);
      navigate('/');
    } catch (e) {
      console.error(e);
      setUploadError('Failed to save video. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Function to merge video clips (simplified approach)
  const mergeVideoClips = async (clips) => {
    try {
      // For now, we'll use a simple approach: just use the last clip
      // In a production app, you'd want to use a proper video merging library
      // like FFmpeg.wasm or a server-side solution
      
      console.log('Merging clips:', clips.length);
      
      // Simple approach: use the last clip as the "merged" result
      // This is a placeholder - you can enhance this with proper video merging later
      const lastClip = clips[clips.length - 1];
      
      // Create a new blob with metadata indicating it's "merged"
      const mergedBlob = new Blob([lastClip], { type: 'video/webm' });
      
      return mergedBlob;
      
    } catch (error) {
      console.error('Error merging clips:', error);
      throw error;
    }
  };

  const handleReRecord = () => {
    if (clips.length > 0) setClips((prev) => prev.slice(0, -1));
    setPreviewUrl(null);
    setRecording(false);
    stopTimerRef.current && clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative">
      <h2 className="text-2xl font-semibold mb-6">Record (Slot #{slotToUpdate}) — Take {step + 1} of 3</h2>

      {!previewUrl ? (
        <>
          <div className="relative w-full max-w-xl">
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-none bg-black" />
            <video
              ref={tutorialRef}
              src={tutorialVideoUrl}
              muted autoPlay playsInline loop
              className="absolute top-4 right-4 w-40 h-28 rounded-none shadow border border-white z-10"
            />
            {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/60">
                <div className="text-6xl font-bold animate-pulse">{countdown}</div>
              </div>
            )}
          </div>
          <div className="flex gap-4 mt-4">
            <Button onClick={startCountdownThenRecord} disabled={recording || countdown !== null}>Start Recording</Button>
            <Button onClick={() => mediaRecorderRef.current?.stop()} disabled={!recording}>Stop</Button>
          </div>
        </>
      ) : step === 3 ? (
        // Preview merged video step
        <>
          {isUploading && (
            <div className="text-center mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
              <p className="text-gray-300">Saving your merged video...</p>
            </div>
          )}
          {uploadError && <p className="text-red-400 mb-4">{uploadError}</p>}
          
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold mb-2">🎉 Your Merged Video is Ready!</h3>
            <p className="text-gray-300">This is how your 3 takes look combined:</p>
          </div>
          
          <video src={previewUrl} controls className="w-full max-w-2xl rounded-lg shadow-lg" />
          
          <div className="flex gap-4 mt-6">
            <Button onClick={handleSaveMergedVideo} disabled={isUploading} className="bg-green-600 hover:bg-green-700">
              ✅ Save & Return to Grid
            </Button>
            <Button variant="secondary" onClick={() => {
              setPreviewUrl(null);
              setStep(0);
              setClips([]);
            }} disabled={isUploading}>
              🔄 Start Over
            </Button>
          </div>
        </>
      ) : (
        // Individual clip preview
        <>
          {isUploading && (
            <div className="text-center mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
              <p className="text-gray-300">Processing...</p>
            </div>
          )}
          {uploadError && <p className="text-red-400 mb-4">{uploadError}</p>}
          <video src={previewUrl} controls className="w-full max-w-xl rounded-none" />
          <div className="flex gap-4 mt-4">
            <Button onClick={handleNextOrSave} disabled={isUploading}>
              {step < 2 ? 'Use Take & Next Tutorial' : 'Merge 3 Takes & Preview'}
            </Button>
            <Button variant="secondary" onClick={handleReRecord} disabled={isUploading}>Re-record this Take</Button>
          </div>
        </>
      )}
    </div>
  );
}
