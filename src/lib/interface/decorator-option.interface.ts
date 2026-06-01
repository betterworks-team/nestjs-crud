/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NestInterceptor, Type } from '@nestjs/common';
import type { ColumnType, DeepPartial } from 'typeorm';
import type { EntityType, Method, PaginationType, Sort } from '.';

interface RouteBaseOption {
    /**
     * An array of decorators to apply to the route handler
     */
    decorators?: Array<PropertyDecorator | MethodDecorator>;
    /**
     * An array of interceptors to apply to the route handler
     */
    interceptors?: Array<Type<NestInterceptor>>;
    /**
     * Configures the Swagger documentation for the route
     */
    swagger?: {
        /**
         * If set to true, the route will not be included in the Swagger documentation
         */
        hide?: boolean;
        /**
         * Configures the Swagger documentation for the route's response
         */
        response?: Type<unknown>;
        /**
         * Configures the Swagger documentation for the route's request body
         */
        body?: Type<unknown>;
    };
    /**
     * Configures the keys of entity to exclude from the route's response
     */
    exclude?: string[];
}

export interface SaveOptions {
    /**
     * Indicates if listeners and subscribers are called for this operation.
     * By default they are enabled, you can disable them by setting `{ listeners: false }` in save/remove options.
     * refer to typeorm’s save option.
     */
    listeners?: boolean;
}

export interface PrimaryKey {
    name: string;
    type?: ColumnType;
}

/**
 * See `crud.policy.ts` to check default values.
 */
export interface CrudOptions {
    /**
     * Entity class which CRUD operations will be performed
     */
    entity: EntityType;

    /**
     * enable Debug logging
     * @default false
     */
    logging?: boolean;

    /**
     * Skip validation of properties that do not exist in the validating object.
     * This is useful for write operations where you want to validate only the provided fields.
     * @default true for CREATE/UPDATE/UPSERT operations
     */
    skipMissingProperties?: boolean;

    /**
     * Array of column names that are allowed to be filtered.
     * If not specified, no columns can be filtered (all filters are blocked).
     * @example ['name', 'email', 'age']
     */
    allowedFilters?: string[];

    /**
     * Array of column names that are allowed in request parameters.
     * If not specified, no columns can be used in request parameters (all params are blocked).
     * Only applies to CREATE, UPDATE, and UPSERT operations.
     * @example ['name', 'email', 'age']
     */
    allowedParams?: string[];

    /**
     * Array of relation names that are allowed to be included via include query parameter.
     * If not specified, no relations can be included (all includes are blocked).
     * @example ['department', 'posts', 'posts.comments']
     */
    allowedIncludes?: string[];

    /**
     * Array of field names to exclude from all responses.
     * This applies globally to all routes unless overridden at the route level.
     * @example ['password', 'salt', 'refreshToken']
     */
    exclude?: string[];

    /**
     * Cache configuration for CRUD operations
     */
    cache?: {
        enabled: boolean;
        ttl?: number;  // Time to live in seconds
        keyPrefix?: string;
        strategy?: 'memory' | 'redis' | 'multi-tier';
    };

    /**
     * Enable lazy loading for relations
     * @default false
     */
    lazyLoading?: boolean;

    /**
     * Automatically detect and optimize relation loading
     * @default false
     */
    autoRelationDetection?: boolean;

    /**
     * Maximum page size allowed for pagination.
     * If not specified, there is no limit.
     * @example 1000
     */
    maxPageSize?: number;

