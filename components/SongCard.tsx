import React, { useEffect, useState } from 'react';
import { Song, SongSection } from '../types';
import { Play, Pause, Square, SkipBack, SkipForward, Heart, Share2, MoreHorizontal, Mic2 } from 'lucide-react';

interface SongCardProps {
  song: Song;
  onPlaySong: (fullLyrics: string) => void;
  onStop: () => void;
  isPlaying: boolean;
  isLoadingAudio: boolean;
}

const WaveformVisualizer = ({ isPlaying }: { isPlaying: boolean }) => {
  return (
    <div className="flex items-center gap-1 h-8 w-full justify-center opacity-70">
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className={`w-1 bg-white rounded-full transition-all duration-150 ${isPlaying ? 'animate-pulse' : 'h-1'}`}
          style={{
            height: isPlaying ? `${Math.max(20, Math.random() * 100)}%` : '4px',
            animationDelay: `${i * 0.05}s`
          }}
        ></div>
      ))}
    </div>
  );
};

export const SongCard: React.FC<SongCardProps> = ({ song, onPlaySong, onStop, isPlaying, isLoadingAudio }) => {
  const fullLyrics = song.sections.map(s => s.lyrics.join('\n')).join('\n\n');
  const [activeTab, setActiveTab] = useState<'lyrics' | 'about'>('lyrics');

  return (
    <div className="w-full max-w-6xl mx-auto rounded-3xl overflow-hidden shadow-2xl relative bg-black/40 border border-white/5 backdrop-blur-sm">
      
      {/* Immersive Background */}
      <div className="absolute inset-0 z-0">
         {song.coverArt && (
            <>
                <img src={song.coverArt} className="w-full h-full object-cover blur-3xl opacity-40 scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
            </>
         )}
      </div>

      <div className="relative z-10 flex flex-col md:flex-row h-full min-h-[600px]">
        
        {/* LEFT: Player & Info */}
        <div className="w-full md:w-[420px] p-8 md:p-10 flex flex-col justify-between border-r border-white/5 bg-black/20">
           <div>
               <div className="aspect-square w-full rounded-2xl overflow-hidden shadow-2xl mb-8 border border-white/10 group relative">
                    {song.coverArt ? (
                        <img src={song.coverArt} alt={song.title} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                            <Mic2 className="w-16 h-16 text-white/20" />
                        </div>
                    )}
                    
                    {/* Big Play Button Overlay */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                         <button 
                            onClick={isPlaying ? onStop : () => onPlaySong(fullLyrics)}
                            className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform"
                         >
                            {isPlaying ? <Pause className="fill-current w-8 h-8" /> : <Play className="fill-current w-8 h-8 ml-1" />}
                         </button>
                    </div>
               </div>

               <div className="space-y-2 mb-6">
                   <h1 className="text-4xl font-black text-white leading-tight tracking-tight">{song.title}</h1>
                   <p className="text-lg text-white/60 font-medium">{song.artistStyle}</p>
                   <div className="flex gap-2 mt-4 flex-wrap">
                      <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-bold uppercase tracking-wider text-white/80">{song.genre}</span>
                      <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-bold uppercase tracking-wider text-white/80">{song.tempo}</span>
                      <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-bold uppercase tracking-wider text-white/80">{song.key}</span>
                   </div>
               </div>
           </div>

           {/* Player Controls */}
           <div className="bg-white/5 rounded-2xl p-6 backdrop-blur-md border border-white/5">
                <div className="flex items-center justify-center gap-6 mb-6">
                    <button className="text-white/40 hover:text-white transition-colors"><SkipBack className="w-6 h-6" /></button>
                    
                    <button 
                        onClick={isPlaying ? onStop : () => onPlaySong(fullLyrics)}
                        disabled={isLoadingAudio}
                        className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${isLoadingAudio ? 'bg-white/10' : 'bg-white text-black hover:scale-105'}`}
                    >
                        {isLoadingAudio ? (
                           <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        ) : isPlaying ? (
                           <Square className="fill-current w-6 h-6" />
                        ) : (
                           <Play className="fill-current w-8 h-8 ml-1" />
                        )}
                    </button>
                    
                    <button className="text-white/40 hover:text-white transition-colors"><SkipForward className="w-6 h-6" /></button>
                </div>
                
                {isPlaying && <WaveformVisualizer isPlaying={isPlaying} />}

                <div className="flex justify-between mt-6 pt-6 border-t border-white/10">
                    <button className="flex items-center gap-2 text-sm font-bold text-white/60 hover:text-white transition-colors">
                        <Heart className="w-4 h-4" /> Like
                    </button>
                    <button className="flex items-center gap-2 text-sm font-bold text-white/60 hover:text-white transition-colors">
                        <Share2 className="w-4 h-4" /> Share
                    </button>
                    <button className="text-white/60 hover:text-white">
                        <MoreHorizontal className="w-5 h-5" />
                    </button>
                </div>
           </div>
        </div>

        {/* RIGHT: Content Tabs */}
        <div className="flex-1 flex flex-col min-h-[500px] bg-slate-950/30">
            <div className="flex border-b border-white/5">
                <button 
                    onClick={() => setActiveTab('lyrics')}
                    className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'lyrics' ? 'text-white border-b-2 border-white bg-white/5' : 'text-white/40 hover:text-white/60'}`}
                >
                    Lyrics
                </button>
                <button 
                    onClick={() => setActiveTab('about')}
                    className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'about' ? 'text-white border-b-2 border-white bg-white/5' : 'text-white/40 hover:text-white/60'}`}
                >
                    Story
                </button>
            </div>

            <div className="p-8 md:p-12 overflow-y-auto custom-scrollbar h-full">
                {activeTab === 'lyrics' ? (
                     <div className="space-y-8 max-w-2xl mx-auto">
                        {song.sections.map((section, idx) => (
                            <div key={idx} className="mb-8">
                                <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4">{section.type}</h3>
                                <div className="space-y-4">
                                    {section.lyrics.map((line, lIdx) => (
                                        <div key={lIdx} className="group">
                                            {/* Chords hidden by default, visible on hover or if you want them always visible */}
                                            <div className="h-4 text-[10px] font-mono text-indigo-400 opacity-60 mb-0.5">{section.chords[lIdx]}</div>
                                            <p className={`text-xl md:text-2xl font-semibold leading-relaxed transition-colors ${isPlaying ? 'text-white' : 'text-white/80'}`}>
                                                {line}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                     </div>
                ) : (
                    <div className="max-w-xl mx-auto pt-8">
                        <h3 className="text-2xl font-bold text-white mb-6">About this song</h3>
                        <p className="text-lg text-slate-300 leading-relaxed mb-8">
                            {song.description}
                        </p>
                        <div className="p-6 bg-white/5 rounded-xl border border-white/5">
                            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Prompt Details</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="block text-white/40 mb-1">Genre</span>
                                    <span className="text-white capitalize">{song.genre}</span>
                                </div>
                                <div>
                                    <span className="block text-white/40 mb-1">Vibe</span>
                                    <span className="text-white">{song.artistStyle}</span>
                                </div>
                                <div>
                                    <span className="block text-white/40 mb-1">Tempo</span>
                                    <span className="text-white">{song.tempo}</span>
                                </div>
                                <div>
                                    <span className="block text-white/40 mb-1">Key</span>
                                    <span className="text-white">{song.key}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>

      </div>
    </div>
  );
};