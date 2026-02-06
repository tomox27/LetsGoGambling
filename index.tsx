import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// --- TYPES ---
export enum Rarity {
  COMMON = 'COMMON', // +0, +1, +3
  RARE = 'RARE',     // +5
  LEGENDARY = 'LEGENDARY' // +10
}

export interface DrawResult {
  id: string;
  amount: number;
  rarity: Rarity;
  timestamp: number;
  wasDoubled?: boolean;
  wasShielded?: boolean;
}

export interface Buff {
  id: string;
  name: string;
  description: string;
  durationSeconds: number; // 0 if permanent (like upgrades)
  expiresAt?: number; // timestamp
  charges?: number; // Number of uses (optional)
  cost: number;
  icon: string;
  type: 'LUCK' | 'SPEED' | 'DOUBLE' | 'SHIELD';
}

export interface Rank {
  threshold: number;
  title: string;
}

export interface GameState {
  draws: number;
  highestDraws: number;
  history: DrawResult[];
  activeBuffs: Buff[];
  speedUpLevel: number;
  lastFreeDrawTime: number;
  timeToNextDraw: number;
  stats: {
    totalPulls: number;
    totalEarned: number;
  }
}

// --- CONSTANTS ---
export const BASE_FREE_DRAW_INTERVAL = 60; // seconds
export const MIN_FREE_DRAW_INTERVAL = 10; // seconds

export const RANKS: Rank[] = [
  { threshold: 0, title: "Beggar" },
  { threshold: 10, title: "Rookie Roller" },
  { threshold: 25, title: "Coin Flipper" },
  { threshold: 50, title: "Slot Squire" },
  { threshold: 100, title: "Dice Dealer" },
  { threshold: 200, title: "Pit Boss" },
  { threshold: 350, title: "High Roller" },
  { threshold: 500, title: "Jackpot Baron" },
  { threshold: 750, title: "Royal Gambler" },
  { threshold: 1000, title: "Immortal Draw King" },
  { threshold: 1500, title: "Mythic House" },
  { threshold: 2500, title: "Gacha God" },
  { threshold: 5000, title: "Entropy Master" },
];

export const AVAILABLE_BUFFS: Buff[] = [
  {
    id: 'luck_boost',
    name: 'Fortune\'s Favor',
    description: 'Increases EV to 1.1 (More wins) for 30 seconds.',
    durationSeconds: 30,
    cost: 50,
    icon: '✨',
    type: 'LUCK'
  },
  {
    id: 'speed_upgrade',
    name: 'Time Warp',
    description: 'Permanently reduce time for free draw by 1s (Max -50s).',
    durationSeconds: 0, // Permanent
    cost: 10,
    icon: '⏳',
    type: 'SPEED'
  },
  {
    id: 'double_reward',
    name: 'Double Down',
    description: '10% chance to double any positive draw reward for 30 seconds.',
    durationSeconds: 30,
    cost: 30,
    icon: '🎲',
    type: 'DOUBLE'
  },
  {
    id: 'streak_shield',
    name: 'Safety Net',
    description: 'Guarantees at least 1 draw return for the next 5 spins.',
    durationSeconds: 0, // Charge based
    charges: 5,
    cost: 25,
    icon: '🛡️',
    type: 'SHIELD'
  }
];

export const RARITY_COLORS = {
  [Rarity.COMMON]: 'text-blue-400 border-blue-400/30 bg-blue-500/10 shadow-blue-500/20',
  [Rarity.RARE]: 'text-purple-400 border-purple-400/30 bg-purple-500/10 shadow-purple-500/20',
  [Rarity.LEGENDARY]: 'text-yellow-400 border-yellow-400/30 bg-yellow-500/10 shadow-yellow-500/20',
};

// --- COMPONENTS ---

