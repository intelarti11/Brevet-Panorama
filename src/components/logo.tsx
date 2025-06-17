import type { FC } from 'react';

interface LogoProps {
  className?: string;
}

const Logo: FC<LogoProps> = ({ className }) => {
  return (
    <div className={`font-headline text-3xl font-bold text-primary ${className}`}>
      BrevetSynthèse
    </div>
  );
};

export default Logo;
