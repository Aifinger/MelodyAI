
import React, { useMemo, useState } from 'react';
import { Song } from '../types';
import { Play, Pause, Square, Download, Loader2, Mic2 } from 'lucide-react';
import { renderSongToBlob } from '../services/audioEngine';
import { generateTTSAudio } from '../services/geminiService';

interface SongCardProps {
  song: Song;
  onPlaySong: (fullLyrics: string) => void;
  onStop: () => void;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  currentTime: number;
  duration: number;
}

export const SongCard: React.FC<SongCardProps> = ({ song, onPlaySong, onStop, isPlaying, isLoadingAudio, currentTime, duration }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  // Safely join lyrics with fallback for undefined sections or missing lyrics arrays
  const fullLyrics = useMemo(() => {
    if (!song?.sections) return "";
    return song.sections
      .map(s => (s.lyrics || []).join('\n'))
      .filter(l => l.length > 0)
      .join('\n\n');
  }, [song.sections]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fullLyrics) {
      alert("No lyrics available to generate audio.");
      return;
    }
    setIsDownloading(true);
    try {
      const vBuf = await generateTTSAudio(fullLyrics, song.genre);
      const blob = await renderSongToBlob(song, vBuf);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${song.title.replace(/\s+/g, '_')}.wav`;
      a.click();
    } catch (err) { 
      console.error(err);
      alert("Download failed"); 
    } finally { 
      setIsDownloading(false); 
    }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center gap-4">
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-800 shrink-0 border border-white/5">
        {song.coverArt ? <img src={song.coverArt} className="w-full h-full object-cover" /> : <Mic2 className="w-full h-full p-3 opacity-20" />}
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-white truncate">{song.title || "Untitled Composition"}</h4>
        <div className="flex items-center gap-3 mt-1">
          <div className="flex-1 h-1 bg-white/10 rounded-full relative overflow-hidden">
             <div 
               className="absolute top-0 left-0 h-full bg-white transition-all duration-200"
               style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
             />
          </div>
          <span className="text-[10px] font-mono text-white/40 tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-l border-white/5 pl-4">
        <button 
          onClick={() => isPlaying ? onStop() : onPlaySong(fullLyrics)}
          disabled={isLoadingAudio || !fullLyrics}
          className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
        >
          {isLoadingAudio ? <Loader2 className="animate-spin" size={16}/> : isPlaying ? <Square size={16} className="fill-current"/> : <Play size={16} className="fill-current ml-0.5"/>}
        </button>
        <button 
          onClick={handleDownload}
          disabled={isDownloading || !fullLyrics}
          className="w-10 h-10 rounded-full bg-white/5 text-white/60 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
        >
          {isDownloading ? <Loader2 className="animate-spin" size={16}/> : <Download size={16}/>}
        </button>
      </div>
    </div>
  );
};
