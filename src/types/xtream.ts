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

export type ApiErrorResponse = {
  error: string;
};
