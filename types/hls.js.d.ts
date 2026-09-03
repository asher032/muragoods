declare module 'hls.js' {
  export default class Hls {
    static isSupported(): boolean;
    constructor(config?: Record<string, unknown>);
    loadSource(url: string): void;
    attachMedia(media: HTMLMediaElement): void;
    destroy(): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
    static Events: {
      MANIFEST_PARSED: string;
      ERROR: string;
    };
  }
}
