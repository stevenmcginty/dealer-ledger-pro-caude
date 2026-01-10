
import React from 'react';

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  detail: string;
  color: 'blue' | 'yellow' | 'green' | 'red';
}

const StatCard = ({ icon: Icon, title, value, detail, color }: StatCardProps) => {
  const colorClasses = {
    blue: 'from-blue-600/20 to-blue-900/20 border-blue-500/30 text-blue-400',
    yellow: 'from-yellow-600/20 to-yellow-900/20 border-yellow-500/30 text-yellow-400',
    green: 'from-green-600/20 to-green-900/20 border-green-500/30 text-green-400',
    red: 'from-red-600/20 to-red-900/20 border-red-500/30 text-red-400',
  };

  return (
    <div className={`glass-card p-6 rounded-2xl bg-gradient-to-br border ${colorClasses[color].split(' ')[0]} ${colorClasses[color].split(' ')[1]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <p className="mt-1 text-3xl font-bold text-white tracking-tight">{value}</p>
          <p className="mt-2 text-xs text-gray-500">{detail}</p>
        </div>
        <div className={`p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md`}>
          <Icon className={`h-6 w-6 ${colorClasses[color].split(' ').pop()}`} />
        </div>
      </div>
    </div>
  );
};

export default StatCard;
