/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { LayoutDashboard, Sparkles, FolderClosed, Users, Settings } from 'lucide-react';

interface SidebarProps {
  onToggleTab?: (tab: string) => void;
  activeTab?: string;
  onShowNotification?: (message: string) => void;
}

export default function Sidebar({ onToggleTab, activeTab = 'briefs', onShowNotification }: SidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: '仪表盘' },
    { id: 'briefs', icon: Sparkles, label: 'AI 研究' },
    { id: 'folders', icon: FolderClosed, label: '知识库文件夹' },
    { id: 'teams', icon: Users, label: '团队协作' },
  ];

  const handleItemClick = (id: string, label: string) => {
    if (onToggleTab) {
      onToggleTab(id);
    }
    if (onShowNotification) {
      onShowNotification(`已切换至: ${label} （演示模式）`);
    }
  };

  return (
    <nav className="h-full w-20 hidden md:flex flex-col items-center py-5 fixed left-0 top-0 bg-slate-50 border-r border-slate-200 z-50 shadow-[1px_0_0_rgba(15,23,42,0.04)] select-none">
      {/* Brand logo - VB */}
      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 text-white font-extrabold text-xl font-display mb-8 tracking-wider shadow-sm select-none">
        VB
      </div>

      {/* Navigation Icons Info */}
      <div className="flex-1 flex flex-col items-center space-y-4 w-full">
        {navItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          return (
            <div
              key={item.id}
              className="relative flex flex-col items-center w-full group"
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <button
                onClick={() => handleItemClick(item.id, item.label)}
                className={`p-3 rounded-xl transition-all duration-200 cursor-pointer relative ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                } active:scale-95 flex items-center justify-center`}
                aria-label={item.label}
              >
                <IconComponent className="w-5 h-5" />
                {isActive && (
                  <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-white rounded-r-lg" />
                )}
              </button>

              {/* Tooltip */}
              <div
                className={`absolute left-20 pl-2 pointer-events-none transition-all duration-150 ${
                  hoveredItem === item.id
                    ? 'opacity-100 translate-x-0'
                    : 'opacity-0 -translate-x-2'
                }`}
              >
                <span className="whitespace-nowrap bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-md shadow-md block font-medium">
                  {item.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Settings & Profile */}
      <div className="mt-auto flex flex-col items-center space-y-5 w-full">
        <div
          className="relative flex flex-col items-center w-full group"
          onMouseEnter={() => setHoveredItem('settings')}
          onMouseLeave={() => setHoveredItem(null)}
        >
          <button
            onClick={() => handleItemClick('settings', '系统设置')}
            className="p-3 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors duration-200"
            aria-label="系统设置"
          >
            <Settings className="w-5 h-5" />
          </button>
          <div
            className={`absolute left-20 pl-2 pointer-events-none transition-all duration-150 ${
              hoveredItem === 'settings'
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 -translate-x-2'
            }`}
          >
            <span className="whitespace-nowrap bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded bg-opacity-95 block font-medium">
              系统设置
            </span>
          </div>
        </div>

        {/* User image profile */}
        <div className="relative group cursor-pointer" onClick={() => onShowNotification?.('账户信息（sunyan3038@gmail.com）已登录')}>
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-200 hover:border-blue-600 transition-colors duration-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="User Profile"
              className="w-full h-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAYJK5tGJgBT7avsuV2sI9DIENrEVkLkPiPKnSPHoM-JTYDEvuXuolPNuAA15LpUYiBKYT7PDsXqdRgr2CK9sWQw4rJo16vuPwXw7p4gZ8AOMo-1VLpfMP0P3eY52F8WrOc7UYT5mTUI1zYG2slSGgGRbDiyKn0IuTUS6dLn1GDA41Y8xB5jxykLwvaOanfXh02vW62jXO69yVwXVmo6wKPvz78HhgnhwmefNVWt08GK0yHT50WlsVyEEn4O97XvmGzzAULubAC5Ed4"
            />
          </div>
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
        </div>
      </div>
    </nav>
  );
}
