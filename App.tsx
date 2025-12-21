import React, { useState, useCallback, useRef } from 'react';
import { generateSong, generateTTSAudio, generateAlbumArt, expandLyrics } from './services/geminiService';
import { playSongDemo, stopAudio } from './services/audioEngine';
import { Song, SongGenre } from './types';
import { SongCard } from './components/SongCard';
import { Disc, Loader2, Music2, Guitar, Radio, Fan, Wand2, ChevronDown, ChevronUp, Search, Play, MoreHorizontal, Pin, Share2, ThumbsUp, ThumbsDown } from 'lucide-react';

const GENRES: { id: SongGenre; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'rnb', label: 'R&B Soul', icon: <Disc className="w-4 h-4" />, color: 'from-indigo-500 to-purple-500' },
  { id: 'pop', label: 'Pop', icon: <Radio className="w-4 h-4" />, color: 'from-pink-500 to-rose-500' },
  { id: 'country', label: 'Country', icon: <Guitar className="w-4 h-4" />, color: 'from-amber-500 to-orange-600' },
  { id: 'chinese', label: 'Chinese', icon: <Fan className="w-4 h-4" />, color: 'from-emerald-500 to-teal-600' },
];

export default function App() {
  const [lyrics, setLyrics] = useState("");
  const [styles, setStyles] = useState("soulful, acoustic, light piano");
  const [genre, setGenre] = useState<SongGenre>('rnb');
  const [history, setHistory] = useState<Song[]>([]);
  const [activeSong, setActiveSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanding, setExpanding] = useState(false);
  
  const [showLyrics, setShowLyrics] = useState(true);
  const [showStyles, setShowStyles] = useState(true);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  const handleGenerate = async () => {
    handleStop();
    setLoading(true);
    try {
      const isCustom = lyrics.length > 30;
      const song = await generateSong(lyrics || "A soulful melody", styles, genre, isCustom);
      const art = await generateAlbumArt(song.title, song.description, genre);
      song.coverArt = art;
      
      setHistory(prev => [song, ...prev]);
      setActiveSong(song);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePlaySong = async (lyricText: string) => {
    if (!activeSong) return;
    setIsLoadingAudio(true);
    try {
      if (!audioBufferRef.current) {
        audioBufferRef.current = await generateTTSAudio(lyricText, activeSong.genre);
      }
      setIsLoadingAudio(false);
      setIsPlaying(true);
      const { duration: d } = await playSongDemo(activeSong, audioBufferRef.current);
      setDuration(d);
      startProgressTimer(d);
    } catch (e) {
      alert("Playback Error: " + (e instanceof Error ? e.message : "Audio failed"));
      setIsLoadingAudio(false);
    }
  };

  const handleStop = () => {
    stopAudio();
    setIsPlaying(false);
    setCurrentTime(0);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  };

  const startProgressTimer = (total: number) => {
    const start = Date.now();
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed >= total) handleStop();
      else setCurrentTime(elapsed);
    }, 100);
  };

  return (
    <div className="flex h-screen bg-[#0d0d0d] text-slate-300 font-sans overflow-hidden">
      
      {/* LEFT: Generation Sidebar */}
      <aside className="w-[380px] border-r border-white/5 flex flex-col bg-[#121212]">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
            <Music2 className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white tracking-tight">Studio v4.5</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Lyrics Panel */}
          <section className="space-y-3">
            <button onClick={() => setShowLyrics(!showLyrics)} className="w-full flex items-center justify-between group">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40 group-hover:text-white/60">
                {showLyrics ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Lyrics
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); expandLyrics(lyrics).then(setLyrics); }}
                className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/40 hover:text-indigo-400"
              >
                <Wand2 size={14} />
              </button>
            </button>
            {showLyrics && (
              <textarea
                value={lyrics}
                onChange={e => setLyrics(e.target.value)}
                placeholder="Write lyrics or a prompt..."
                className="w-full h-40 bg-[#1a1a1a] border border-white/5 rounded-xl p-4 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors resize-none"
              />
            )}
          </section>

          {/* Styles Panel */}
          <section className="space-y-3">
            <button onClick={() => setShowStyles(!showStyles)} className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-widest text-white/40">
              <div className="flex items-center gap-2">{showStyles ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Styles</div>
            </button>
            {showStyles && (
              <input
                value={styles}
                onChange={e => setStyles(e.target.value)}
                placeholder="tag, tag, tag..."
                className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl p-4 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            )}
          </section>

          {/* Genre Chips */}
          <div className="grid grid-cols-2 gap-2">
            {GENRES.map(g => (
              <button 
                key={g.id} 
                onClick={() => setGenre(g.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${genre === g.id ? 'bg-indigo-500/10 border-indigo-500/40 text-white' : 'bg-white/5 border-transparent text-white/40 hover:bg-white/10'}`}
              >
                {g.icon} {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 bg-[#0a0a0a] border-t border-white/5">
          <button 
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18}/> : <Disc size={18}/>}
            Create Song
          </button>
        </div>
      </aside>

      {/* RIGHT: Library & Main Player */}
      <main className="flex-1 flex flex-col bg-[#0d0d0d] relative overflow-hidden">
        {/* Top Search Bar */}
        <header className="p-6 flex items-center justify-between">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
            <input 
              placeholder="Search library..."
              className="w-full bg-white/5 rounded-full py-2.5 pl-10 pr-4 text-sm border border-transparent focus:border-white/10 outline-none"
            />
          </div>
          <div className="flex items-center gap-4">
             <div className="text-xs font-medium text-white/20">4.5-all</div>
             <div className="w-8 h-8 rounded-full bg-indigo-500/20"></div>
          </div>
        </header>

        {/* History List */}
        <div className="flex-1 overflow-y-auto px-6 pb-24 custom-scrollbar">
           {history.length === 0 && !loading ? (
             <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4">
                <Music2 size={64} />
                <p className="text-sm font-medium">Your studio library is empty</p>
             </div>
           ) : (
             <div className="space-y-2 max-w-4xl mx-auto">
                {history.map((s, idx) => (
                  <div 
                    key={idx}
                    onClick={() => { setActiveSong(s); audioBufferRef.current = null; handleStop(); }}
                    className={`group flex items-center gap-4 p-3 rounded-2xl border transition-all cursor-pointer ${activeSong === s ? 'bg-white/10 border-white/10 shadow-xl' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                  >
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-800 shrink-0">
                      {s.coverArt ? <img src={s.coverArt} className="w-full h-full object-cover" /> : <Music2 className="w-full h-full p-4 opacity-20" />}
                      <div className="absolute bottom-1 right-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-bold text-white">4:14</div>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                         <Play size={20} className="fill-white text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                       <div className="flex items-center gap-2">
                         <h4 className="font-bold text-white truncate">{s.title}</h4>
                         <span className="px-1.5 py-0.5 bg-white/5 rounded text-[9px] font-bold uppercase tracking-wider text-white/40">v4.5-all</span>
                       </div>
                       <p className="text-xs text-white/40 truncate mt-0.5">{s.genre} • {s.artistStyle}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button className="p-2 text-white/40 hover:text-white"><ThumbsUp size={16}/></button>
                       <button className="p-2 text-white/40 hover:text-white"><ThumbsDown size={16}/></button>
                       <button className="p-2 text-white/40 hover:text-white"><Pin size={16}/></button>
                       <button className="p-2 text-white/40 hover:text-white"><Share2 size={16}/></button>
                       <button className="p-2 text-white/40 hover:text-white"><MoreHorizontal size={16}/></button>
                    </div>
                  </div>
                ))}
             </div>
           )}
        </div>

        {/* Floating Player for Active Song */}
        {activeSong && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl px-6 animate-in slide-in-from-bottom-4 duration-500">
             <SongCard 
                song={activeSong}
                onPlaySong={handlePlaySong}
                onStop={handleStop}
                isPlaying={isPlaying}
                isLoadingAudio={isLoadingAudio}
                currentTime={currentTime}
                duration={duration}
             />
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
      `}</style>
    </div>
  );
}
