import React, { useState, useRef } from "react";
import { Card, CardContent } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { UploadCloud, Plus } from "lucide-react";

export default function App() {
  const inputRef = useRef(null);
  const [videos, setVideos] = useState(Array(16).fill(null));
  const [activeIndex, setActiveIndex] = useState(null);

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (!file || activeIndex === null) return;

    const url = URL.createObjectURL(file);
    const updated = [...videos];
    updated[activeIndex] = url;
    setVideos(updated);
    setActiveIndex(null);
    inputRef.current.value = ""; // reset file input
  };

  const handleAddClick = (index) => {
    setActiveIndex(index);
    inputRef.current?.click();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Boogie Square</h1>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {videos.map((src, idx) => (
            <Card key={idx} className="aspect-video flex items-center justify-center bg-white overflow-hidden">
              <CardContent className="p-0 w-full h-full flex items-center justify-center">
                {src ? (
                  <video src={src} controls className="w-full h-full object-cover" />
                ) : (
                  <Button
                    type="button"
                    onClick={() => handleAddClick(idx)}
                    className="flex flex-col items-center justify-center w-full h-full text-gray-400 hover:text-blue-500"
                  >
                    <Plus className="w-10 h-10" />
                    <span className="text-sm">Add Video</span>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>
    </div>
  );
}
