/* eslint-disable @typescript-eslint/no-explicit-any */
import { Between, In, Like, ILike, MoreThan, MoreThanOrEqual, LessThan, LessThanOrEqual, Not, IsNull, Equal, Raw } from 'typeorm';

import { FilterOperator } from '../interface/query-parser.interface';

import type { FilterOperation, FilterItem, OrFilterOperation, SortOperation, IncludeOperation, PageOperation, ParsedQuery } from '../interface/query-parser.interface';
import type { FindManyOptions, FindOptionsWhere, FindOptionsOrder, FindOptionsRelations, DataSource, Repository } from 'typeorm';

export class QueryConverter<T = any> {
    private dataSource?: DataSource;

    constructor(dataSourceOrRepository?: DataSource | Repository<any>) {
        if (dataSourceOrRepository) {
            if ('metadata' in dataSourceOrRepository && 'manager' in dataSourceOrRepository) {
                // Repository가 전달된 경우
                this.dataSource = dataSourceOrRepository.manager.connection;
            } else {
                // DataSource가 전달된 경우
                this.dataSource = dataSourceOrRepository as DataSource;
            }
        }
    }

    convertToFindOptions(parsedQuery: ParsedQuery): FindManyOptions<T> {
        const options: FindManyOptions<T> = {};

        // Convert filters to where clause
        if (parsedQuery.filters.length > 0) {
            options.where = this.convertFiltersToWhere(parsedQuery.filters);
        }

        // Convert sorts to order clause
        if (parsedQuery.sorts.length > 0) {
            options.order = this.convertSortsToOrder(parsedQuery.sorts);
        }

        // Convert includes to relations
        if (parsedQuery.includes.length > 0) {
            options.relations = this.convertIncludesToRelations(parsedQuery.includes);
        }

        // Convert page to take/skip
        if (parsedQuery.page) {
            const pagination = this.convertPageToPagination(parsedQuery.page);
            Object.assign(options, pagination);
        }

        return options;
    }

    private convertFiltersToWhere(filters: FilterItem[]): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
        const { andFilters, orFilters } = this.separateFiltersByType(filters);
        const baseWhere = this.buildWhereFromAndFilters(andFilters);

        if (orFilters.length === 0) {
            return baseWhere;
        }