const HistoryLog: React.FC<{ history: DrawResult[] }> = ({ history }) => {
  return (
    <div className="glass rounded-xl p-4 h-full flex flex-col w-full h-[500px] lg:h-auto overflow-hidden">
      <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4 border-b border-white/10 pb-2">
        Pull History
      </h3>
      <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
        {history.length === 0 && (
          <div className="text-center text-gray-600 text-sm py-4">No draws yet...</div>
        )}
        {history.map((item) => {
            let containerClass = "flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 opacity-60 hover:opacity-100";
            let iconBg = "bg-white/5";
            let iconColor = "text-gray-500";
            let iconName = "close";
            let textColor = "text-gray-300";

            if (item.rarity === Rarity.LEGENDARY) {
                containerClass = "relative group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/20 hover:border-yellow-500/50 transition-all cursor-pointer opacity-100";
                iconBg = "bg-yellow-500/10 shadow-[0_0_10px_rgba(255,215,0,0.2)]";
                iconColor = "text-yellow-500 drop-shadow-[0_0_5px_rgba(255,215,0,0.8)]";
                iconName = "diamond";
                textColor = "text-yellow-500 glow-gold";
            } else if (item.rarity === Rarity.RARE) {
                containerClass = "relative group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-transparent border border-purple-500/20 hover:border-purple-500/50 transition-all cursor-pointer opacity-100";
                iconBg = "bg-purple-500/10 shadow-[0_0_10px_rgba(139,92,246,0.2)]";
                iconColor = "text-purple-500 drop-shadow-[0_0_5px_rgba(139,92,246,0.8)]";
                iconName = "bolt";
                textColor = "text-purple-500 glow-text";
            }

            return (
                <div key={item.id} className={containerClass}>
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
                    <span className={`material-symbols-outlined ${iconColor} text-sm md:text-xl`}>{iconName}</span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className={`text-sm font-bold truncate ${textColor}`}>
                        {item.amount > 0 ? (item.amount >= 10 ? "Jackpot Prize" : "Lucky Find") : "Empty Box"}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-2">
                        <span>{item.rarity === Rarity.LEGENDARY ? 'Mythic' : item.rarity === Rarity.RARE ? 'Epic' : 'Common'}</span>
                        {item.wasDoubled && <span className="text-yellow-500 font-bold">x2</span>}
                        {item.wasShielded && <span className="text-blue-400 font-bold">Shield</span>}
                    </div>
                </div>
                <span className={`text-sm font-mono font-bold ${item.amount > 0 ? textColor : 'text-gray-500'}`}>
                    +{item.amount}
                </span>
                </div>
            );
        })}
      </div>
    </div>
  );
};

