import { useEffect, useState } from 'react';

/**
 * Hook per rilevare schermi < 1024px (breakpoint lg di Tailwind).
 * Estratto da Dashboard.tsx e Layout.tsx dove era duplicato.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}