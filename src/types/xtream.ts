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

export type ApiErrorResponse = {
  error: string;
};
