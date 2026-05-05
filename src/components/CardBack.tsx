import React from 'react';

interface CardBackProps {
  className?: string;
  style?: React.CSSProperties;
  patternScale?: number;
  width?: number;
  height?: number;
}

export const CardBack = ({ className = '', style = {}, patternScale = 1, width, height }: CardBackProps) => {
  // Use fixed integer values to avoid sub-pixel rendering issues (stripes)
  const size = patternScale < 0.8 ? 4 : 6;
  const half = size / 2;

  const dimensionStyles = width && height ? {
    width: `${width}px`,
    height: `${height}px`,
    minWidth: `${width}px`,
    minHeight: `${height}px`,
    maxWidth: `${width}px`,
    maxHeight: `${height}px`,
  } : {};

  return (
    <div 
      className={`relative rounded-[4px] border border-white/20 overflow-hidden shadow-lg select-none bg-[#1e3a8a] ${className}`}
      style={{ ...style, ...dimensionStyles }}
    >
      {/* Diamond Pattern - Fixed sizes to prevent distortion */}
      <div 
        className="absolute inset-0 opacity-40" 
        style={{ 
          backgroundImage: `
            linear-gradient(45deg, rgba(255,255,255,0.3) 25%, transparent 25%), 
            linear-gradient(-45deg, rgba(255,255,255,0.3) 25%, transparent 25%), 
            linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.3) 75%), 
            linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.3) 75%)
          `,
          backgroundSize: `${size}px ${size}px`,
          backgroundPosition: `0 0, 0 ${half}px, ${half}px ${half}px, ${half}px 0`
        }} 
      />
      {/* Inner border for premium look */}
      <div className="absolute inset-[2px] border border-white/5 rounded-[1px]" />
    </div>
  );
};
