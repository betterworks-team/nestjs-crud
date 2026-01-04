export interface FilterOperation {
    field: string;
    operator: FilterOperator;
    value: unknown;
    relation?: string; // for nested relations like "author.name"
}

export interface OrFilterOperation {
    type: 'or';
    filters: FilterOperation[];
}

export enum FilterOperator {
    // 동등/부등 비교
    EQ = 'eq', // equals
    NE = 'ne', // not equals

    // 크기 비교
    GT = 'gt', // greater than
    GTE = 'gte', // greater than or equal
    LT = 'lt', // less than
    LTE = 'lte', // less than or equal
    BETWEEN = 'between', // between two values

    // 문자열 패턴
    LIKE = 'like', // SQL LIKE pattern
    ILIKE = 'ilike', // case insensitive LIKE
    START = 'start', // starts with
    END = 'end', // ends with
    CONTAINS = 'contains', // contains substring

    // 배열/리스트 연산
    IN = 'in', // in array
    NOT_IN = 'not_in', // not in array

    // NULL/존재 체크
    NULL = 'null', // is null
    NOT_NULL = 'not_null', // is not null
    PRESENT = 'present', // has value (not null/empty)
    BLANK = 'blank', // is null or empty

    // PostgreSQL 전문 검색 (Full-Text Search)
    FTS = 'fts', // PostgreSQL to_tsvector & plainto_tsquery
}

export interface SortOperation {
    field: string;
    direction: 'asc' | 'desc';
    relation?: string; // for nested relations like "author.name"
}

export interface IncludeOperation {
    relation: string;
    nested?: IncludeOperation[]; // for nested includes like "author.comments"
}

export interface PageOperation {
    type: 'number' | 'offset' | 'cursor';
    number?: number; // for page[number]
    size?: number; // for page[size]
    offset?: number; // for page[offset]
    limit?: number; // for page[limit]
    cursor?: string; // for page[cursor]
}

export type FilterItem = FilterOperation | OrFilterOperation;

export interface ParsedQuery {
    filters: FilterItem[];
    sorts: SortOperation[];
    includes: IncludeOperation[];
    page?: PageOperation;
}

export interface QueryParserOptions {
    allowedFilters?: string[];
    allowedSorts?: string[];
    allowedIncludes?: string[];
    maxPageSize?: number;
    defaultPageSize?: number;
}
