export {}; // marks the file as a module

declare global {
  interface Window {
    backend: {
      openAdataFile(): Promise<string | undefined>;
      openDir(): Promise<string | undefined>;
      imageDataURL: (p: string) => Promise<string>;
    };
  }
}