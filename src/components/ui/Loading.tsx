import Image from 'next/image';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
  belowNavigation?: boolean;
}

function LoadingSpinner({
  sizeClass,
  text,
  showLogo = false,
}: {
  sizeClass: string;
  text?: string;
  showLogo?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      {showLogo ? (
        <Image
          src="/BIQ_drawing.svg"
          alt="BracketIQ logo"
          width={72}
          height={72}
          className="h-[72px] w-[72px] rounded-[14%]"
          priority
        />
      ) : null}
      <div className={`${sizeClass} animate-spin rounded-full border-2 border-gray-300 border-t-blue-600`} />
      {text && (
        <p className="text-sm text-gray-600 animate-pulse">{text}</p>
      )}
    </div>
  );
}

export default function Loading({
  size = 'md',
  text,
  fullScreen = false,
  belowNavigation = false,
}: LoadingProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };
  const sizeClass = sizeClasses[size];

  if (fullScreen) {
    const overlayZIndex = belowNavigation ? 'z-40' : 'z-50';

    return (
      <div className={`fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center ${overlayZIndex}`}>
        <LoadingSpinner sizeClass={sizeClass} text={text} showLogo />
      </div>
    );
  }

  return <LoadingSpinner sizeClass={sizeClass} text={text} />;
}