const StorePanel: React.FC<{ 
    currentDraws: number; 
    activeBuffs: Buff[]; 
    onBuy: (buff: Buff) => void;
    speedUpLevel: number;
}> = ({ currentDraws, activeBuffs, onBuy, speedUpLevel }) => {
  const isBuffActive = (buffId: string) => activeBuffs.some(b => b.id === buffId);

  // Mock images for UI
  const CARD_IMAGES: Record<string, string> = {
      'luck_boost': 'https://lh3.googleusercontent.com/aida-public/AB6AXuCTuSygomkFlTLHR7mdj6_X4G11k6-XkMWePXrQ3EN9qjX_TiI3UNqjdg1TcKJaRCBqrJGmEa2r_x_jlH3yxUA9J02kNpLlqNF_q1XXD9ubyIBvdBll-pebOvKinNC88vxeGm1XCioIAwkNxIu82kNQ8Ig7Y-yYMP7kW1ayKBxFcmwBm475YzCdfQ4OT-I9tF4Bg7vQM0LTgZvop7_v6aCpI1VAFqwvZbb5MqthtV70XeXAOnfntH1fJY5FxW4Zj7AJHD44WO0EurYG',
      'speed_upgrade': 'https://lh3.googleusercontent.com/aida-public/AB6AXuCRWSAC30w_C24_OJhIEOr9HUi9c7tNMpn2idYh7WztRgIKK8AcZM4ciQlYCvJu72EIfNbd56fc6vbu5EvdFZqPRit1XDPrDpHGMZDqaIP2yg9nVC1KkJ3g0lfHySCLKe1SjZwaRpFZCRQfFCJqfGs_g2e3BjlJfBWXsUgDaIPCEaYaal1Q_kugr1ZswuRta0hp4YTdysSI2wdb2fKf67JXrrPKaoJZ1keaB2LMbpv2lU86ou2ENwXehSFi8bDj-ombWV28h-kDovIM',
      'double_reward': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAqV0JYwHZeZGzI0gztLG6K-jp2NXZy2INzfsHp1cR5MSu7LiDabgbmKr1l6Ad7iSnfiIeGCjJxQxMPVNthBns6sglBe3ClIjsSObu-ZRgtrLg5q9BSVz_VNV6_kuF0gMWau-bDh_JVvrfXXr2UiqtIsiZNZ-_FPw8EDLuAGTfRYeL449ZoO6oJ8Iu6SRMc_TqBB-3SFmLO0rroPXsDVSwIVwIq3bSIzAl8ZeTyAfdlKBBh-UFoXkomsVy7Inp8dkrT1fWn6Rx12At4',
      'streak_shield': 'https://lh3.googleusercontent.com/aida-public/AB6AXuB8Okudn0728LIsYO4ZidCT86oF93XbovL4dkeNfK6YnyyY14VZqlyoIz1PZPeumObwqJlKZKSimxe8h8aJogJnZ9JIPHXEdeYdpJ-VVknpsNdE2td_Q4CTMcjxMKgVe_pKClB8tUhmHkBKp2Weur0OxbL45Bs0O5u5iH5vhX96DFhfmb9HjVLJA00gFYXQv7GJP10GKX2atJBM1sS-PAluWaJ8a0rQZBQdN34gVejuJXXmDOcNHPr_cRA6Ilk5nf5pThneCNjaGzTO'
  };

  const CARD_RARITY: Record<string, string> = {
      'luck_boost': 'Rare',
      'speed_upgrade': 'Epic',
      'double_reward': 'Legendary',
      'streak_shield': 'Common'
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between mb-10">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-accent-gold text-4xl">storefront</span>
            <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">The Vault</span>
          </h2>
          <p className="text-gray-400 text-sm max-w-md">Exchange your hard-earned draws for powerful enhancements.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {AVAILABLE_BUFFS.map(buff => {
          const isActive = isBuffActive(buff.id);
          const canAfford = currentDraws >= buff.cost;
          const isSpeedUp = buff.type === 'SPEED';
          
          let buttonText = "Purchase";
          if (isActive && !isSpeedUp) buttonText = "Active";
          if (!canAfford && !isActive) buttonText = "Need Draws";

          const bgImage = CARD_IMAGES[buff.id];
          const rarity = CARD_RARITY[buff.id];
          const rarityColor = rarity === 'Legendary' ? 'text-yellow-400 border-yellow-400/50 shadow-neon-gold' : rarity === 'Rare' ? 'text-purple-400 border-purple-400/40 shadow-neon-purple' : 'text-gray-300 border-white/20';
          const glowText = rarity === 'Legendary' ? 'glow-gold group-hover:text-yellow-400' : 'group-hover:text-purple-400 glow-text';

          return (
             <div key={buff.id} className={`holo-card rounded-2xl flex flex-col h-full group ${isActive ? 'opacity-75' : ''}`}>
                <div className="h-40 bg-cover bg-center relative" style={{backgroundImage: `url('${bgImage}')`}}>
                   <div className="absolute inset-0 bg-gradient-to-t from-[#1a1025] via-transparent to-transparent"></div>
                   <div className={`absolute top-3 right-3 bg-black/40 backdrop-blur-md rounded px-2 py-1 border ${rarityColor}`}>
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${rarity === 'Legendary' ? 'text-yellow-400' : 'text-gray-300'}`}>{rarity}</span>
                   </div>
                </div>
                
                <div className="p-6 flex flex-col flex-grow relative">
                   <div className="mb-4">
                      <h3 className={`text-xl font-bold text-white mb-2 transition-colors ${glowText}`}>{buff.name}</h3>
                      <p className="text-xs text-gray-400 leading-relaxed font-light">
                        {buff.description}
                        {isSpeedUp && <span className="block mt-1 text-purple-300">Current Level: {speedUpLevel}</span>}
                      </p>
                   </div>
                   
                   <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-white">
                         <span className="material-symbols-outlined text-sm text-primary">token</span>
                         <span className="font-bold text-lg">{buff.cost}</span>
                      </div>
                      
                      <button
                         onClick={() => onBuy(buff)}
                         disabled={!canAfford || (isActive && !isSpeedUp)}
                         className={`text-[10px] uppercase font-bold py-2.5 px-5 rounded-lg transition-all transform active:scale-95 shadow-lg border border-white/10
                            ${!canAfford && !isActive
                               ? 'bg-white/5 text-gray-500 cursor-not-allowed' 
                               : (isActive && !isSpeedUp)
                                  ? 'bg-green-900/20 text-green-400 border-green-500/30 cursor-default'
                                  : 'bg-primary hover:bg-primary-dark hover:shadow-neon-purple text-white'
                             }
                         `}
                      >
                         {buttonText}
                      </button>
                   </div>
                </div>
             </div>
          );
        })}
      </div>
    </div>
  );
};

const SummonModal: React.FC<{ results: DrawResult[]; onClose: () => void; }> = ({ results, onClose }) => {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (revealedCount < results.length) {
      const timer = setTimeout(() => {
        setRevealedCount(prev => prev + 1);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [revealedCount, results.length]);

  const highestRarity = results.some(r => r.rarity === Rarity.LEGENDARY) 
    ? Rarity.LEGENDARY 
    : results.some(r => r.rarity === Rarity.RARE)
      ? Rarity.RARE
      : Rarity.COMMON;

  const glowColor = highestRarity === Rarity.LEGENDARY ? 'shadow-neon-gold border-yellow-500/50' : highestRarity === Rarity.RARE ? 'shadow-neon-purple border-purple-500/50' : 'shadow-neon-cyan border-cyan-500/50';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200">
      <div className={`relative w-full max-w-2xl bg-[#1a102e] rounded-3xl p-8 border-2 ${glowColor} shadow-2xl`}>
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden rounded-3xl pointer-events-none">
             <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle,_transparent_20%,_#000_120%)] opacity-50"></div>
        </div>

        <div className="text-center mb-8 relative z-10">
          <h2 className="text-4xl font-black text-white uppercase tracking-widest glow-text italic">
            Summon Complete
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-white to-transparent mx-auto mt-4"></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8 relative z-10">
          {results.map((res, idx) => {
            let itemColor = "border-gray-700 bg-gray-800/50 text-gray-300";
            if (res.rarity === Rarity.LEGENDARY) itemColor = "border-yellow-500 bg-yellow-500/10 text-yellow-500 shadow-[0_0_15px_rgba(255,215,0,0.3)]";
            else if (res.rarity === Rarity.RARE) itemColor = "border-purple-500 bg-purple-500/10 text-purple-500 shadow-[0_0_15px_rgba(139,92,246,0.3)]";

            return (
              <div 
                key={res.id}
                className={`
                  aspect-square flex flex-col items-center justify-center rounded-xl border transition-all duration-500
                  ${idx < revealedCount ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 rotate-12'}
                  ${itemColor}
                `}
              >
                <div className="text-3xl font-black mb-1">
                  {res.amount > 0 ? `+${res.amount}` : '0'}
                </div>
                <div className="text-[10px] uppercase font-bold opacity-75 tracking-wider">
                  {res.rarity === Rarity.LEGENDARY ? 'LEGEND' : res.rarity}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-center relative z-10">
          <button 
            onClick={onClose}
            className="crystal-btn px-10 py-4 text-white font-bold uppercase tracking-[0.2em] rounded-xl hover:scale-105 transition-all"
          >
            Collect
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP ---

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

// Math Logic
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
  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = localStorage.getItem('drawKingSave');
    return saved ? JSON.parse(saved) : INITIAL_STATE;
  });

  const [skipAnimation, setSkipAnimation] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [animationState, setAnimationState] = useState<AnimationState>('IDLE');
  const [summonResults, setSummonResults] = useState<DrawResult[] | null>(null);
  
  const activeEV = useMemo(() => {
      const hasLuck = gameState.activeBuffs.some(b => b.type === 'LUCK');
      return hasLuck ? 1.1 : BASE_TARGET_EV;
  }, [gameState.activeBuffs]);

  const probabilityTable = useMemo(() => {
      return calculateTable(activeEV, RARITY_ALPHA);
  }, [activeEV]);

  useEffect(() => {
    localStorage.setItem('drawKingSave', JSON.stringify(gameState));
  }, [gameState]);

  const getCurrentRank = useCallback((highScore: number): Rank => {
    const rank = [...RANKS].reverse().find(r => highScore >= r.threshold);
    return rank || RANKS[0];
  }, []);

  const getRankProgress = useCallback((highScore: number) => {
    const rankIndex = [...RANKS].findIndex(r => highScore < r.threshold);
    if (rankIndex === -1) return 100;
    const nextRank = RANKS[rankIndex];
    const prevRank = RANKS[rankIndex - 1] || RANKS[0];
    const total = nextRank.threshold - prevRank.threshold;
    const current = highScore - prevRank.threshold;
    return Math.min(100, Math.max(0, (current / total) * 100));
  }, []);

  const getInterval = useCallback(() => {
    const reduced = BASE_FREE_DRAW_INTERVAL - gameState.speedUpLevel;
    return Math.max(MIN_FREE_DRAW_INTERVAL, reduced);
  }, [gameState.speedUpLevel]);

  useEffect(() => {
    const timer = setInterval(() => {
      setGameState(prev => {
        const now = Date.now();
        const currentInterval = Math.max(MIN_FREE_DRAW_INTERVAL, BASE_FREE_DRAW_INTERVAL - prev.speedUpLevel);
        
        let newTimeToNext = prev.timeToNextDraw - 1;
        let newDraws = prev.draws;
        let newLastFree = prev.lastFreeDrawTime;
        let newHighest = prev.highestDraws;

        if (newTimeToNext <= 0) {
          newDraws += 1;
          newHighest = Math.max(newHighest, newDraws);
          newTimeToNext = currentInterval;
          newLastFree = now;
        }

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

  const performPull = useCallback((cost: number, pullCount: number) => {
    if (gameState.draws < cost) return;
    if (isPulling) return;

    setIsPulling(true);
    
    const results: DrawResult[] = [];
    const hasDouble = gameState.activeBuffs.some(b => b.type === 'DOUBLE');
    let shieldBuff = gameState.activeBuffs.find(b => b.type === 'SHIELD');
    let shieldCharges = shieldBuff?.charges || 0;

    let earnedDraws = 0;
    let maxRarityInBatch: AnimationState = 'COMMON';

    const cumulative: { limit: number, reward: number }[] = [];
    let sum = 0;
    for(let row of probabilityTable) {
        sum += row.p;
        cumulative.push({ limit: sum, reward: row.reward });
    }

    for (let i = 0; i < pullCount; i++) {
      const rng = Math.random();
      let amount = 0;
      for(let c of cumulative) {
          if(rng < c.limit) {
              amount = c.reward;
              break;
          }
      }
      if (amount === 0 && rng >= cumulative[cumulative.length-1].limit) amount = 0;

      let wasShielded = false;
      let wasDoubled = false;

      if (shieldCharges > 0) {
          if (amount < 1) {
              amount = 1;
              wasShielded = true;
          }
          shieldCharges--;
      }

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
        const newActiveBuffs = prev.activeBuffs.map(b => {
             if (b.type === 'SHIELD') return { ...b, charges: shieldCharges };
             return b;
        }).filter(b => {
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

  const buyBuff = (buff: Buff) => {
    if (gameState.draws < buff.cost) return;

    setGameState(prev => {
      const active = [...prev.activeBuffs];
      let speedLevel = prev.speedUpLevel;

      if (buff.type === 'SPEED') {
        if (speedLevel < 50) speedLevel += 1;
        else return prev;
      } else {
        const existingIdx = active.findIndex(b => b.id === buff.id);
        const newBuff = { 
            ...buff, 
            expiresAt: buff.durationSeconds > 0 ? Date.now() + (buff.durationSeconds * 1000) : undefined 
        };
        if (existingIdx >= 0) active[existingIdx] = newBuff;
        else active.push(newBuff);
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
  const rankProgress = getRankProgress(gameState.highestDraws);

  const getOrbAnimation = () => {
     if (isPulling) {
        if (animationState === 'LEGENDARY') return 'animate-shake-gold';
        return 'animate-pulse-purple';
     }
     return 'animate-float';
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/10 px-6 py-3 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2 group cursor-pointer">
              <span className="material-symbols-outlined text-yellow-500 text-3xl animate-pulse">crown</span>
              <span className="text-2xl font-bold tracking-tight italic bg-gradient-to-r from-yellow-400 via-white to-yellow-500 bg-clip-text text-transparent">
                DRAW KING
              </span>
            </div>
            
            <div className="flex flex-col gap-1 min-w-[140px]">
              <div className="flex justify-between items-end">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Rank: {currentRank.title}</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden relative border border-white/5">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-cyan-500" style={{width: `${rankProgress}%`}}></div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 md:gap-10">
            <div className="flex items-center gap-6 bg-white/5 px-6 py-2 rounded-full border border-white/5 backdrop-blur-sm">
              <div className="flex flex-col items-center group cursor-pointer">
                <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Balance</span>
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-purple-400">token</span>
                  <span className="text-2xl font-bold text-white leading-none tracking-tight shadow-neon-purple drop-shadow-md">
                    {gameState.draws}
                  </span>
                </div>
              </div>
              <div className="h-8 w-px bg-white/10"></div>
              <div className="flex flex-col items-center group cursor-pointer">
                <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Record</span>
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold text-gray-300 leading-none">
                     {gameState.highestDraws}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 pl-4 border-l border-white/10">
              <div className="text-right hidden sm:block">
                <div className="text-[9px] text-cyan-400 font-bold uppercase tracking-widest">Free Draw</div>
                <div className="text-xs text-gray-400">Refills in</div>
              </div>
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path className="text-white/10" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3"></path>
                  <path 
                    className="text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)] transition-all duration-1000 linear" 
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeDasharray={`${(gameState.timeToNextDraw / getInterval()) * 100}, 100`} 
                    strokeLinecap="round" 
                    strokeWidth="3"
                  ></path>
                </svg>
                <span className="text-sm font-bold text-white animate-pulse">{gameState.timeToNextDraw}s</span>
              </div>
            </div>
            
            <div className="w-10 h-10 rounded-full bg-cover bg-center ring-2 ring-yellow-500/50 cursor-pointer hover:ring-yellow-500 transition-all shadow-neon-gold" style={{backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDRK3lrGjxlgfQWF4X_-PowYqhBmx5rBxUxERjzQSzH9yx2akSWCEnZDPE73apiQ0saORg44XOHH_qvKadE4gLURIbejpqgU7VQ7OUlCBWOWGF1zFawELyXNb8htsqu_21C_KUvE-rxeBeN1QIjRiWClKGWOii7bBj81hVvoniwwOS8wP3ZOwjKi1jj490F3Ozw4PYwRcVOvmG8-3Ndh-BvQCS7fOtun3YzSxypg3xAytppkIlFPLxjH862a-UAtHcyzr2YFvx1i7yC')"}}></div>
          </div>
        </div>
      </header>

      <main className="flex-grow pt-28 px-6 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 relative pb-12">
        
        {/* Main Game Section */}
        <section className="lg:col-span-9 flex flex-col items-center justify-start relative z-10">
          
          {/* Buffs */}
          <div className="w-full flex justify-center gap-6 mb-12 relative z-20">
            {gameState.activeBuffs.map(buff => {
                const timeLeft = buff.expiresAt ? Math.ceil((buff.expiresAt - Date.now()) / 1000) : null;
                const isEnding = timeLeft && timeLeft < 10;
                
                return (
                  <div key={buff.id} className="group flex items-center gap-3 bg-black/40 px-3 py-2 pr-5 rounded-full border border-purple-500/30 backdrop-blur-md hover:border-purple-500 transition-colors cursor-help animate-in fade-in slide-in-from-top-4">
                    <div className="relative w-10 h-10 flex items-center justify-center">
                       <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                          <path className="text-gray-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2"></path>
                          <path className={`text-yellow-400 drop-shadow-[0_0_3px_#ffd700] ${isEnding ? 'text-red-500' : ''}`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray="100, 100" strokeWidth="2"></path>
                       </svg>
                       <span className="text-xl">{buff.icon}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{buff.name}</span>
                      {timeLeft && <span className="text-xs text-white font-mono">{Math.floor(timeLeft/60)}m {timeLeft%60}s</span>}
                      {buff.charges !== undefined && <span className="text-xs text-blue-400 font-mono font-bold">x{buff.charges}</span>}
                      {!timeLeft && buff.charges === undefined && <span className="text-xs text-white font-mono">Permanent</span>}
                    </div>
                  </div>
                )
            })}
          </div>

          <div className="relative w-full max-w-3xl flex flex-col items-center">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"></div>

             <div className={`relative mb-16 z-10 group cursor-pointer ${getOrbAnimation()}`}>
                <div className="orb-container">
                    <div className="orb-ring-gold"></div>
                    <div className="orb-ring-outer"></div>
                    <div className="orb-nebula"></div>
                    
                    {animationState === 'LEGENDARY' && (
                        <>
                           {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
                               <div key={deg} className="win-streak" style={{transform: `rotate(${deg}deg) translate(0, -160px)`}}></div>
                           ))}
                        </>
                    )}

                    <div className="relative z-10 flex flex-col items-center justify-center rounded-full p-8">
                        <div className="crystal-icon-wrapper">
                            <div className="crystal-icon-glow"></div>
                            <span className="material-symbols-outlined crystal-icon-main" style={{fontVariationSettings: "'FILL' 1, 'wght' 200, 'GRAD' 0, 'opsz' 48"}}>
                                {animationState === 'LEGENDARY' ? 'diamond' : animationState === 'RARE' ? 'bolt' : 'diamond'}
                            </span>
                        </div>
                        {animationState === 'LEGENDARY' && (
                            <span className="text-[12px] text-yellow-400 font-bold uppercase tracking-[0.3em] mt-2 opacity-100 animate-pulse shadow-glow">Legendary!</span>
                        )}
                    </div>
                </div>
             </div>

             <div className="w-full grid grid-cols-2 gap-8 relative z-10 max-w-lg">
                <button 
                   onClick={() => performPull(1, 1)}
                   disabled={gameState.draws < 1 || isPulling}
                   className="crystal-btn group rounded-xl p-0.5"
                >
                   <div className="bg-[#1a0b2e]/90 h-full w-full rounded-[10px] p-4 flex flex-col items-center gap-1 group-hover:bg-[#250f40]/90 transition-colors">
                      <span className="text-lg font-bold text-white tracking-widest uppercase">Summon x1</span>
                      <div className="w-full h-px bg-white/10 my-1"></div>
                      <div className="flex items-center gap-2 text-purple-200">
                         <span className="material-symbols-outlined text-sm">token</span>
                         <span className="font-mono font-bold text-white text-lg">1</span>
                      </div>
                   </div>
                </button>

                <button 
                   onClick={() => performPull(10, 10)}
                   disabled={gameState.draws < 10 || isPulling}
                   className="crystal-btn group rounded-xl p-0.5 border-yellow-500/50 shadow-neon-gold"
                >
                   <div className="bg-gradient-to-b from-[#2d1b4e] to-[#1a0b2e] h-full w-full rounded-[10px] p-4 flex flex-col items-center gap-1 group-hover:brightness-110 transition-all">
                      <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 tracking-widest uppercase glow-text-gold">Summon x10</span>
                      <div className="w-full h-px bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent my-1"></div>
                      <div className="flex items-center gap-2 text-yellow-500">
                         <span className="material-symbols-outlined text-sm">token</span>
                         <span className="font-mono font-bold text-white text-lg">10</span>
                      </div>
                   </div>
                </button>
             </div>

             <div className="mt-12 flex items-center justify-center gap-4 bg-transparent p-0">
                <label className="custom-checkbox flex items-center gap-3 cursor-pointer group select-none">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={skipAnimation}
                        onChange={() => setSkipAnimation(!skipAnimation)}
                    />
                    <div className="w-6 h-6 border-[2.5px] border-[#60a5fa] rounded bg-white/5 peer-hover:bg-white/10 flex items-center justify-center transition-all duration-200">
                        <svg className="w-4 h-4 text-[#3b82f6] transition-all duration-200" style={{opacity: skipAnimation ? 1 : 0, transform: skipAnimation ? 'scale(1)' : 'scale(0.5)'}} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" viewBox="0 0 24 24">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">Skip Animations</span>
                </label>
             </div>
          </div>
        </section>

        <aside className="lg:col-span-3 h-full max-h-[600px] lg:max-h-none flex flex-col relative z-0">
           <HistoryLog history={gameState.history} />
        </aside>

      </main>

      <section className="bg-[#0b0312] border-t border-white/5 px-6 py-16 relative">
         <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
         <StorePanel 
            currentDraws={gameState.draws}
            activeBuffs={gameState.activeBuffs}
            onBuy={buyBuff}
            speedUpLevel={gameState.speedUpLevel}
         />
      </section>

      {summonResults && (
        <SummonModal 
          results={summonResults} 
          onClose={() => setSummonResults(null)} 
        />
      )}
    </>
  );
};

// Render
const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);