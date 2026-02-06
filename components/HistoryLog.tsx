import React from 'react';
import { DrawResult, Rarity } from '../types';
import { RARITY_COLORS } from '../constants';

interface HistoryLogProps {
  history: DrawResult[];
}

export const HistoryLog: React.FC<HistoryLogProps> = ({ history }) => {
  return (
    <div className="glass rounded-xl p-4 h-full flex flex-col w-full lg:w-80 flex-shrink-0">
      <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4 border-b border-white/10 pb-2">
        Pull History
      </h3>
      <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
        {history.length === 0 && (
          <div className="text-center text-gray-600 text-sm py-4">No draws yet...</div>
        )}
        {history.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between p-2 rounded-lg border ${RARITY_COLORS[item.rarity]} border-opacity-30`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-lg ${item.amount > 0 ? 'text-white' : 'text-gray-500'}`}>
                {item.amount > 0 ? `+${item.amount}` : '+0'}
              </span>
              {item.wasDoubled && <span className="text-xs bg-yellow-500 text-black px-1 rounded font-bold">x2</span>}
              {item.wasShielded && <span className="text-xs bg-blue-500 text-white px-1 rounded">🛡️</span>}
            </div>
            <span className="text-xs opacity-50 font-mono">
               {new Date(item.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second:'2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};