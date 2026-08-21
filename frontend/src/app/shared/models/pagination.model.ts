export interface PageRequest {
  pageNumber: number;
  pageSize: number;
  keyword?: string;
  sortField?: string;
  sortDirection?: string;
}

export interface PageResponse<T> {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface SortRequest {
  sortField: string;
  sortDirection: 'asc' | 'desc';
}

export interface FilterRequest {
  keyword?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  [key: string]: any;
}