        return this.expandWhereWithOrFilters(baseWhere, orFilters);
    }

    private separateFiltersByType(filters: FilterItem[]): { andFilters: FilterOperation[]; orFilters: OrFilterOperation[] } {
        const andFilters: FilterOperation[] = [];
        const orFilters: OrFilterOperation[] = [];

        for (const filter of filters) {
            if (this.isOrFilter(filter)) {
                orFilters.push(filter);
            } else {
                andFilters.push(filter);
            }
        }

        return { andFilters, orFilters };
    }

    private buildWhereFromAndFilters(andFilters: FilterOperation[]): any {
        const where: any = {};

        for (const filter of andFilters) {
            const fieldPath = filter.relation ? `${filter.field}.${filter.relation}` : filter.field;
            const whereCondition = this.convertFilterToCondition(filter);

            if (whereCondition !== undefined) {
                this.setNestedProperty(where, fieldPath, whereCondition);
            }
        }

        return where;
    }

    private expandWhereWithOrFilters(baseWhere: any, orFilters: OrFilterOperation[]): any[] {
        let whereArray: any[] = [{ ...baseWhere }];

        for (const orFilter of orFilters) {
            const expandedWhere: any[] = [];

            for (const baseCondition of whereArray) {
                for (const filter of orFilter.filters) {
                    const newWhere = this.deepClone(baseCondition);
                    const fieldPath = filter.relation ? `${filter.field}.${filter.relation}` : filter.field;
                    const whereCondition = this.convertFilterToCondition(filter);

                    if (whereCondition !== undefined) {
                        this.setNestedProperty(newWhere, fieldPath, whereCondition);
                        expandedWhere.push(newWhere);
                    }
                }
            }

            whereArray = expandedWhere;
        }

        return whereArray;
    }

    private isOrFilter(filter: FilterItem): filter is OrFilterOperation {
        return 'type' in filter && filter.type === 'or';
    }

    private deepClone<U>(obj: U): U {
        return JSON.parse(JSON.stringify(obj));
    }

    private convertFilterToCondition(filter: FilterOperation): any {
        const { operator, value } = filter;

        switch (operator) {
            case FilterOperator.EQ:
                return Equal(value);

            case FilterOperator.NE:
                return Not(Equal(value));

            case FilterOperator.GT:
                return MoreThan(value);

            case FilterOperator.GTE:
                return MoreThanOrEqual(value);

            case FilterOperator.LT:
                return LessThan(value);

            case FilterOperator.LTE:
                return LessThanOrEqual(value);

            case FilterOperator.BETWEEN:
                if (Array.isArray(value) && value.length === 2) {
                    return Between(value[0], value[1]);
                }
                return undefined;

            case FilterOperator.LIKE:
                return Like(value as string);

            case FilterOperator.ILIKE:
                return ILike(value as string);

            case FilterOperator.START:
                return Like(value as string); // value already processed to "prefix%"

            case FilterOperator.END:
                return Like(value as string); // value already processed to "%suffix"

            case FilterOperator.CONTAINS:
                return Like(value as string); // value already processed to "%content%"

            case FilterOperator.IN:
                if (Array.isArray(value)) {
                    return In(value);
                }
                return undefined;

            case FilterOperator.NOT_IN:
                if (Array.isArray(value)) {
                    return Not(In(value));
                }
                return undefined;

            case FilterOperator.NULL:
                return value === true ? IsNull() : undefined;

            case FilterOperator.NOT_NULL:
                return value === true ? Not(IsNull()) : undefined;

            case FilterOperator.PRESENT:
                // Present means not null and not empty string
                return value === true ? Not(IsNull()) : undefined;

            case FilterOperator.BLANK:
                // Blank means null or empty string
                if (value === true) {
                    return [IsNull(), Equal('')];
                }
                return undefined;

            case FilterOperator.FTS:
                return this.createFullTextSearchCondition(filter.field, value as string);

            default:
                return Equal(value);
        }
    }

    private convertSortsToOrder(sorts: SortOperation[]): FindOptionsOrder<T> {
        const order: any = {};

        for (const sort of sorts) {
            const fieldPath = sort.relation ? `${sort.field}.${sort.relation}` : sort.field;
            const direction = sort.direction.toUpperCase() as 'ASC' | 'DESC';

            this.setNestedProperty(order, fieldPath, direction);
        }

        return order;
    }

    private convertIncludesToRelations(includes: IncludeOperation[]): FindOptionsRelations<T> {
        const relations: any = {};

        for (const include of includes) {
            // Handle nested relations or simple relation
            if (include.nested && include.nested.length > 0) {
                // 중첩 관계가 있는 경우, 기존 값과 병합
                if (!relations[include.relation] || relations[include.relation] === true) {
                    relations[include.relation] = this.convertNestedIncludes(include.nested);
                } else {
                    // 이미 객체가 있으면 병합
                    const newNested = this.convertNestedIncludes(include.nested);
                    relations[include.relation] = { ...relations[include.relation], ...newNested };
                }
            } else {
                // 단순 관계는 기존 값이 없을 때만 true로 설정
                if (!relations[include.relation]) {
                    relations[include.relation] = true;
                }
            }
        }

        return relations;
    }

    private convertNestedIncludes(nestedIncludes: IncludeOperation[]): any {
        const nested: any = {};

        for (const include of nestedIncludes) {
            nested[include.relation] = include.nested && include.nested.length > 0 ? this.convertNestedIncludes(include.nested) : true;
        }

        return nested;
    }

    private convertPageToPagination(page: PageOperation): Partial<FindManyOptions<T>> {
        const pagination: Partial<FindManyOptions<T>> = {};

        switch (page.type) {
            case 'number':
                // eslint-disable-next-line unicorn/explicit-length-check
                if (page.number && page.size && page.size > 0) {
                    pagination.skip = (page.number - 1) * page.size;
                    pagination.take = page.size;
                }
                break;

            case 'offset':
                if (page.offset !== undefined) {
                    pagination.skip = page.offset;
                }
                if (page.limit) {
                    pagination.take = page.limit;
                }
                break;

            case 'cursor':
                // Cursor pagination requires additional logic in the service layer
                // For now, just set the size
                // eslint-disable-next-line unicorn/explicit-length-check
                if (page.size && page.size > 0) {
                    pagination.take = page.size;
                }
                // Note: cursor implementation would need to be handled separately
                // as it requires WHERE conditions based on the cursor value
                break;
        }

        return pagination;
    }

    private setNestedProperty(obj: any, path: string, value: any): void {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }

        const lastKey = keys[keys.length - 1];

        // Handle array values for OR conditions (like BLANK operator)
        // For array values, we need to handle OR conditions
        // This might need to be restructured depending on TypeORM's handling
        current[lastKey] = value;
    }

    // Helper method to create cursor-based where conditions
    createCursorWhere(cursorValue: string, cursorField: string, direction: 'ASC' | 'DESC' = 'ASC'): FindOptionsWhere<T> {
        const where: any = {};

        where[cursorField] = direction === 'ASC' ? MoreThan(cursorValue) : LessThan(cursorValue);

        return where;
    }

    /**
     * PostgreSQL 전문 검색 조건을 생성합니다.
     * to_tsvector와 plainto_tsquery를 사용하여 GIN 인덱스를 활용한 빠른 전문 검색을 제공합니다.
     */
    private createFullTextSearchCondition(field: string, searchTerm: string): any {
        // 검색어가 비어있는 경우 처리
        if (!searchTerm?.trim()) {
            throw new Error('Full-text search requires a non-empty search term.');
        }

        // DataSource가 있는 경우에만 검증 수행
        if (this.dataSource && !this.isPostgreSQL()) {
            throw new Error(
                'Full-text search (_fts) operator is only supported with PostgreSQL database. ' +
                'Current database type does not support to_tsvector and plainto_tsquery functions.'
            );
        }

        // PostgreSQL 전문 검색 Raw 쿼리 생성
        // to_tsvector('korean', field) @@ plainto_tsquery('korean', :searchTerm)
        return Raw(
            (alias) => `to_tsvector('korean', ${alias}.${field}) @@ plainto_tsquery('korean', :searchTerm)`,
            { searchTerm: searchTerm.trim() }
        );
    }

    /**
     * 현재 데이터베이스가 PostgreSQL인지 확인합니다.
     */
    private isPostgreSQL(): boolean {
        if (!this.dataSource) {
            // DataSource가 없는 경우 기본적으로 false 반환 (안전하게)
            return false;
        }

        return this.dataSource.options.type === 'postgres';
    }

    /**
     * PostgreSQL GIN 인덱스 생성을 위한 헬퍼 메서드
     * 개발자가 수동으로 인덱스를 생성할 때 참고용
     */
    static generateGinIndexSQL(tableName: string, columnName: string, language: string = 'korean'): string {
        return `CREATE INDEX CONCURRENTLY idx_${tableName}_${columnName}_fts ON ${tableName} USING GIN (to_tsvector('${language}', ${columnName}));`;
    }
}
