import { FilterOperator } from '../interface/query-parser.interface';

import type {
    FilterOperation,
    FilterItem,
    OrFilterOperation,
    SortOperation,
    IncludeOperation,
    PageOperation,
    ParsedQuery,
    QueryParserOptions,
} from '../interface/query-parser.interface';

export class QueryParser {
    constructor(private readonly options: QueryParserOptions = {}) {}

    parse(query: Record<string, unknown>): ParsedQuery {
        return {
            filters: this.parseFilters(query),
            sorts: this.parseSorts(query),
            includes: this.parseIncludes(query),
            page: this.parsePage(query),
        };
    }

    private parseFilters(query: Record<string, unknown>): FilterItem[] {
        const filters: FilterItem[] = [];

        for (const [key, value] of Object.entries(query)) {
            if (key.startsWith('filter[') && key.endsWith(']')) {
                const filterKey = key.slice(7, -1); // remove 'filter[' and ']'
                const filterItem = this.parseFilterKey(filterKey, value);

                if (filterItem) {
                    filters.push(filterItem);
                }
            }
        }

        return filters;
    }

    private parseFilterKey(filterKey: string, value: unknown): FilterItem | null {
        // Check for OR filter: field1||field2_operator
        if (filterKey.includes('||')) {
            return this.parseOrFilter(filterKey, value);
        }

        // Find the last underscore to separate field from operator
        const lastUnderscoreIndex = filterKey.lastIndexOf('_');

        if (lastUnderscoreIndex === -1) {
            // No operator suffix, default to 'eq'
            return this.createFilterOperation(filterKey, FilterOperator.EQ, value);
        }

        const field = filterKey.slice(0, Math.max(0, lastUnderscoreIndex));
        const operatorStr = filterKey.slice(Math.max(0, lastUnderscoreIndex + 1));

        const operator = this.getFilterOperator(operatorStr);
        if (!operator) {
            // Invalid operator, treat as field name with 'eq'
            return this.createFilterOperation(filterKey, FilterOperator.EQ, value);
        }

        return this.createFilterOperation(field, operator, value);
    }

    private parseOrFilter(filterKey: string, value: unknown): OrFilterOperation | null {
        // Format: field1||field2||field3_operator
        // Example: title||workspace.name_ilike
        const lastUnderscoreIndex = filterKey.lastIndexOf('_');
        
        let fields: string[];
        let operator: FilterOperator;

        if (lastUnderscoreIndex === -1) {
            // No operator suffix, default to 'eq'
            fields = filterKey.split('||');
            operator = FilterOperator.EQ;
        } else {
            const fieldsStr = filterKey.slice(0, Math.max(0, lastUnderscoreIndex));
            const operatorStr = filterKey.slice(Math.max(0, lastUnderscoreIndex + 1));

            fields = fieldsStr.split('||');
            operator = this.getFilterOperator(operatorStr) || FilterOperator.EQ;
        }

        const orFilters: FilterOperation[] = [];
        for (const field of fields) {
            const filterOp = this.createFilterOperation(field.trim(), operator, value);
            if (filterOp) {
                orFilters.push(filterOp);
            }
        }

        if (orFilters.length === 0) {
            return null;
        }

        // If only one filter passed allowedFilters, return it as a single filter
        if (orFilters.length === 1) {
            return { type: 'or', filters: orFilters };
        }

        return {
            type: 'or',
            filters: orFilters,
        };
    }

    private createFilterOperation(field: string, operator: FilterOperator, value: unknown): FilterOperation | null {
        // Check if field is allowed
        if (!this.options.allowedFilters?.includes(field)) {
            return null;
        }

        // Handle nested relations (e.g., "author.name")
        const [mainField, ...relationParts] = field.split('.');
        const relation = relationParts.length > 0 ? relationParts.join('.') : undefined;

        // Process value based on operator
        const processedValue = this.processFilterValue(operator, value);

        return {
            field: mainField,
            operator,
            value: processedValue,
            relation,
        };
    }

    private getFilterOperator(operatorStr: string): FilterOperator | null {
        const operatorMap: Record<string, FilterOperator> = {
            eq: FilterOperator.EQ,
            ne: FilterOperator.NE,
            gt: FilterOperator.GT,
            gte: FilterOperator.GTE,
            lt: FilterOperator.LT,
            lte: FilterOperator.LTE,
            between: FilterOperator.BETWEEN,
            like: FilterOperator.LIKE,
            ilike: FilterOperator.ILIKE,
            start: FilterOperator.START,
            end: FilterOperator.END,
            contains: FilterOperator.CONTAINS,
            in: FilterOperator.IN,
            not_in: FilterOperator.NOT_IN,
            null: FilterOperator.NULL,
            not_null: FilterOperator.NOT_NULL,
            present: FilterOperator.PRESENT,
            blank: FilterOperator.BLANK,
            fts: FilterOperator.FTS,
        };

        return operatorMap[operatorStr] || null;
    }

