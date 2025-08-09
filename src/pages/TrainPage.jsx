import React, { useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { VideoContext } from '../context/VideoContext';

function getTutorialSrc(step, index) {
  const folders = ["/tutorial_1/", "/tutorial_2/", "/tutorial_3/"];
  const folder = folders[Math.max(0, Math.min(step, folders.length - 1))];
  const n = (Number(index) || 0) + 1;
  return folder + encodeURIComponent(`Pattern-${step + 1}_${n}.mp4`);
}

export default function TrainPage() {
  const { index } = useParams();
  const navigate = useNavigate();
  const idx = parseInt(index, 10) || 0;
  const src = getTutorialSrc(0, idx);

  const { canContributeToPosition } = useContext(VideoContext);
  const allowed = canContributeToPosition ? canContributeToPosition(idx) : false;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 gap-4">
      <video src={src} controls autoPlay playsInline className="w-full max-w-3xl" />
      <button
        onClick={() => allowed && navigate(`/record/${idx}`)}
        disabled={!allowed}
        className={`px-4 py-2 rounded ${allowed ? 'bg-white text-black' : 'bg-gray-600 text-gray-300 cursor-not-allowed'}`}
      >
        {allowed ? 'Record this slot' : 'This slot is not available to record'}
      </button>
    </div>
  );
}