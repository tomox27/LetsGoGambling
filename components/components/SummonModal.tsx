import React, { useEffect, useState } from 'react';
import { DrawResult, Rarity } from '../types';
import { RARITY_COLORS } from '../constants';

interface SummonModalProps {
  results: DrawResult[];
  onClose: () => void;
}

export const SummonModal: React.FC<SummonModalProps> = ({ results, onClose }) => {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    // Staggered reveal effect
    if (revealedCount < results.length) {
      const timer = setTimeout(() => {
        setRevealedCount(prev => prev + 1);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [revealedCount, results.length]);

  // Determine highest rarity for the glow effect
  const highestRarity = results.some(r => r.rarity === Rarity.LEGENDARY) 
    ? Rarity.LEGENDARY 
    : results.some(r => r.rarity === Rarity.RARE)
      ? Rarity.RARE
      : Rarity.COMMON;

  const glowColor = highestRarity === Rarity.LEGENDARY ? 'shadow-yellow-500/20' : highestRarity === Rarity.RARE ? 'shadow-purple-500/20' : 'shadow-blue-500/20';
  const borderColor = highestRarity === Rarity.LEGENDARY ? 'border-yellow-500/50' : highestRarity === Rarity.RARE ? 'border-purple-500/50' : 'border-blue-500/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`relative w-full max-w-2xl bg-[#1a102e] rounded-2xl p-8 border-2 ${borderColor} shadow-2xl ${glowColor}`}>
        
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white uppercase tracking-widest glow-text">
            Summon Complete
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {results.map((res, idx) => (
            <div 
              key={res.id}
              className={`
                aspect-square flex flex-col items-center justify-center rounded-xl border-2 transition-all duration-500
                ${idx < revealedCount ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 rotate-12'}
                ${RARITY_COLORS[res.rarity]}
              `}
            >
              <div className="text-2xl font-bold mb-1">
                {res.amount > 0 ? `+${res.amount}` : '0'}
              </div>
              <div className="text-[10px] uppercase font-bold opacity-75">
                {res.rarity === Rarity.LEGENDARY ? 'LEGEND' : res.rarity}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-white text-black font-bold uppercase tracking-widest rounded hover:bg-gray-200 hover:scale-105 transition-all"
          >
            Collect
          </button>
        </div>
      </div>
    </div>
  );
};