    /**
     * Configures each CRUD method
     */
    routes?: {
        [Method.SHOW]?: {
            /**
             * Array of path parameters to use for the route
             *
             * @example
             * ```ts
             * params: ['id', 'subId']
             * ```
             * It will generate the route `/:id/:subId`
             */
            params?: string[];
            /**
             * If set to true, soft-deleted entity could be included in the result.
             * @default false
             */
            softDelete?: boolean;
            /**
             * Array of column names that are allowed to be filtered.
             * If not specified, uses the global allowedFilters from CrudOptions.
             * If both are not specified, no columns can be filtered.
             * @example ['name', 'email', 'age']
             */
            allowedFilters?: string[];
            /**
             * Array of relation names that are allowed to be included via include query parameter.
             * If not specified, uses the global allowedIncludes from CrudOptions.
             * If both are not specified, no relations can be included.
             * @example ['department', 'posts', 'posts.comments']
             */
            allowedIncludes?: string[];
        } & RouteBaseOption & {
            hooks?: LifecycleHooks;
        };
        [Method.INDEX]?: {
            /**
             * Way to order the result
             * @default Sort.ASC
             */
            sort?: Sort | `${Sort}`;
            /**
             * Type of pagination to use. Currently 'offset' and 'cursor' are supported.
             * @default PaginationType.CURSOR
             */
            paginationType?: PaginationType | `${PaginationType}`;
            /**
             * Max number of entities should be taken.
             * @default 100
             */
            numberOfTake?: number;
            /**
             * If set to true, soft-deleted entity could be included in the result.
             * @default true
             */
            softDelete?: boolean;
            /**
             * Keys to use for pagination.
             * If not set, the keys will be taken from the entity's primary keys.
             */
            paginationKeys?: string[];
            /**
             * Array of column names that are allowed to be filtered.
             * If not specified, uses the global allowedFilters from CrudOptions.
             * If both are not specified, no columns can be filtered.
             * @example ['name', 'email', 'age']
             */
            allowedFilters?: string[];
            /**
             * Array of relation names that are allowed to be included via include query parameter.
             * If not specified, uses the global allowedIncludes from CrudOptions.
             * If both are not specified, no relations can be included.
             * @example ['department', 'posts', 'posts.comments']
             */
            allowedIncludes?: string[];
        } & Omit<RouteBaseOption, 'response'>;

        [Method.CREATE]?: {
            swagger?: {
                /**
                 * Configures the Swagger documentation for the route's request body
                 */
                body?: Type<unknown>;
            };


            /**
             * Array of column names that are allowed in request parameters.
             * If not specified, uses the global allowedParams from CrudOptions.
             * If both are not specified, no columns can be used in request parameters.
             * @example ['name', 'email', 'age']
             */
            allowedParams?: string[];

            /**
             * Skip validation of properties that do not exist in the validating object.
             * If not specified, uses the global skipMissingProperties from CrudOptions.
             * Set to `false` to enforce strict required-field validation on CREATE.
             * @default true for CREATE operations
             */
            skipMissingProperties?: boolean;

            /**
             * DTO class to validate the request body against, instead of the entity.
             * Persistence still uses the entity (the DTO is a validation contract only).
             * When set, CREATE defaults skipMissingProperties to false (strict) so that
             * DTO-required fields are enforced. An explicit skipMissingProperties still wins.
             */
            dto?: Type<unknown>;
        } & RouteBaseOption &
            SaveOptions & {
                hooks?: LifecycleHooks;
            };
        [Method.UPDATE]?: {
            /**
             * Array of path parameters to use for the route
             *
             * @example
             * ```ts
             * params: ['id', 'subId']
             * ```
             * It will generate the route `/:id/:subId`.
             */
            params?: string[];
            swagger?: {
                /**
                 * Configures the Swagger documentation for the route's request body
                 */
                body?: Type<unknown>;
            };
            /**
             * Array of column names that are allowed in request parameters.
             * If not specified, uses the global allowedParams from CrudOptions.
             * If both are not specified, no columns can be used in request parameters.
             * @example ['name', 'email', 'age']
             */
            allowedParams?: string[];

            /**
             * Skip validation of properties that do not exist in the validating object.
             * If not specified, uses the global skipMissingProperties from CrudOptions.
             * @default true for UPDATE operations
             */
            skipMissingProperties?: boolean;

            /**
             * DTO class to validate the request body against, instead of the entity.
             * Persistence still uses the entity. UPDATE keeps PATCH semantics
             * (skipMissingProperties defaults to true) even with a DTO.
             */
            dto?: Type<unknown>;
        } & RouteBaseOption &
            SaveOptions & {
                hooks?: LifecycleHooks;
            };
        [Method.DESTROY]?: {
            /**
             * Array of path parameters to use for the route
             *
             * @example
             * ```ts
             * params: ['id', 'subId']
             * ```
             * It will generate the route `/:id/:subId`
             */
            params?: string[];
            /**
             * If set to true, the entity will be soft deleted. (Records the delete date of the entity)
             * @default false
             */
            softDelete?: boolean;
        } & RouteBaseOption &
            SaveOptions & {
                hooks?: LifecycleHooks;
            };
        [Method.UPSERT]?: {
            /**
             * Array of path parameters to use for the route
             *
             * @example
             * ```ts
             * params: ['id', 'subId']
             * ```
             * It will generate the route `/:id/:subId`
             */
            params?: string[];
            swagger?: {
                /**
                 * Configures the Swagger documentation for the route's request body
                 */
                body?: Type<unknown>;
            };
            /**
             * Array of column names that are allowed in request parameters.
             * If not specified, uses the global allowedParams from CrudOptions.
             * If both are not specified, no columns can be used in request parameters.
             * @example ['name', 'email', 'age']
             */
            allowedParams?: string[];

            /**
             * Skip validation of properties that do not exist in the validating object.
             * If not specified, uses the global skipMissingProperties from CrudOptions.
             * @default true for UPSERT operations
             */
            skipMissingProperties?: boolean;

            /**
             * DTO class to validate the request body against, instead of the entity.
             * Persistence still uses the entity. UPSERT keeps PATCH semantics
             * (skipMissingProperties defaults to true) even with a DTO.
             */
            dto?: Type<unknown>;
        } & RouteBaseOption &
            SaveOptions & {
                hooks?: LifecycleHooks;
            };
        [Method.RECOVER]?: {
            /**
             * Array of path parameters to use for the route
             *
             * @example
             * ```ts
             * params: ['id', 'subId']
             * ```
             * It will generate the route `/:id/:subId`
             */
            params?: string[];
        } & RouteBaseOption &
            SaveOptions & {
                hooks?: LifecycleHooks;
            };
    };
    /**
     * An array of methods to generate routes for. If not specified, all routes will be generated.
     */
    only?: Array<Method | `${Method}`>;