    private processFilterValue(operator: FilterOperator, value: unknown): unknown {
        if (value === null || value === undefined) {
            return value;
        }

        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const stringValue = String(value);

        switch (operator) {
            case FilterOperator.IN:
            case FilterOperator.NOT_IN:
            case FilterOperator.BETWEEN:
                // Split comma-separated values
                return stringValue.split(',').map((v) => v.trim());

            case FilterOperator.NULL:
            case FilterOperator.NOT_NULL:
            case FilterOperator.PRESENT:
            case FilterOperator.BLANK:
                // Convert to boolean
                return stringValue.toLowerCase() === 'true';

            case FilterOperator.START:
                return `${stringValue}%`;

            case FilterOperator.END:
                return `%${stringValue}`;

            case FilterOperator.CONTAINS:
                return `%${stringValue}%`;

            case FilterOperator.FTS:
                // Return the search term as-is for PostgreSQL full-text search
                return stringValue;

            default:
                return stringValue;
        }
    }

    private parseSorts(query: Record<string, unknown>): SortOperation[] {
        const sortParam = query.sort;
        if (!sortParam) {
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const sortString = String(sortParam);
        const sortFields = sortString.split(',').map((s) => s.trim());
        const sorts: SortOperation[] = [];

        for (const sortField of sortFields) {
            if (!sortField) continue;

            const direction = sortField.startsWith('-') ? 'desc' : 'asc';
            const field = sortField.startsWith('-') ? sortField.slice(1) : sortField;

            // Check if field is allowed
            if (this.options.allowedSorts && !this.options.allowedSorts.includes(field)) {
                continue;
            }

            // Handle nested relations (e.g., "author.name")
            const [mainField, ...relationParts] = field.split('.');
            const relation = relationParts.length > 0 ? relationParts.join('.') : undefined;

            sorts.push({
                field: mainField,
                direction,
                relation,
            });
        }

        return sorts;
    }

    private parseIncludes(query: Record<string, unknown>): IncludeOperation[] {
        const includeParam = query.include;
        if (!includeParam) {
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const includeString = String(includeParam);
        const includeFields = includeString.split(',').map((s) => s.trim());
        const includes: IncludeOperation[] = [];

        for (const includeField of includeFields) {
            if (!includeField) continue;

            // Check if include is allowed
            if (!this.options.allowedIncludes?.includes(includeField)) {
                continue;
            }

            const includeOperation = this.parseIncludeField(includeField);
            if (includeOperation) {
                includes.push(includeOperation);
            }
        }

        return includes;
    }

    private parseIncludeField(includeField: string): IncludeOperation | null {
        const parts = includeField.split('.');
        if (parts.length === 0) return null;

        const [mainRelation, ...nestedParts] = parts;

        const include: IncludeOperation = {
            relation: mainRelation,
        };

        if (nestedParts.length > 0) {
            const nestedInclude = this.parseIncludeField(nestedParts.join('.'));
            if (nestedInclude) {
                include.nested = [nestedInclude];
            }
        }

        return include;
    }

    private parsePage(query: Record<string, unknown>): PageOperation | undefined {
        // Check for different page parameter formats
        const pageNumber = query['page[number]'];
        const pageSize = query['page[size]'];
        const pageOffset = query['page[offset]'];
        const pageLimit = query['page[limit]'];
        const pageCursor = query['page[cursor]'];

        // Priority: cursor > offset > number
        if (pageCursor) {
            return {
                type: 'cursor',
                // eslint-disable-next-line @typescript-eslint/no-base-to-string
                cursor: String(pageCursor),
                size: pageSize ? this.parsePageNumber(pageSize) : this.options.defaultPageSize,
            };
        }

        if (pageOffset !== undefined || pageLimit !== undefined) {
            const limit = pageLimit ? this.parsePageNumber(pageLimit) : this.options.defaultPageSize;
            return {
                type: 'offset',
                offset: pageOffset ? this.parsePageNumber(pageOffset) : 0,
                limit: this.validatePageSize(limit),
            };
        }

        if (pageNumber !== undefined || pageSize !== undefined) {
            const size = this.validatePageSize(pageSize ? this.parsePageNumber(pageSize) : this.options.defaultPageSize);
            return {
                type: 'number',
                number: pageNumber ? Math.max(1, this.parsePageNumber(pageNumber)) : 1,
                size,
            };
        }

        return undefined;
    }

    private parsePageNumber(value: unknown): number {
        const num = Number.parseInt(String(value), 10);
        return Number.isNaN(num) ? 0 : num;
    }

    private validatePageSize(size?: number): number {
        if (!size || size <= 0) {
            return this.options.defaultPageSize ?? 20;
        }

        if (this.options.maxPageSize && size > this.options.maxPageSize) {
            return this.options.maxPageSize;
        }

        return size;
    }
}
