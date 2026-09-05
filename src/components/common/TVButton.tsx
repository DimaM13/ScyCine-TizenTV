import React from 'react';

interface TVButtonProps {
  id?: string;
  onClick?: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export const TVButton: React.FC<TVButtonProps> = ({
  id,
  onClick,
  children,
  variant = 'primary',
  className = '',
  icon,
  disabled = false
}) => {
  const baseClasses = 'flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 cursor-pointer select-none';
  
  const variantClasses = {
    primary: 'bg-cinema-gold text-slate-950 hover:bg-cinema-gold-bright active:bg-cinema-gold-hover border border-cinema-gold',
    secondary: 'bg-cinema-850 text-slate-100 hover:bg-cinema-800 border border-slate-700/60',
    ghost: 'bg-transparent text-slate-300 hover:bg-cinema-850 hover:text-cinema-gold border border-transparent',
    danger: 'bg-red-600/90 text-white hover:bg-red-500 border border-red-500'
  };

  return (
    <button
      data-tv-focus="true"
      data-focus-id={id}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
    >
      {icon && <span className="text-lg">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};
