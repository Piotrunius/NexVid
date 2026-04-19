export interface MovieDownloaderResponse {
  success: boolean;
  tmdbId: string;
  originalId: string;
  data: {
    success: boolean;
    heading: string;
    title: string;
    year: string;
    subjectId: string;
    detailPath: string;
    detailsUrl: string;
    videoPlayerUrl: string;
    downloadData: {
      code: number;
      message: string;
      data: {
        downloads: Array<{
          id: string;
          url: string;
          resolution: number;
          size: string;
        }>;
        captions: Array<
          | {
              id?: string;
              lan: string;
              lanName: string;
              url: string;
              size: string;
              delay: number;
            }
          | {
              url: string;
              lan: string;
              lanName: string;
              size: number;
            }
        >;
        limited: boolean;
        limitedCode: string;
        freeNum: number;
        hasResource: boolean;
      };
    };
  };
  externalStreams: Array<{
    name: string;
    title: string;
    url: string;
    quality: string;
    size?: string | null;
    type: string;
    headers?: Record<string, string>;
    filename?: string;
  }>;
}

export interface Token {
  success: boolean;
  token: string;
  expiresIn: number;
}
