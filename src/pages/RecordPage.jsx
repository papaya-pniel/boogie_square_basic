import React, { useContext, useRef, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { VideoContext } from "../context/VideoContext";
import { Button } from "../components/ui/button";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// Helper: map grid index (0..15) to tutorial video path (always tutorial_1)
function getTutorialSrc(index) {
  const folder = "/tutorial_1/";
  const n = (Number(index) || 0) + 1; // 1..16
  const filename = `Pattern-1_${n}.mp4`;
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

  const { updateVideoAtIndex, updateVideoTakesAtIndex, currentGridNumber, getUserContributedGridNumber } = useContext(VideoContext);
  const navigate = useNavigate();

  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [clip, setClip] = useState(null); // Single recording blob
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showTutorialPreview, setShowTutorialPreview] = useState(true); // New state for tutorial preview mode
  const [showReadyToRecord, setShowReadyToRecord] = useState(false); // New state for ready to record screen

  const videoRef = useRef(null);
  const tutorialRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const stopTimerRef = useRef(null);

  const tutorialVideoUrl = getTutorialSrc(idxNum);

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
    // Camera stream is already set up in readyToRecord()
    const stream = streamRef.current;

    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 800_000, audioBitsPerSecond: 96_000 });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setClip(blob);
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

  const readyToRecord = async () => {
    // Switch from tutorial preview to ready to record screen
    setShowTutorialPreview(false);
    setShowReadyToRecord(true);
    
    // Start camera stream
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 640, height: 360, frameRate: 30 }, 
      audio: { sampleRate: 48000 } 
    });
    streamRef.current = stream;
    videoRef.current.srcObject = stream;
  };

  const startCountdownThenRecord = () => {
    // Switch from ready to record to actual recording mode
    setShowReadyToRecord(false);
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

  const handleSave = async () => {
    try {
      setUploadError(null);
      if (!clip) {
        setUploadError('Please record a video first.');
        return;
      }
      setIsUploading(true);
      
      // Save the single recording as take1 (and also as take2/take3 for compatibility)
      // This allows synchronized playback across the grid
      await saveRecordingToGrid(clip);
      
      // Also save to main video slot (for backward compatibility)
      try {
        await updateVideoAtIndex(slotToUpdate, clip);
        console.log('✅ Video saved');
      } catch (saveError) {
        console.warn('Failed to save main video (non-critical):', saveError);
      }
      
      // After saving, get the grid number the user contributed to and reload to show their grid
      const userGridNum = await getUserContributedGridNumber();
      console.log('✅ Recording saved. User contributed to grid:', userGridNum);
      
      // Directly return to grid - no preview step
      // Add parameter to show completion popup
      window.location.href = '/?justRecorded=true';
    } catch (e) {
      console.error(e);
      setUploadError('Failed to save video. Please try again.');
      setIsUploading(false);
    }
  };

  // Function to merge video clips using canvas and MediaRecorder
  const mergeVideoClips = async (clips) => {
    return new Promise((resolve, reject) => {
      try {
        console.log('Merging clips:', clips.length);
        
        if (clips.length === 0) {
          reject(new Error('No clips to merge'));
          return;
        }
        
        // Create a canvas for video processing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Get dimensions from first clip
        const firstVideo = document.createElement('video');
        firstVideo.src = URL.createObjectURL(clips[0]);
        
        firstVideo.onloadedmetadata = () => {
          canvas.width = firstVideo.videoWidth;
          canvas.height = firstVideo.videoHeight;
          
          // Create a MediaStream from canvas
          const stream = canvas.captureStream(30); // 30 FPS
          const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
          const chunks = [];
          
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunks.push(e.data);
            }
          };
          
          mediaRecorder.onstop = () => {
            const mergedBlob = new Blob(chunks, { type: 'video/webm' });
            console.log('Merged video created:', mergedBlob.size, 'bytes');
            resolve(mergedBlob);
          };
          
          // Start recording
          mediaRecorder.start();
          
          // Play each clip sequentially
          let currentClipIndex = 0;
          
          const playNextClip = () => {
            if (currentClipIndex >= clips.length) {
              // All clips processed, stop recording
              setTimeout(() => {
                mediaRecorder.stop();
              }, 500); // Give a moment for the last frame
              return;
            }
            
            const currentClip = clips[currentClipIndex];
            const clipVideo = document.createElement('video');
            clipVideo.src = URL.createObjectURL(currentClip);
            clipVideo.muted = true;
            clipVideo.crossOrigin = 'anonymous';
            
            clipVideo.onloadeddata = () => {
              clipVideo.play();
            };
            
            clipVideo.ontimeupdate = () => {
              // Draw current frame to canvas
              try {
                ctx.drawImage(clipVideo, 0, 0, canvas.width, canvas.height);
              } catch (e) {
                console.warn('Error drawing video frame:', e);
              }
            };
            
            clipVideo.onended = () => {
              currentClipIndex++;
              // Small delay between clips
              setTimeout(playNextClip, 200);
            };
            
            clipVideo.onerror = (e) => {
              console.error('Error playing clip:', e);
              currentClipIndex++;
              setTimeout(playNextClip, 200);
            };
          };
          
          // Start the process
          playNextClip();
        };
        
        firstVideo.onerror = () => {
          reject(new Error('Failed to load first clip'));
        };
        
      } catch (error) {
        console.error('Error in mergeVideoClips:', error);
        reject(error);
      }
    });
  };

  // Function to save the single recording for synchronized grid playback
  const saveRecordingToGrid = async (recordingBlob) => {
    try {
      console.log('Saving recording to grid');
      console.log('Current grid number:', currentGridNumber);
      
      // Save the single recording as take1 only
      await updateVideoTakesAtIndex(slotToUpdate, recordingBlob, null, null);
      
      console.log('Recording saved successfully');
      
    } catch (error) {
      console.error('Error saving recording:', error);
      throw error;
    }
  };

  const handleReRecord = () => {
    setClip(null);
    setPreviewUrl(null);
    setRecording(false);
    setShowTutorialPreview(true); // Show tutorial preview again
    setShowReadyToRecord(false);
    // Stop camera stream if it's running
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    stopTimerRef.current && clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative">
      <h2 className="text-2xl font-semibold mb-6">Record (Slot #{slotToUpdate})</h2>

      {!previewUrl ? (
        <>
          {showTutorialPreview ? (
            // Tutorial Preview Mode - Same format as recording but with tutorial as main video
            <>
              <div className="relative w-full max-w-xl">
                <video
                  ref={tutorialRef}
                  src={tutorialVideoUrl}
                  muted autoPlay playsInline loop
                  className="w-full rounded-none bg-black"
                />
              </div>
              <div className="flex gap-4 mt-4">
                <Button onClick={readyToRecord} className="bg-green-600 hover:bg-green-700 px-8 py-3 text-lg">
                  🎬 Ready to Record
                </Button>
                <Button variant="secondary" onClick={() => navigate('/')} className="px-6 py-3">
                  ← Back to Grid
                </Button>
              </div>
              <div className="text-center mt-4 text-gray-300">
                <p>Watch the tutorial above, then click "Ready to Record" when ready!</p>
              </div>
            </>
          ) : showReadyToRecord ? (
            // Ready to Record Mode - Show camera with tutorial in corner, no recording yet
            <>
              <div className="relative w-full max-w-xl">
                <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-none bg-black" />
                <video
                  ref={tutorialRef}
                  src={tutorialVideoUrl}
                  muted autoPlay playsInline loop
                  className="absolute top-4 right-4 w-40 h-28 rounded-none shadow border border-white z-10"
                />
                {/* Silhouette overlay to guide positioning */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                  <div className="relative">
                    {/* Main body silhouette */}
                    <div className="w-32 h-48 bg-white/20 border-2 border-white/40 rounded-lg relative">
                      {/* Head */}
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 w-12 h-12 bg-white/20 border-2 border-white/40 rounded-full"></div>
                      {/* Arms */}
                      <div className="absolute top-8 -left-6 w-8 h-16 bg-white/20 border-2 border-white/40 rounded-full transform -rotate-12"></div>
                      <div className="absolute top-8 -right-6 w-8 h-16 bg-white/20 border-2 border-white/40 rounded-full transform rotate-12"></div>
                      {/* Legs */}
                      <div className="absolute bottom-0 left-4 w-6 h-20 bg-white/20 border-2 border-white/40 rounded-full"></div>
                      <div className="absolute bottom-0 right-4 w-6 h-20 bg-white/20 border-2 border-white/40 rounded-full"></div>
                    </div>
                    {/* Position guide text */}
                    <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 text-center">
                      <div className="text-white/80 text-sm font-medium bg-black/50 px-3 py-1 rounded">
                        Position yourself here
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 mt-4">
                <Button onClick={startCountdownThenRecord} className="bg-red-600 hover:bg-red-700 px-8 py-3 text-lg">
                  🎬 Start Recording
                </Button>
                <Button variant="secondary" onClick={() => {
                  setShowReadyToRecord(false);
                  setShowTutorialPreview(true);
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                    streamRef.current = null;
                  }
                }} className="px-6 py-3">
                  ← Back to Tutorial
                </Button>
              </div>
              <div className="text-center mt-4 text-gray-300">
                <p>Camera is ready! Position yourself and click "Start Recording" when ready.</p>
              </div>
            </>
          ) : (
            // Recording Mode - Show camera with tutorial in corner, actively recording
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
                {/* No silhouette overlay during recording */}
              </div>
              <div className="flex gap-4 mt-4">
                <Button onClick={startCountdownThenRecord} disabled={recording || countdown !== null}>Start Recording</Button>
                <Button onClick={() => mediaRecorderRef.current?.stop()} disabled={!recording}>Stop</Button>
              </div>
            </>
          )}
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
            <Button onClick={handleSave} disabled={isUploading}>
              Save & Return to Grid
            </Button>
            <Button variant="secondary" onClick={handleReRecord} disabled={isUploading}>Re-record</Button>
          </div>
        </>
      )}
    </div>
  );
}
