import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BASE_FREE_DRAW_INTERVAL, MIN_FREE_DRAW_INTERVAL, RANKS, AVAILABLE_BUFFS } from './constants';
import { GameState, DrawResult, Rarity, Buff, Rank } from './types';
import { HistoryLog } from './components/HistoryLog';
import { StorePanel } from './components/StorePanel';
import { SummonModal } from './components/SummonModal';

// Initial state
const INITIAL_STATE: GameState = {
  draws: 10,
  highestDraws: 10,
  history: [],
  activeBuffs: [],
  speedUpLevel: 0,
  lastFreeDrawTime: Date.now(),
  timeToNextDraw: BASE_FREE_DRAW_INTERVAL,
  stats: { totalPulls: 0, totalEarned: 10 }
};

type AnimationState = 'IDLE' | 'COMMON' | 'RARE' | 'LEGENDARY';

const App: React.FC = () => {
  // --- State ---
  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = localStorage.getItem('drawKingSave');
    return saved ? JSON.parse(saved) : INITIAL_STATE;
  });

  const [skipAnimation, setSkipAnimation] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [animationState, setAnimationState] = useState<AnimationState>('IDLE');
  const [summonResults, setSummonResults] = useState<DrawResult[] | null>(null);
  
  // Persist State
  useEffect(() => {
    localStorage.setItem('drawKingSave', JSON.stringify(gameState));
  }, [gameState]);

  // --- Helpers ---
  const getCurrentRank = useCallback((highScore: number): Rank => {
    // Find the highest threshold less than or equal to high score
    const rank = [...RANKS].reverse().find(r => highScore >= r.threshold);
    return rank || RANKS[0];
  }, []);

  const getInterval = useCallback(() => {
    const reduced = BASE_FREE_DRAW_INTERVAL - gameState.speedUpLevel;
    return Math.max(MIN_FREE_DRAW_INTERVAL, reduced);
  }, [gameState.speedUpLevel]);

  // --- Game Loop (Timer & Buffs) ---
  useEffect(() => {
    const timer = setInterval(() => {
      setGameState(prev => {
        const now = Date.now();
        const currentInterval = Math.max(MIN_FREE_DRAW_INTERVAL, BASE_FREE_DRAW_INTERVAL - prev.speedUpLevel);
        
        let newTimeToNext = prev.timeToNextDraw - 1;
        let newDraws = prev.draws;
        let newLastFree = prev.lastFreeDrawTime;
        let newHighest = prev.highestDraws;

        // Passive Income Logic
        if (newTimeToNext <= 0) {
          newDraws += 1;
          newHighest = Math.max(newHighest, newDraws);
          newTimeToNext = currentInterval;
          newLastFree = now;
        }

        // Expire Buffs
        const validBuffs = prev.activeBuffs.filter(b => 
          b.durationSeconds === 0 || (b.expiresAt && b.expiresAt > now)
        );

        return {
          ...prev,
          draws: newDraws,
          highestDraws: newHighest,
          timeToNextDraw: newTimeToNext,
          lastFreeDrawTime: newLastFree,
          activeBuffs: validBuffs
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // --- Logic: Gacha Pull ---
  const performPull = useCallback((count: number) => {
    if (gameState.draws < count) return;
    if (isPulling) return;

    setIsPulling(true);
    
    // --- 1. Calculate Outcome Immediately ---
    const results: DrawResult[] = [];
    const hasLuck = gameState.activeBuffs.some(b => b.type === 'LUCK');
    const hasDouble = gameState.activeBuffs.some(b => b.type === 'DOUBLE');
    const hasShield = gameState.activeBuffs.some(b => b.type === 'SHIELD');

    let earnedDraws = 0;
    
    // Base Weights for EV = 1.0
    // Rewards: {10, 5, 3, 1, 0}
    // Probabilities: {1%, 4%, 10%, 40%, 45%}
    let w10 = 1;
    let w5 = 4;
    let w3 = 10;
    let w1 = 40;
    let w0 = 45;

    // Apply Luck Buff (1.5x to high tier)
    if (hasLuck) {
      w10 *= 1.5;
      w5 *= 1.5;
      
      const newHighTotal = w10 + w5; // 7.5
      const remainingSpace = 100 - newHighTotal; // 92.5
      const oldLowTotal = 10 + 40 + 45; // 95
      const reductionFactor = remainingSpace / oldLowTotal;

      w3 *= reductionFactor;
      w1 *= reductionFactor;
      w0 *= reductionFactor;
    }

    let maxRarityInBatch: AnimationState = 'COMMON';

    for (let i = 0; i < count; i++) {
      const rng = Math.random() * 100;
      let amount = 0;
      let rarity = Rarity.COMMON;

      // Determine raw outcome
      if (rng < w0) { amount = 0; rarity = Rarity.COMMON; }
      else if (rng < w0 + w1) { amount = 1; rarity = Rarity.COMMON; }
      else if (rng < w0 + w1 + w3) { amount = 3; rarity = Rarity.COMMON; }
      else if (rng < w0 + w1 + w3 + w5) { amount = 5; rarity = Rarity.RARE; }
      else { amount = 10; rarity = Rarity.LEGENDARY; }

      // Buffs Logic: Shield & Double
      let wasShielded = false;
      let wasDoubled = false;

      // Shield: 25% chance to save a 0 pull (Simulating "once per minute" roughly/simple mechanic)
      if (amount === 0 && hasShield) {
          if (Math.random() < 0.25) {
            amount = 1;
            wasShielded = true;
          }
      }

      // Double: 10% chance
      if (amount > 0 && hasDouble && Math.random() < 0.1) {
        amount *= 2;
        wasDoubled = true;
      }

      earnedDraws += amount;
      
      // Track Highest Rarity for Animation
      if (amount >= 10 && maxRarityInBatch !== 'LEGENDARY') maxRarityInBatch = 'LEGENDARY';
      else if (amount >= 5 && maxRarityInBatch !== 'LEGENDARY' && maxRarityInBatch !== 'RARE') maxRarityInBatch = 'RARE';

      results.push({
        id: Math.random().toString(36).substr(2, 9),
        amount,
        rarity: amount >= 10 ? Rarity.LEGENDARY : amount >= 5 ? Rarity.RARE : Rarity.COMMON,
        timestamp: Date.now(),
        wasDoubled,
        wasShielded
      });
    }

    // --- 2. Set Animation State ---
    setAnimationState(maxRarityInBatch);

    // --- 3. Wait for Animation, then Reveal ---
    const delay = skipAnimation ? 100 : 1500; // 1.5s animation

    setTimeout(() => {
      setGameState(prev => {
        const newDraws = prev.draws - count + earnedDraws;
        return {
          ...prev,
          draws: newDraws,
          highestDraws: Math.max(prev.highestDraws, newDraws),
          stats: {
            totalPulls: prev.stats.totalPulls + count,
            totalEarned: prev.stats.totalEarned + earnedDraws
          },
          history: [...results.reverse(), ...prev.history].slice(0, 50)
        };
      });

      if (!skipAnimation) {
        setSummonResults(results);
      }
      setIsPulling(false);
      setAnimationState('IDLE');

    }, delay);
  }, [gameState.draws, gameState.activeBuffs, isPulling, skipAnimation]);

  // --- Logic: Buy Buff ---
  const buyBuff = (buff: Buff) => {
    if (gameState.draws < buff.cost) return;

    setGameState(prev => {
      const active = [...prev.activeBuffs];
      let speedLevel = prev.speedUpLevel;

      if (buff.type === 'SPEED') {
        if (speedLevel < 50) {
            speedLevel += 1;
        } else {
            return prev;
        }
      } else {
        const existingIdx = active.findIndex(b => b.id === buff.id);
        const newBuff = { ...buff, expiresAt: Date.now() + (buff.durationSeconds * 1000) };
        if (existingIdx >= 0) {
          active[existingIdx] = newBuff;
        } else {
          active.push(newBuff);
        }
      }

      return {
        ...prev,
        draws: prev.draws - buff.cost,
        activeBuffs: active,
        speedUpLevel: speedLevel
      };
    });
  };

  const currentRank = getCurrentRank(gameState.highestDraws);

  // --- Animation Styles helper ---
  const getOrbStyles = () => {
    if (!isPulling) return 'animate-float bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 shadow-[0_0_50px_rgba(168,85,247,0.4)]';
    
    switch (animationState) {
      case 'LEGENDARY':
        return 'animate-shake-gold bg-gradient-to-br from-yellow-400 via-orange-500 to-yellow-600 shadow-[0_0_80px_rgba(234,179,8,0.8)] border-4 border-yellow-200';
      case 'RARE':
        return 'animate-pulse-purple bg-gradient-to-br from-purple-600 via-fuchsia-600 to-purple-800 shadow-[0_0_60px_rgba(192,38,211,0.6)] border-2 border-purple-300';
      default: // COMMON
        return 'animate-pulse-blue bg-gradient-to-br from-blue-500 via-indigo-600 to-blue-700 shadow-[0_0_50px_rgba(59,130,246,0.5)]';
    }
  };

  const getOrbContent = () => {
    if (!isPulling) return <div className="text-6xl filter drop-shadow-lg">💎</div>;
    // During pull
    return <div className="text-6xl filter drop-shadow-lg transition-all duration-300 scale-110">
       {animationState === 'LEGENDARY' ? '🌟' : animationState === 'RARE' ? '✨' : '🌀'}
    </div>;
  };

  return (
    <div className="min-h-screen flex flex-col relative pb-10">
      
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[100px]" />
      </div>

      {/* --- HUD --- */}
      <header className="sticky top-0 z-40 glass border-b border-white/10 px-4 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
            <h1 className="text-2xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
              DRAW KING
            </h1>
            <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full border border-white/5">
              <span className="text-gray-400 text-xs font-bold uppercase">Rank</span>
              <span className="text-yellow-400 font-bold text-sm glow-gold">{currentRank.title}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Balance</div>
              <div className="text-3xl font-mono font-bold text-white leading-none glow-text">
                {gameState.draws}
              </div>
            </div>
            <div className="h-8 w-px bg-white/10 hidden sm:block"></div>
            <div className="text-center hidden sm:block">
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Record</div>
              <div className="text-lg font-mono text-gray-300 leading-none">
                {gameState.highestDraws}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
             {/* Timer */}
            <div className="relative group">
              <svg className="w-10 h-10 -rotate-90 transform">
                 <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-gray-800" />
                 <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent" 
                    className="text-purple-500 transition-all duration-1000 ease-linear"
                    strokeDasharray={100}
                    strokeDashoffset={100 - (gameState.timeToNextDraw / getInterval()) * 100} 
                 />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                {gameState.timeToNextDraw}
              </span>
              <div className="absolute top-10 right-0 bg-black/90 p-2 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10">
                Next free draw in {gameState.timeToNextDraw}s
              </div>
            </div>
          </div>

        </div>
      </header>

      {/* --- Main Content --- */}
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Altar / Main Game */}
        <div className="lg:col-span-8 flex flex-col items-center">
          
          {/* Active Buffs Bar */}
          <div className="w-full flex gap-3 mb-6 overflow-x-auto pb-2 custom-scrollbar min-h-[60px]">
            {gameState.activeBuffs.length === 0 && (
              <div className="w-full text-center text-sm text-gray-600 border border-dashed border-gray-800 rounded-lg py-2">
                No active buffs. Visit the Vault.
              </div>
            )}
            {gameState.activeBuffs.map(buff => {
               const timeLeft = buff.expiresAt ? Math.ceil((buff.expiresAt - Date.now()) / 1000) : null;
               if (timeLeft !== null && timeLeft <= 0) return null;
               
               return (
                <div key={buff.id} className="flex items-center gap-2 bg-purple-900/20 border border-purple-500/30 rounded-full px-4 py-1.5 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2">
                  <span>{buff.icon}</span>
                  <span className="text-sm font-bold text-purple-200">{buff.name}</span>
                  {timeLeft && <span className="text-xs font-mono text-purple-400 w-8">{timeLeft}s</span>}
                </div>
               );
            })}
          </div>

          {/* Summoning Altar */}
          <div className="relative w-full max-w-xl aspect-square md:aspect-video bg-black/30 rounded-3xl border border-white/5 flex flex-col items-center justify-center overflow-hidden mb-8 group">
             {/* Decor */}
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent opacity-50"></div>
             
             {/* The Orb */}
             <div className={`relative z-10 w-48 h-48 rounded-full flex items-center justify-center mb-8 transition-all duration-300 ${getOrbStyles()}`}>
               {getOrbContent()}
               
               {/* Rings - Hide during high intensity shake to reduce noise */}
               {animationState !== 'LEGENDARY' && (
                 <>
                  <div className="absolute inset-0 border-4 border-white/20 rounded-full animate-[spin_10s_linear_infinite]"></div>
                  <div className="absolute -inset-4 border border-white/10 rounded-full animate-[spin_15s_linear_infinite_reverse]"></div>
                 </>
               )}
             </div>

             {/* Controls */}
             <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md px-6 z-20">
                <button
                  onClick={() => performPull(1)}
                  disabled={gameState.draws < 1 || isPulling}
                  className="flex-1 relative group overflow-hidden bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 rounded-xl p-4 transition-all"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-transparent translate-x-[-100%] group-hover:translate-x-100 transition-transform duration-700"></div>
                  <div className="relative flex flex-col items-center">
                    <span className="font-bold text-lg">Summon x1</span>
                    <span className="text-xs text-blue-300 mt-1">Cost: 1 Draw</span>
                  </div>
                </button>

                <button
                  onClick={() => performPull(10)}
                  disabled={gameState.draws < 10 || isPulling}
                  className="flex-1 relative group overflow-hidden bg-gradient-to-br from-purple-900 to-indigo-900 hover:from-purple-800 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed border border-purple-500/30 rounded-xl p-4 transition-all shadow-lg shadow-purple-900/20"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 to-transparent translate-x-[-100%] group-hover:translate-x-100 transition-transform duration-700"></div>
                  <div className="relative flex flex-col items-center">
                    <span className="font-bold text-lg glow-gold text-yellow-100">Summon x10</span>
                    <span className="text-xs text-yellow-300 mt-1">Cost: 10 Draws</span>
                  </div>
                </button>
             </div>

             <div className="mt-6 flex items-center gap-2 z-20">
                <label className="flex items-center gap-2 cursor-pointer text-gray-400 hover:text-white transition-colors select-none">
                  <input 
                    type="checkbox" 
                    checked={skipAnimation}
                    onChange={(e) => setSkipAnimation(e.target.checked)}
                    className="rounded bg-gray-800 border-gray-600 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm font-medium">Skip Animation</span>
                </label>
             </div>
          </div>

          {/* Store Section */}
          <StorePanel 
            currentDraws={gameState.draws} 
            activeBuffs={gameState.activeBuffs} 
            onBuy={buyBuff}
            speedUpLevel={gameState.speedUpLevel}
          />

        </div>

        {/* Right: History */}
        <div className="lg:col-span-4 h-[500px] lg:h-auto lg:sticky lg:top-24">
          <HistoryLog history={gameState.history} />
        </div>

      </div>

      {/* Result Modal */}
      {summonResults && (
        <SummonModal 
          results={summonResults} 
          onClose={() => setSummonResults(null)} 
        />
      )}

    </div>
  );
};

export default App;