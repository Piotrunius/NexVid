/* ============================================
  NexVid Type Definitions
  ============================================ */

// ---- Media Types ----

export type MediaType = 'movie' | 'show';

export interface MediaBase {
  id: number;
  tmdbId: string;
  imdbId?: string;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseYear: number;
  rating: number;
  genres: Genre[];
  mediaType: MediaType;
}

export interface Movie extends MediaBase {
  mediaType: 'movie';
  runtime: number;
  certification?: string;
  cast?: CastMember[];
  crew?: CrewMember[];
  videos?: VideoItem[];
  tagline?: string;
  status?: string;
  budget?: number;
  revenue?: number;
  productionCompanies?: string[];
  spokenLanguages?: string[];
  originCountry?: string[];
}

export interface Show extends MediaBase {
  mediaType: 'show';
  seasons: Season[];
  totalEpisodes: number;
  certification?: string;
  cast?: CastMember[];
  crew?: CrewMember[];
  videos?: VideoItem[];
  tagline?: string;
  status?: string;
  networks?: string[];
  createdBy?: string[];
  originCountry?: string[];
}

export interface Season {
  id: number;
  seasonNumber: number;
  name: string;
  episodeCount: number;
  posterPath: string | null;
  overview: string;
  airDate: string | null;
  episodes?: Episode[];
}

export interface Episode {
  id: number;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview: string;
  stillPath: string | null;
  airDate: string | null;
  runtime: number | null;
  rating: number;
}

export interface Genre {
  id: number;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profilePath: string | null;
}

export interface VideoItem {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
}

export type MediaItem = Movie | Show;

// ---- Stream Types ----

export type StreamQuality = 'unknown' | '360' | '480' | '720' | '1080' | '2k' | '4k';

export interface StreamFile {
  type: 'mp4';
  url: string;
}

export interface Caption {
  id: string;
  url: string;
  language: string;
  type: 'srt' | 'vtt';
  hasCorsRestrictions?: boolean;
}

export interface AudioTrack {
  id: number;
  name: string;
  lang: string;
  isDefault: boolean;
  url?: string;
}

export interface StreamBase {
  id: string;
  flags: string[];
  captions: Caption[];
  thumbnailTrack?: { type: 'vtt'; url: string };
  headers?: Record<string, string>;
  preferredHeaders?: Record<string, string>;
}

export interface FileBasedStream extends StreamBase {
  type: 'file';
  qualities: Partial<Record<StreamQuality, StreamFile>>;
  audioTracks?: AudioTrack[];
}

export interface HlsBasedStream extends StreamBase {
  type: 'hls';
  playlist: string;
  proxyDepth?: 0 | 1 | 2;
}

export interface EmbedStream {
  type: 'embed';
  url: string;
}

export type Stream = FileBasedStream | HlsBasedStream | EmbedStream;

export interface SourceResult {
  sourceId: string;
  embedId?: string;
  stream: Stream;
}

export interface SourceMeta {
  id: string;
  name: string;
  rank: number;
  type: 'source' | 'embed';
  mediaTypes?: MediaType[];
}

// ---- Source Scraper Events ----

export interface ScrapeProgress {
  id: string;
  percentage: number;
  status: 'pending' | 'success' | 'failure' | 'notfound';
  error?: unknown;
  reason?: string;
}

// ---- User Types ----

export interface User {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
  isAdmin?: boolean;
  role?: 'owner' | 'admin' | 'moderator' | null;
  requiresPasswordChange?: boolean;
  createdAt: string;
  settings: UserSettings;
}

export interface UserSettings {
  theme: 'dark' | 'light';
  accentColor: AccentColor;
  customAccentHex: string;
  glassEffect: boolean;
  language: string;
  subtitleLanguage: string;
  autoPlay: boolean;
  autoNext: boolean;
  defaultQuality: StreamQuality;
  seekTime: number;
  playerVolume: number;
  skipIntro: boolean;
  skipOutro: boolean;
  autoSkipSegments: boolean;
  autoSwitchSource: boolean;
  idlePauseOverlay: boolean;
  febboxApiKey: string;
  disableEmbeds: boolean;
  introDbApiKey: string;
  groqApiKey: string;
  omdbApiKey: string;
  preferredSources: string[];
  disabledSources: string[];
}

export type AccentColor = 'indigo' | 'violet' | 'rose' | 'emerald' | 'amber' | 'cyan' | 'custom';
export type Theme = 'dark' | 'light';
// ---- Watchlist Types ----

export type WatchlistStatus = 'Planned' | 'Watching' | 'Completed' | 'Dropped' | 'On-Hold' | 'none';

export interface WatchlistItem {
  id: string;
  mediaType: MediaType;
  tmdbId: string;
  title: string;
  posterPath: string | null;
  status: WatchlistStatus;
  hidden?: boolean; // New: To hide from "My List" if it's only in "Continue Watching"
  progress?: {
    season?: number;
    episode?: number;
    timestamp?: number;
    percentage?: number;
  };
  rating?: number;
  notes?: string;
  addedAt: string;
  updatedAt: string;
}

// ---- TIDB Types ----

export interface IntroOutro {
  introStart?: number;
  introEnd?: number;
  outroStart?: number;
  outroEnd?: number;
}

// ---- TMDB API Types ----

export interface TMDBSearchResult {
  page: number;
  totalPages: number;
  totalResults: number;
  results: MediaItem[];
}

export interface TMDBTrending {
  results: MediaItem[];
}

// ---- Dev Testing ----

export interface TestResult {
  sourceId: string;
  status: 'success' | 'failure' | 'timeout';
  streams: number;
  duration: number;
  error?: string;
}
