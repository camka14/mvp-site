interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
}

function LoadingSpinner({ sizeClass, text }: { sizeClass: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className={`${sizeClass} animate-spin rounded-full border-2 border-gray-300 border-t-blue-600`} />
      {text && (
        <p className="text-sm text-gray-600 animate-pulse">{text}</p>
      )}
    </div>
  );
}

export default function Loading({ size = 'md', text, fullScreen = false }: LoadingProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };
  const sizeClass = sizeClasses[size];

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
        <LoadingSpinner sizeClass={sizeClass} text={text} />
      </div>
    );
  }

  return <LoadingSpinner sizeClass={sizeClass} text={text} />;
}
