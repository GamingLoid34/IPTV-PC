export type XtreamCredentials = {
  serverUrl: string;
  username: string;
  password: string;
};

export type XtreamCategory = {
  category_id: string;
  category_name: string;
  parent_id: number;
};

export type XtreamSeriesCategory = XtreamCategory;

export type XtreamLiveStream = {
  stream_id: number;
  name: string;
  stream_icon: string;
  epg_channel_id: string | null;
  num: number;
  category_id: string;
};

export type XtreamVodStream = {
  num: number;
  name: string;
  stream_type: "movie";
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  added: string;
  category_id: string;
  container_extension: string;
  custom_sid: string | null;
  direct_source: string;
};

export type XtreamVodInfo = {
  info: {
    movie_image?: string;
    backdrop_path?: string[];
    youtube_trailer?: string;
    genre?: string;
    plot?: string;
    cast?: string;
    rating?: string;
    director?: string;
    releasedate?: string;
    duration_secs?: number;
    duration?: string;
    country?: string;
  };
  movie_data: {
    stream_id: number;
    name: string;
    container_extension: string;
    category_id: string;
  };
};

export type XtreamSeries = {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string;
  rating_5based?: number;
  backdrop_path?: string[];
  episode_run_time?: string;
  category_id: string;
};

export type XtreamEpisodeInfo = {
  movie_image?: string;
  plot?: string;
  duration_secs?: number;
  duration?: string;
  rating?: string;
};

export type XtreamEpisode = {
  id: string;
  episode_num: string;
  title?: string;
  container_extension: string;
  info: XtreamEpisodeInfo;
  added: string;
  season: number;
};

export type XtreamSeason = {
  season_number: number;
  name: string;
  cover: string;
  overview: string;
  episode_count: number;
};

export type XtreamSeriesInfo = {
  info: {
    name: string;
    cover?: string;
    plot?: string;
    genre?: string;
    cast?: string;
    director?: string;
    releaseDate?: string;
    rating?: string;
    rating_5based?: number;
    backdrop_path?: string[];
    youtube_trailer?: string;
    episode_run_time?: string;
    category_id?: string;
  };
  seasons: XtreamSeason[];
  episodes: Record<string, XtreamEpisode[]>;
};

export type ApiErrorResponse = {
  error: string;
};
