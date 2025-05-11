/* Type overrides and shims for modules missing declaration files */

import type { ComponentType } from 'react';
import type { GridProps } from '@mui/material/Grid';

declare module '@mui/material/Unstable_Grid2' {
  const Grid2: ComponentType<GridProps & { container?: boolean; item?: boolean }>;
  export default Grid2;
}

declare global {
  interface Window {
    backend: {
      openAdataFile: () => Promise<string | undefined>;
      openDir: () => Promise<string | undefined>;
      imageDataURL: (path: string) => Promise<string>;
    };
  }
}

export {}; 