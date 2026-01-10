import React from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'default' | 'pills';
  className?: string;
}

const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  className = '',
}) => {
  if (variant === 'pills') {
    return (
      <div className={`flex gap-2 ${className}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${
                activeTab === tab.id
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/25'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }
            `}
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`
                  ml-1 px-2 py-0.5 text-xs rounded-full
                  ${activeTab === tab.id ? 'bg-white/20' : 'bg-gray-700'}
                `}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`border-b border-gray-700 ${className}`}>
      <nav className="flex gap-6" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors duration-200
              ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
              }
            `}
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`
                  px-2 py-0.5 text-xs rounded-full
                  ${activeTab === tab.id ? 'bg-brand-500/20 text-brand-400' : 'bg-gray-700 text-gray-400'}
                `}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Tabs;
