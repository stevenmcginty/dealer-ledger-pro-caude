

import { useState, useEffect } from 'react';

export function useWindowSize() {
  // Initialize state with undefined width. This is a robust pattern
  // to ensure we get the correct browser width after the component has mounted.
  const [windowSize, setWindowSize] = useState<{width: number | undefined}>({
    width: undefined,
  });

  useEffect(() => {
    // Handler to call on window resize
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
      });
    }
    
    // Add event listener
    window.addEventListener("resize", handleResize);
    
    // Call handler right away so state gets updated with initial window size
    handleResize();
    
    // Remove event listener on cleanup
    return () => window.removeEventListener("resize", handleResize);
  }, []); // Empty array ensures that effect is only run on mount

  return windowSize;
}