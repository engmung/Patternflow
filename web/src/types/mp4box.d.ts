declare module "mp4box" {
  export interface DataStreamInstance {
    buffer: ArrayBuffer;
  }

  export interface DataStreamConstructor {
    new (buffer: unknown, offset: number, endian: boolean): DataStreamInstance;
    BIG_ENDIAN: boolean;
  }

  export interface MP4BoxFile {
    onReady: (info: MP4Info) => void;
    onSamples: (id: number, user: unknown, samples: MP4Sample[]) => void;
    onError: (e: Error) => void;
    appendBuffer: (buffer: ArrayBuffer & { fileStart?: number }) => void;
    start: () => void;
    flush: () => void;
    setExtractionOptions: (trackId: number, user?: unknown, options?: { nbSamples?: number }) => void;
    getTrackById: (id: number) => unknown;
  }

  export interface MP4Info {
    tracks: MP4Track[];
    duration: number;
    timescale: number;
  }

  export interface MP4Track {
    type: string;
    id: number;
    codec: string;
    nb_samples: number;
    timescale: number;
    duration: number;
    video?: { width: number; height: number };
    audio?: { sample_rate: number; channel_count: number };
  }

  export interface MP4Sample {
    data: ArrayBuffer;
    is_sync: boolean;
    cts: number;
    dts: number;
    duration: number;
    timescale: number;
    size: number;
  }

  export function createFile(): MP4BoxFile;
  export const DataStream: DataStreamConstructor;

  const MP4Box: { createFile: typeof createFile; DataStream: typeof DataStream };
  export default MP4Box;
}
