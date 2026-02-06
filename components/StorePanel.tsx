import React from 'react';
import { Buff } from '../types';
import { AVAILABLE_BUFFS } from '../constants';

interface StorePanelProps {
  currentDraws: number;
  activeBuffs: Buff[];
  onBuy: (buff: Buff) => void;
  speedUpLevel: number;
}

export const StorePanel: React.FC<StorePanelProps> = ({ currentDraws, activeBuffs, onBuy, speedUpLevel }) => {
  
  const isBuffActive = (buffId: string) => activeBuffs.some(b => b.id === buffId);

  return (
    <div className="glass rounded-xl p-6 w-full mt-6">
      <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
          The Vault
        </h3>
        <span className="text-xs text-gray-400 uppercase">Spend Draws • Get Power</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {AVAILABLE_BUFFS.map(buff => {
          const isActive = isBuffActive(buff.id);
          const canAfford = currentDraws >= buff.cost;
          const isSpeedUp = buff.type === 'SPEED';
          
          let buttonText = "Purchase";
          if (isActive && !isSpeedUp) buttonText = "Active";
          if (!canAfford) buttonText = "Need Draws";

          return (
            <div key={buff.id} className="relative group bg-gray-900/50 border border-white/5 rounded-lg p-4 hover:border-purple-500/50 transition-all duration-300">
              {isActive && !isSpeedUp && (
                <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              )}
              
              <div className="flex items-center gap-3 mb-3">
                <div className="text-3xl">{buff.icon}</div>
                <div>
                  <h4 className="font-bold text-white leading-none">{buff.name}</h4>
                  <div className="flex items-center text-yellow-400 text-sm mt-1 font-mono">
                    <span className="mr-1">♦</span> {buff.cost}
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-gray-400 mb-4 min-h-[40px] leading-relaxed">
                {buff.description}
                {isSpeedUp && <span className="block mt-1 text-purple-300">Level: {speedUpLevel}</span>}
              </p>

              <button
                onClick={() => onBuy(buff)}
                disabled={!canAfford || (isActive && !isSpeedUp)}
                className={`w-full py-2 px-3 rounded text-sm font-bold uppercase tracking-wider transition-all
                  ${!canAfford 
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                    : (isActive && !isSpeedUp)
                      ? 'bg-green-900/50 text-green-400 border border-green-500/30 cursor-default'
                      : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/20 active:scale-95'
                  }`}
              >
                {buttonText}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};