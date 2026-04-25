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

export type ApiErrorResponse = {
  error: string;
};
