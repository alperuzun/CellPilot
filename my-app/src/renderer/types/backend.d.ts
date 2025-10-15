export {}; // marks the file as a module

interface FileStats {
  size: number;
  created: Date;
  modified: Date;
}

declare global {
  interface Window {
    backend: {
      openAdataFile(): Promise<string | undefined>;
      openDir(): Promise<string | undefined>;
      openMarkerFile(): Promise<string | undefined>;
      getFileStats(filePath: string): Promise<FileStats | null>;
      imageDataURL: (p: string) => Promise<string>;
    };
  }
}