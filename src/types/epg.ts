export interface EpgChannel {
  id: string;
  displayName: string;
  icon?: string;
}

export interface EpgProgramme {
  channelId: string;
  start: string;
  stop: string;
  title: string;
  description?: string;
  categories: string[];
  episodeNum?: string;
}

export interface EpgManifest {
  fetchedAt: string;
  sourceUrl: string;
  channelCount: number;
  programmeCount: number;
  earliestStart: string;
  latestStop: string;
  totalSizeBytes: number;
}

export interface SearchIndexEntry {
  programmeRef: {
    channelId: string;
    start: string;
  };
  searchText: string;
  categories: string[];
  startMs: number;
  stopMs: number;
}