    /**
     * Pagination configuration options
     */
    pagination?: import('./pagination.interface').PaginationOptions;
}

/**
 * Lifecycle hook context information
 */
export interface HookContext<T = any> {
    /**
     * Current CRUD operation type
     */
    operation: Method;
    /**
     * Request parameters (e.g., { id: 1 })
     */
    params?: Record<string, any>;
    /**
     * Current entity (only provided for update, upsert, destroy, recover operations)
     */
    currentEntity?: T;
    /**
     * Controller instance (for accessing controller methods and properties)
     */
    controller?: any;
    /**
     * Additional information from request object
     */
    request?: any;
}

/**
 * Lifecycle hook function type definitions (for decorator-based hooks only)
 */
export interface LifecycleHooks<T = any> {
    /**
     * Executed before assigning data to the model.
     * 
     * Special behavior for UPDATE:
     * - CREATE/UPSERT: receives body data and returns modified body data
     * - UPDATE: receives entity and returns modified entity (body already assigned to entity)
     */
    assignBefore?: (bodyOrEntity: DeepPartial<T> | T, context: HookContext<T>) => Promise<DeepPartial<T> | T> | DeepPartial<T> | T;

    /**
     * Executed after assigning data to the model.
     * Can further modify the created entity.
     */
    assignAfter?: (entity: T, body: DeepPartial<T>, context: HookContext<T>) => Promise<T> | T;

    /**
     * Executed before saving to database.
     * Can perform final validation or additional processing.
     */
    saveBefore?: (entity: T, context: HookContext<T>) => Promise<T> | T;

    /**
     * Executed after saving to database.
     * Can perform post-processing or trigger events.
     */
    saveAfter?: (entity: T, context: HookContext<T>) => Promise<T> | T;

    /**
     * Executed before deleting an entity.
     * Can check permissions, clean up related data, or perform logging.
     */
    destroyBefore?: (entity: T, context: HookContext<T>) => Promise<T> | T;

    /**
     * Executed after deleting an entity.
     * Can clean up related data, send notifications, or trigger events.
     */
    destroyAfter?: (entity: T, context: HookContext<T>) => Promise<T> | T;

    /**
     * Executed before recovering a soft-deleted entity.
     * Can check permissions, prepare related data, or perform logging.
     */
    recoverBefore?: (entity: T, context: HookContext<T>) => Promise<T> | T;

    /**
     * Executed after recovering a soft-deleted entity.
     * Can restore related data, send notifications, or trigger events.
     */
    recoverAfter?: (entity: T, context: HookContext<T>) => Promise<T> | T;
}

