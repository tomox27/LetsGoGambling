
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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

// --- Math Engine (Integrated here for access to constants if needed, though simpler to keep local) ---
// 0.95 means for every 100 draws spent, player gets back 95 on average.
const BASE_TARGET_EV = 1.0; 
const RARITY_ALPHA = 1.8; 
const POSITIVE_REWARDS = [1, 3, 5, 10];

const calculateTable = (targetEV: number, alpha: number) => {
  const weights = POSITIVE_REWARDS.map(r => 1 / Math.pow(r, alpha));
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const conditionalProbs = weights.map(w => w / sumWeights);
  const mu = POSITIVE_REWARDS.reduce((sum, r, i) => sum + (r * conditionalProbs[i]), 0);
  let S = targetEV / mu;
  if (S > 0.99) S = 0.99; 
  const pPositive = conditionalProbs.map(q => q * S);
  const pZero = 1 - S;
  return [
    { reward: 0, p: pZero },
    ...POSITIVE_REWARDS.map((r, i) => ({ reward: r, p: pPositive[i] }))
  ];
};

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
  
  // Calculate Probabilities based on current State
  const activeEV = useMemo(() => {
      const hasLuck = gameState.activeBuffs.some(b => b.type === 'LUCK');
      return hasLuck ? 1.1 : BASE_TARGET_EV;
  }, [gameState.activeBuffs]);

  const probabilityTable = useMemo(() => {
      return calculateTable(activeEV, RARITY_ALPHA);
  }, [activeEV]);

  // Persist State
  useEffect(() => {
    localStorage.setItem('drawKingSave', JSON.stringify(gameState));
  }, [gameState]);

  // --- Helpers ---
  const getCurrentRank = useCallback((highScore: number): Rank => {
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

        // Expire Buffs (Time based only)
        // Charge based buffs are handled in performPull
        const validBuffs = prev.activeBuffs.filter(b => 
          (b.durationSeconds === 0 && (b.charges === undefined || b.charges > 0)) || 
          (b.durationSeconds > 0 && b.expiresAt && b.expiresAt > now)
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
  const performPull = useCallback((cost: number, pullCount: number) => {
    if (gameState.draws < cost) return;
    if (isPulling) return;

    setIsPulling(true);
    
    // --- 1. Calculation ---
    const results: DrawResult[] = [];
    const hasDouble = gameState.activeBuffs.some(b => b.type === 'DOUBLE');
    
    // Manage Shield Logic via local copy to track charge consumption in this batch
    let shieldBuff = gameState.activeBuffs.find(b => b.type === 'SHIELD');
    let shieldCharges = shieldBuff?.charges || 0;

    let earnedDraws = 0;
    let maxRarityInBatch: AnimationState = 'COMMON';

    // Create cumulative array for weighted choice
    const cumulative: { limit: number, reward: number }[] = [];
    let sum = 0;
    for(let row of probabilityTable) {
        sum += row.p;
        cumulative.push({ limit: sum, reward: row.reward });
    }

    for (let i = 0; i < pullCount; i++) {
      const rng = Math.random(); // 0..1
      let amount = 0;
      
      for(let c of cumulative) {
          if(rng < c.limit) {
              amount = c.reward;
              break;
          }
      }
      // Safety fallthrough
      if (amount === 0 && rng >= cumulative[cumulative.length-1].limit) amount = 0; // redundant but explicit

      let wasShielded = false;
      let wasDoubled = false;

      // New Shield Logic: Guarantee return >= 1 (cost of 1 pull) if charges available
      if (shieldCharges > 0) {
          // If amount is 0, make it 1.
          // If amount is > 0, we still consume a charge because "Safety Net" is active for "next 5 spins"
          // regardless of outcome (usually how these buffs work to be consistent "charges").
          // However, the prompt says "Guarantee at least what you spent back".
          // If I naturally win 10, I spent 1, so I got what I spent back.
          // Does it consume a charge if I win naturally?
          // Prompt: "only for 5 spins". This implies charges are consumed on spin regardless of result.
          if (amount < 1) {
              amount = 1;
              wasShielded = true;
          }
          shieldCharges--;
      }

      // Double Logic
      if (amount > 0 && hasDouble && Math.random() < 0.1) {
        amount *= 2;
        wasDoubled = true;
      }

      earnedDraws += amount;
      
      let rarity = amount >= 10 ? Rarity.LEGENDARY : amount >= 5 ? Rarity.RARE : Rarity.COMMON;
      if (amount >= 10 && maxRarityInBatch !== 'LEGENDARY') maxRarityInBatch = 'LEGENDARY';
      else if (amount >= 5 && maxRarityInBatch !== 'LEGENDARY' && maxRarityInBatch !== 'RARE') maxRarityInBatch = 'RARE';

      results.push({
        id: Math.random().toString(36).substr(2, 9),
        amount,
        rarity,
        timestamp: Date.now(),
        wasDoubled,
        wasShielded
      });
    }

    setAnimationState(maxRarityInBatch);

    const delay = skipAnimation ? 100 : 1500;

    setTimeout(() => {
      setGameState(prev => {
        // Update buffs state (decrement charges)
        const newActiveBuffs = prev.activeBuffs.map(b => {
             if (b.type === 'SHIELD') {
                 return { ...b, charges: shieldCharges };
             }
             return b;
        }).filter(b => {
            // Remove if it was a charge buff and now has 0 charges
            // Note: We keep time-based buffs even if "charges" logic might be added later, but here specifically handling Shield
            if (b.type === 'SHIELD' && (b.charges !== undefined && b.charges <= 0)) return false;
            return true;
        });

        const newDraws = prev.draws - cost + earnedDraws;
        return {
          ...prev,
          draws: newDraws,
          highestDraws: Math.max(prev.highestDraws, newDraws),
          stats: {
            totalPulls: prev.stats.totalPulls + pullCount,
            totalEarned: prev.stats.totalEarned + earnedDraws
          },
          history: [...results.reverse(), ...prev.history].slice(0, 50),
          activeBuffs: newActiveBuffs
        };
      });

      if (!skipAnimation) {
        setSummonResults(results);
      }
      setIsPulling(false);
      setAnimationState('IDLE');

    }, delay);
  }, [gameState.draws, gameState.activeBuffs, isPulling, skipAnimation, probabilityTable]);

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
        const newBuff = { 
            ...buff, 
            expiresAt: buff.durationSeconds > 0 ? Date.now() + (buff.durationSeconds * 1000) : undefined 
        };
        
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
             {/* Timer - Updated to fit perfectly with viewBox */}
            <div className="relative group overflow-visible w-10 h-10">
              <svg className="w-full h-full -rotate-90 drop-shadow-md" viewBox="0 0 44 44">
                 <circle cx="22" cy="22" r="18" stroke="rgba(255,255,255,0.1)" strokeWidth="4" fill="transparent" />
                 <circle cx="22" cy="22" r="18" stroke="currentColor" strokeWidth="4" fill="transparent" 
                    className="text-purple-500 transition-all duration-1000 ease-linear"
                    strokeDasharray={113.1} // 2 * pi * 18
                    strokeDashoffset={113.1 - (gameState.timeToNextDraw / getInterval()) * 113.1}
                    strokeLinecap="round" 
                 />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold pointer-events-none">
                {gameState.timeToNextDraw}
              </span>
              <div className="absolute top-10 right-0 bg-black/90 p-2 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10 z-50">
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
          
          {/* Active Buffs Bar (Hidden if empty) */}
          {gameState.activeBuffs.length > 0 && (
            <div className="w-full flex gap-3 mb-6 overflow-x-auto pb-2 custom-scrollbar min-h-[60px]">
              {gameState.activeBuffs.map(buff => {
                 const timeLeft = buff.expiresAt ? Math.ceil((buff.expiresAt - Date.now()) / 1000) : null;
                 const isPermanent = buff.durationSeconds === 0;
                 // Don't hide charge buffs even if time is 0 (since they are perm until used)
                 if (!isPermanent && timeLeft !== null && timeLeft <= 0) return null;
                 
                 return (
                  <div key={buff.id} className="flex items-center gap-2 bg-purple-900/20 border border-purple-500/30 rounded-full px-4 py-1.5 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2">
                    <span>{buff.icon}</span>
                    <span className="text-sm font-bold text-purple-200">{buff.name}</span>
                    {timeLeft && <span className="text-xs font-mono text-purple-400 w-8">{timeLeft}s</span>}
                    {buff.charges !== undefined && <span className="text-xs font-mono text-blue-400 font-bold">x{buff.charges}</span>}
                  </div>
                 );
              })}
            </div>
          )}

          {/* Summoning Altar */}
          {/* Added overflow-visible and improved padding/sizing logic to prevent cutoffs */}
          <div className="relative w-full max-w-xl min-h-[420px] bg-black/30 rounded-3xl border border-white/5 flex flex-col items-center justify-center p-10 mb-8 group overflow-visible">
             {/* Decor (Clipped inside only) */}
             <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-0">
                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent opacity-50"></div>
             </div>
             
             {/* The Orb */}
             <div className={`relative z-10 w-48 h-48 rounded-full flex items-center justify-center mb-8 transition-all duration-300 ${getOrbStyles()}`}>
               {getOrbContent()}
               
               {animationState !== 'LEGENDARY' && (
                 <>
                  <div className="absolute inset-0 border-4 border-white/20 rounded-full animate-[spin_10s_linear_infinite]"></div>
                  <div className="absolute -inset-4 border border-white/10 rounded-full animate-[spin_15s_linear_infinite_reverse]"></div>
                 </>
               )}
             </div>

             {/* Controls */}
             <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md z-20">
                <button
                  onClick={() => performPull(1, 1)}
                  disabled={gameState.draws < 1 || isPulling}
                  className="flex-1 relative group overflow-hidden bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 rounded-xl p-4 transition-all active:scale-95"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-transparent translate-x-[-100%] group-hover:translate-x-100 transition-transform duration-700"></div>
                  <div className="relative flex flex-col items-center">
                    <span className="font-bold text-lg">Summon x1</span>
                    <span className="text-xs text-blue-300 mt-1">Cost: 1 Draw</span>
                  </div>
                </button>

                <button
                  onClick={() => performPull(10, 10)}
                  disabled={gameState.draws < 10 || isPulling}
                  className="flex-1 relative group overflow-hidden bg-gradient-to-br from-purple-900 to-indigo-900 hover:from-purple-800 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed border border-purple-500/30 rounded-xl p-4 transition-all shadow-lg shadow-purple-900/20 active:scale-95"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 to-transparent translate-x-[-100%] group-hover:translate-x-100 transition-transform duration-700"></div>
                  <div className="relative flex flex-col items-center">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-lg glow-gold text-yellow-100">Summon x10</span>
                    </div>
                    <span className="text-xs text-yellow-300 mt-1">Cost: 10 Draws</span>
                  </div>
                </button>
             </div>

             {/* Checkbox Toggle UI */}
             <div 
               className="flex items-center gap-2 group cursor-pointer select-none mt-6 z-20"
               onClick={() => setSkipAnimation(!skipAnimation)}
             >
               <div className="relative flex items-center cursor-pointer">
                 <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={skipAnimation} 
                    readOnly 
                 />
                 <div className="w-5 h-5 bg-[#1a102e] border border-blue-400/50 rounded flex items-center justify-center transition-all duration-200 peer-checked:bg-blue-500 peer-checked:border-blue-500 shadow-[0_0_10px_rgba(96,165,250,0.2)]">
                   <svg className="hidden peer-checked:block w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                   </svg>
                 </div>
               </div>
               <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                 Skip Animations
               </span>
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
