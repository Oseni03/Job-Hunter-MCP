import type { ScrapeMeta } from "ts-jobspy";

export interface Job {
  id: string;
  source: string;
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  url: string;
  description?: string;
  postedAt?: Date;
}

export type RemoteFilter = "remote" | "hybrid" | "onsite";

export interface SearchQuery {
  keywords: string;
  location?: string;
  remoteOnly?: boolean;
  remoteFilter?: RemoteFilter;
  postedWithinDays?: number;
  postedWithinMinutes?: number;
  page?: number;
  limit?: number;
  /** ts-jobspy country override; legacy adapters ignore it. */
  country?: string;
  /** ts-jobspy Sites report per-call meta here; legacy adapters ignore it. */
  metaSink?: (meta: ScrapeMeta) => void;
}

export interface Adapter {
  name: string;
  search(q: SearchQuery): Promise<Job[]>;
}

export interface SearchAllOptions {
  adapters?: Adapter[];
}

export interface JobDetail {
  id: string;
  source: string;
  title: string;
  company: string;
  location?: string;
  url: string;
  description: string;
  seniority?: string;
  employmentType?: string;
  jobFunction?: string;
  industries?: string[];
  postedAt?: Date;
}
