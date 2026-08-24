/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any */
import { HttpStatus as _HttpStatus, UnprocessableEntityException } from '@nestjs/common';
import {
    CUSTOM_ROUTE_ARGS_METADATA,
    HTTP_CODE_METADATA as _HTTP_CODE_METADATA,
    INTERCEPTORS_METADATA,
    METHOD_METADATA,
    PARAMTYPES_METADATA,
    PATH_METADATA,
    ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { getMetadataArgsStorage, DefaultNamingStrategy } from 'typeorm';
import { MetadataUtils } from 'typeorm/metadata-builder/MetadataUtils';

import { capitalizeFirstLetter } from './capitalize-first-letter';
import { CRUD_ROUTE_ARGS } from './constants';
import { CRUD_POLICY } from './crud.policy';
import { CreateRequestDto, getPropertyNamesFromMetadata } from './dto/request.dto';
import { getLifecycleHooks, LifecycleHookMetadata } from './dto/lifecycle-hooks.decorator';
import { buildCrudOptionsFromChaining } from './decorator/chaining.decorator';
import { buildConditionalCrudOptions } from './decorator/conditional.decorator';
import { Method, PaginationType, PAGINATION_SWAGGER_QUERY } from './interface';
import { CrudLogger } from './provider/crud-logger';

import type {
    Column,
    CrudCreateRequest,
    CrudCreateManyRequest,
    CrudDeleteOneRequest,
    CrudDeleteManyRequest,
    CrudOptions,
    CrudReadOneRequest,
    CrudRecoverRequest,
    CrudRecoverManyRequest,
    CrudUpdateOneRequest,
    CrudUpdateManyRequest,
    CrudUpsertRequest,
    CrudUpsertManyRequest,
    FactoryOption,
    PrimaryKey,
    EntityType,
} from './interface';
import type { CrudReadManyRequest } from './request';
import type { ExecutionContext, Type } from '@nestjs/common';

type ParameterDecorators =
    | {
        name?: string;
        description?: string;
        required: boolean;
        in: string;
        items?: { type: string };
        type: unknown;
        isArray?: boolean;
    }
    | {
        name?: any;
        description?: string;
        required: boolean;
        in: string;
        type: unknown;
        schema: {
            [type: string]: unknown;
        };
        examples?: {
            [type: string]: { value: unknown };
        };
    };

export class CrudRouteFactory {
    private crudLogger: CrudLogger;
    private entity: {
        tableName: string;
        relations?: string[];
        primaryKeys?: PrimaryKey[];
        columns?: Column[];
    } = {
            tableName: '',
        };

    constructor(
        protected target: any,
        protected crudOptions: CrudOptions,
    ) {
        // 체이닝 데코레이터로부터 옵션 병합
        this.mergeChainingOptions();
        
        this.entityInformation(this.crudOptions.entity);

        this.crudLogger = new CrudLogger(this.crudOptions.logging);
    }

    /**
     * 체이닝 데코레이터들로부터 옵션을 병합
     */
    private mergeChainingOptions(): void {
        // 체이닝 데코레이터로부터 옵션 가져오기
        const chainingOptions = buildCrudOptionsFromChaining(this.target);
        const conditionalOptions = buildConditionalCrudOptions(this.target);

        // 체이닝 옵션이 있으면 병합
        if (chainingOptions) {
            this.crudOptions = {
                ...chainingOptions,
                ...this.crudOptions, // 기존 옵션이 우선순위를 가짐
            };
        }

        // 조건부 옵션 병합
        this.crudOptions = {
            ...this.crudOptions,
            ...conditionalOptions,
        };
    }

    init(): void {
        // 데코레이터 기반 생명주기 훅 처리
        this.processLifecycleHooks();

        for (const method of Object.values(Method)) {
            if (!this.enabledMethod(method)) {
                continue;
            }
            this.createMethod(method);
        }
    }

    private processLifecycleHooks(): void {
        const lifecycleHooks = getLifecycleHooks(this.target.prototype);

        if (lifecycleHooks.length === 0) {
            return;
        }

        // routes 객체가 없으면 초기화
        if (!this.crudOptions.routes) {
            this.crudOptions.routes = {};
        }

        // 메서드별로 훅을 그룹화
        const hooksByMethod = lifecycleHooks.reduce((acc, hook) => {
            if (!acc[hook.methodType]) {
                acc[hook.methodType] = {};
            }
            if (!acc[hook.methodType][hook.hookType]) {
                acc[hook.methodType][hook.hookType] = [];
            }
            acc[hook.methodType][hook.hookType].push(hook);
            return acc;
        }, {} as Record<string, Record<string, LifecycleHookMetadata[]>>);

        // 각 메서드의 훅을 routes 설정에 적용
        Object.entries(hooksByMethod).forEach(([methodType, hooks]) => {
            const method = methodType as keyof typeof this.crudOptions.routes;

            // 메서드 설정이 없으면 초기화
            if (!this.crudOptions.routes![method]) {
                this.crudOptions.routes![method] = {} as any;
            }

            // hooks 설정이 없으면 초기화
            if (!(this.crudOptions.routes![method] as any).hooks) {
                (this.crudOptions.routes![method] as any).hooks = {};
            }

            const routeHooks = (this.crudOptions.routes![method] as any).hooks;

            // 각 훅 타입별로 메서드들을 등록
            Object.entries(hooks).forEach(([hookType, hookMetadataList]) => {
                // 여러 훅을 체인으로 실행하는 함수 생성
                // 훅 타입마다 인자 개수가 다르다 (예: assignAfter는 (entity, body, context) 3개,
                // 나머지는 (data, context) 2개). 마지막 인자를 항상 context로, 첫 인자를 체이닝 대상
                // 데이터로 취급하고 중간 인자(body 등)는 그대로 전달해 시그니처를 보존한다.
                const chainedHookFunction = async (...args: any[]) => {
                    const context = args[args.length - 1];
                    let result = args[0];

                    // context가 없으면 훅을 실행하지 않고 원래 데이터 반환
                    if (!context) {
                        return result;
                    }

                    // 컨트롤러 인스턴스를 context에서 가져오기
                    // context.controller가 실제 DI된 컨트롤러 인스턴스
                    const controllerInstance = context.controller || context.instance;

                    // 각 훅을 순차적으로 실행하면서 결과를 다음 훅으로 전달
                    for (const hookMetadata of hookMetadataList) {
                        const methodName = hookMetadata.methodName;

                        if (controllerInstance && typeof controllerInstance[methodName] === 'function') {
                            // Hook 실행 결과를 반드시 반환값으로 사용
                            const hookResult = await controllerInstance[methodName](result, ...args.slice(1));
                            // Hook이 값을 반환하면 사용, 아니면 원래 값 유지
                            result = hookResult !== undefined ? hookResult : result;
                        }
                    }

                    return result;
                };

                // 기존 훅이 있으면 배열로 합치고, 없으면 새로 생성
                if (routeHooks[hookType]) {
                    // 기존 훅과 새로운 체인드 훅을 결합
                    const existingHook = routeHooks[hookType];
                    routeHooks[hookType] = async (...args: any[]) => {
                        const context = args[args.length - 1];
                        // 기존 훅 먼저 실행
                        let result = args[0];
                        if (Array.isArray(existingHook)) {
                            for (const hook of existingHook) {
                                result = await hook(result, ...args.slice(1));
                            }
                        } else {
                            result = await existingHook(result, ...args.slice(1));
                        }

                        // 그 다음 새로운 체인드 훅 실행
                        return await chainedHookFunction(result, ...args.slice(1, -1), context);
                    };
                } else {
                    routeHooks[hookType] = chainedHookFunction;
                }
            });
        });
    }

    private entityInformation(entity: EntityType): void {
        const tableName = (() => {
            const table = getMetadataArgsStorage().tables.find(({ target }) => target === entity);

            if (!table) {
                throw new Error('Cannot find Table from TypeORM');
            }

            const namingStrategy = (tableName: string | undefined) => new DefaultNamingStrategy().tableName(entity.name, tableName);

            if (!table.name && table.type === 'entity-child') {
                const discriminatorValue = getMetadataArgsStorage().discriminatorValues.find(({ target }) => target === entity)?.value;
                return namingStrategy(typeof discriminatorValue === 'string' ? discriminatorValue : discriminatorValue?.name);
            }

            return namingStrategy(table.name);
        })();
        this.entity.tableName = tableName;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        const inheritanceTree = MetadataUtils.getInheritanceTree(entity as Function);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        const columnList = getMetadataArgsStorage().columns.filter(({ target }) => inheritanceTree.includes(target as Function));

        const entityColumns = columnList.map(({ propertyName, options }) => ({
            name: propertyName,
            type: options.type,
            isPrimary: Boolean(options.primary),
        }));

        this.entity.columns = entityColumns;

        const primaryKeys = entityColumns.filter(({ isPrimary }) => isPrimary);
        if (!(primaryKeys.length === 1 && primaryKeys[0].name === 'id')) {
            this.entity.primaryKeys = primaryKeys;
        }

        this.entity.relations = getMetadataArgsStorage().relations.flatMap(({ target, propertyName }) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            inheritanceTree.includes(target as Function) ? [propertyName] : [],
        );
    }

    protected get tableName(): string {
        return this.entity.tableName;
    }

    protected get targetPrototype(): any {
        return this.target.prototype;
    }

    protected show<T>(controllerMethodName: string): void {
        this.targetPrototype[controllerMethodName] = function handleShow(crudReadOneRequest: CrudReadOneRequest<T>) {
            // Set controller instance for hooks
            if (this.crudService.setControllerInstance) {
                this.crudService.setControllerInstance(this);
            }
            return this.crudService.handleShow(crudReadOneRequest);
        };
    }

    protected index<T>(controllerMethodName: string): void {
        this.targetPrototype[controllerMethodName] = function handleIndex(crudReadManyRequest: CrudReadManyRequest<T>) {
            return this.crudService.handleIndex(crudReadManyRequest);
        };
    }



    protected create<T>(controllerMethodName: string): void {
        this.targetPrototype[controllerMethodName] = function handleCreate(crudCreateRequest: CrudCreateRequest<T>) {
            // Set controller instance for hooks
            if (this.crudService.setControllerInstance) {
                this.crudService.setControllerInstance(this);
            }
            return this.crudService.handleCreate(crudCreateRequest);
        };
    }

    protected upsert<T>(controllerMethodName: string): void {
        this.targetPrototype[controllerMethodName] = function handleUpsert(crudUpsertRequest: CrudUpsertRequest<T> | CrudUpsertManyRequest<T>) {
            // Set controller instance for hooks
            if (this.crudService.setControllerInstance) {
                this.crudService.setControllerInstance(this);
            }
            return this.crudService.handleUpsert(crudUpsertRequest);
        };
    }

    protected update<T>(controllerMethodName: string): void {
        this.targetPrototype[controllerMethodName] = function handleUpdate(crudUpdateRequest: CrudUpdateOneRequest<T> | CrudUpdateManyRequest<T>) {
            // Set controller instance for hooks
            if (this.crudService.setControllerInstance) {
                this.crudService.setControllerInstance(this);
            }
            return this.crudService.handleUpdate(crudUpdateRequest);
        };
    }

    protected destroy<T>(controllerMethodName: string): void {
        this.targetPrototype[controllerMethodName] = function handleDestroy(crudDeleteRequest: CrudDeleteOneRequest<T> | CrudDeleteManyRequest<T>) {
            return this.crudService.handleDestroy(crudDeleteRequest);
        };
    }

    protected recover<T>(controllerMethodName: string): void {
        this.targetPrototype[controllerMethodName] = function handleRecover(crudRecoverRequest: CrudRecoverRequest<T> | CrudRecoverManyRequest<T>) {
            return this.crudService.handleRecover(crudRecoverRequest);
        };
    }

    private createMethod(crudMethod: Method): void {
        if (crudMethod === Method.RECOVER) {
            const enableRecover = this.crudOptions.routes?.[Method.DESTROY]?.softDelete ?? CRUD_POLICY[Method.DESTROY].default.softDeleted;
            if (!enableRecover) {
                return;
            }
        }

        const methodName = this.writeMethodOnController(crudMethod);

        const targetMethod = this.targetPrototype[methodName];
        const { path, params } = CRUD_POLICY[crudMethod].uriParameter(this.crudOptions, this.entity.primaryKeys);
        const methodNameOnController = this.controllerMethodName(crudMethod);
        const factoryOption: FactoryOption = {
            columns: this.entity.columns,
            relations: this.entity.relations ?? [],
            primaryKeys: this.entity.primaryKeys ?? [{ name: 'id', type: 'number' }],
            logger: this.crudLogger,
        };

        const needPagination = crudMethod === Method.INDEX;
        const paginationType = (() => {
            if (!needPagination) {
                return undefined;
            }
            const input = this.crudOptions.routes?.[crudMethod]?.paginationType ?? CRUD_POLICY[crudMethod].default.paginationType;
            const isPaginationType = (
                <TEnum extends Record<string, unknown>>(enumType: TEnum) =>
                    (nextCursor: unknown): nextCursor is TEnum[keyof TEnum] =>
                        Object.values(enumType).includes(nextCursor as TEnum[keyof TEnum])
            )(PaginationType);
            if (!isPaginationType(input)) {
                throw new TypeError(`invalid PaginationType ${input}`);
            }
            return input;
        })();

        if (needPagination) {
            this.validatePaginationKeys(this.crudOptions.routes?.[crudMethod]?.paginationKeys);
        }

        // Add ExcludeFieldsInterceptor if there are fields to exclude
        const hasExcludeFields = (this.crudOptions.exclude?.length ?? 0) > 0 || 
                                 ((this.crudOptions.routes?.[crudMethod] as any)?.exclude?.length ?? 0) > 0;
        
        const interceptors = [
            ...(this.crudOptions.routes?.[crudMethod]?.interceptors ?? []),
            CRUD_POLICY[crudMethod].interceptor(this.crudOptions, factoryOption),
        ];

        // Add ExcludeFieldsInterceptor at the end to process the final response
        if (hasExcludeFields) {
            const { ExcludeFieldsInterceptor } = require('./interceptor/exclude-fields.interceptor');
            interceptors.push(ExcludeFieldsInterceptor);
        }

        Reflect.defineMetadata(
            INTERCEPTORS_METADATA,
            interceptors.filter(Boolean),
            targetMethod,
        );

        this.applySwaggerDecorator(crudMethod, params, targetMethod, paginationType);

        const requestArg = this.createCrudRouteArg();
        Reflect.defineMetadata(ROUTE_ARGS_METADATA, requestArg, this.target, methodNameOnController);
        Reflect.defineMetadata(PARAMTYPES_METADATA, [Object], this.targetPrototype, methodNameOnController);



        const customDecorators = this.crudOptions.routes?.[crudMethod]?.decorators ?? [];

        if (customDecorators.length > 0) {
            for (const decorator of customDecorators) {
                const descriptor = Reflect.getOwnPropertyDescriptor(targetMethod, methodNameOnController);
                (decorator as MethodDecorator | PropertyDecorator)(
                    targetMethod,
                    methodNameOnController,
                    descriptor ?? { value: targetMethod },
                );
            }
        }

        Reflect.defineMetadata(PATH_METADATA, path, targetMethod);
        Reflect.defineMetadata(METHOD_METADATA, CRUD_POLICY[crudMethod].method, targetMethod);
    }

    private validatePaginationKeys(paginationKeys: string[] | undefined) {
        if (!paginationKeys) {
            return;
        }

        for (const key of paginationKeys) {
            if (!this.entity.columns?.some((column) => column.name === key)) {
                throw new UnprocessableEntityException(`pagination key ${key} is unknown`);
            }
        }
    }

    private applySwaggerDecorator(method: Method, params: string[], target: Record<string, unknown>, paginationType?: PaginationType) {
        if (this.crudOptions.routes?.[method]?.swagger?.hide) {
            Reflect.defineMetadata(DECORATORS.API_EXCLUDE_ENDPOINT, { disable: true }, target);
            return;
        }

        Reflect.defineMetadata(DECORATORS.API_OPERATION, CRUD_POLICY[method].swagger.operationMetadata(this.tableName), target);
        this.defineParameterSwagger(method, params, target, paginationType);

        const routeConfig = this.crudOptions.routes?.[method];
        if (routeConfig?.swagger?.response) {
            const responseDto = this.generalTypeGuard(routeConfig.swagger.response, method, 'response');
            const extraModels: Array<{ name: string }> = Reflect.getMetadata(DECORATORS.API_EXTRA_MODELS, target) ?? [];
            if (!extraModels.some((model) => model.name === responseDto.name)) {
                Reflect.defineMetadata(DECORATORS.API_EXTRA_MODELS, [...extraModels, responseDto], target);
            }
        }
        const swaggerResponse = this.crudOptions.routes?.[method]?.swagger?.response ?? (this.crudOptions.entity as Type<EntityType>);

        Reflect.defineMetadata(
            DECORATORS.API_RESPONSE,
            CRUD_POLICY[method].swagger.responseMetadata({
                type: swaggerResponse,
                tableName: this.tableName,
                paginationType: paginationType,
            }),
            target,
        );

        if (method === Method.INDEX) {
            const extraModels: Array<{ name: string }> = Reflect.getMetadata(DECORATORS.API_EXTRA_MODELS, target) ?? [];
            Reflect.defineMetadata(DECORATORS.API_EXTRA_MODELS, [...extraModels, swaggerResponse], target);
        }
    }

    private defineParameterSwagger(method: Method, params: string[], target: Record<string, unknown>, paginationType?: PaginationType) {
        const parameterDecorators: ParameterDecorators[] = params.map((param) => ({
            name: param,
            required: true,
            in: 'path',
            type: String,
            isArray: false,
        }));

        if (method === Method.INDEX && paginationType) {
            parameterDecorators.push(
                ...PAGINATION_SWAGGER_QUERY[paginationType].map(({ name, type }) => ({
                    name,
                    type,
                    in: 'query',
                    required: false,
                    description: `Query parameters for ${capitalizeFirstLetter(paginationType)} Pagination`,
                })),
                ...getPropertyNamesFromMetadata(this.crudOptions.entity, method).map((property) => ({
                    name: property,
                    type: 'string',
                    in: 'query',
                    required: false,
                    description: `Query string filter by ${this.crudOptions.entity.name}.${property}`,
                })),
            );
        }
        if (method === Method.SHOW) {
            parameterDecorators.push({
                name: 'fields',
                type: 'array',
                in: 'query',
                items: {
                    type: 'string',
                },
                required: false,
                description: 'Pick response fields',
            });
        }
        if (CRUD_POLICY[method].useBody) {

            const bodyType = (() => {
                const customBody = this.crudOptions.routes?.[method]?.swagger?.body;
                if (customBody) {
                    return this.generalTypeGuard(customBody, method, 'body');
                }
                return CreateRequestDto(this.crudOptions.entity, method);
            })();
            parameterDecorators.push(
                method === Method.CREATE
                    ? {
                        description: [capitalizeFirstLetter(method), capitalizeFirstLetter(this.tableName), 'Dto'].join(''),
                        required: true,
                        in: 'body',
                        type: bodyType,
                        schema: {
                            type: 'object',
                            anyOf: [
                                {
                                    $ref: `#/components/schemas/${bodyType.name}`,
                                },
                                { type: 'array', items: { $ref: `#/components/schemas/${bodyType.name}` } },
                            ],
                        },
                    }
                    : {
                        description: [capitalizeFirstLetter(method), capitalizeFirstLetter(this.tableName), 'Dto'].join(''),
                        required: true,
                        in: 'body',
                        type: bodyType,
                        isArray: false,
                    },
            );
        }

        Reflect.defineMetadata(DECORATORS.API_PARAMETERS, parameterDecorators, target);
    }

    private enabledMethod(crudMethod: Method): boolean {
        if (!Array.isArray(this.crudOptions.only) || this.crudOptions.only.length === 0) {
            return true;
        }
        return this.crudOptions.only.includes(crudMethod);
    }

    private controllerMethodName(crudMethod: Method): string {
        return `reserved${capitalizeFirstLetter(crudMethod)}`;
    }

    private writeMethodOnController(crudMethod: Method): string {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const entity = this.crudOptions.entity;
        const controllerMethodName: string = this.controllerMethodName(crudMethod);

        if (this.targetPrototype[controllerMethodName]) {
            throw new Error(`${controllerMethodName} is a reserved word. cannot use`);
        }
        this[crudMethod]<typeof entity>(controllerMethodName);
        return controllerMethodName;
    }

    private createCrudRouteArg(
        index = 0,
        /* istanbul ignore next */
        pipes: unknown[] = [],
        data = undefined,
    ) {
        return {
            [`${CRUD_ROUTE_ARGS}${CUSTOM_ROUTE_ARGS_METADATA}:${index}`]: {
                index,
                factory: (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest()[CRUD_ROUTE_ARGS],
                data,
                pipes,
            },
        };
    }

    private generalTypeGuard<T extends Type<unknown>>(type: T, method: Method, postFix?: string): T {
        if (['PickTypeClass', 'OmitTypeClass'].includes(type.name)) {
            Object.defineProperty(type, 'name', {
                value: [
                    capitalizeFirstLetter(method),
                    capitalizeFirstLetter(this.tableName),
                    postFix && capitalizeFirstLetter(postFix),
                    'Dto',
                ].join(''),
            });
        }
        return type;
    }
}
