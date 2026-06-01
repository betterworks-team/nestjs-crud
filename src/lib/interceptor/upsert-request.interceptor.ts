/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, mixin, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import _ from 'lodash';

import { RequestAbstractInterceptor } from '../abstract';
import { CRUD_ROUTE_ARGS } from '../constants';
import { Method } from '../interface';

import type { CallHandler, ExecutionContext, NestInterceptor, Type } from '@nestjs/common';
import type { ClassConstructor } from 'class-transformer';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { CrudOptions, CrudUpsertRequest, CrudUpsertManyRequest, EntityType, FactoryOption } from '../interface';

const method = Method.UPSERT;
export function UpsertRequestInterceptor(crudOptions: CrudOptions, factoryOption: FactoryOption): Type<NestInterceptor> {
    class MixinInterceptor extends RequestAbstractInterceptor implements NestInterceptor {
        constructor() {
            super(factoryOption.logger);
        }

        async intercept(context: ExecutionContext, next: CallHandler<unknown>): Promise<Observable<unknown>> {
            const req = context.switchToHttp().getRequest<Request>();
            const upsertOptions = crudOptions.routes?.[method] ?? {};

            // Check if body is array for bulk upsert or if the ID is "bulk"
            const isBulkUpsert = Array.isArray(req.body) || req.params?.id === 'bulk';
            
            // Filter body parameters based on allowedParams
            const allowedParams = upsertOptions.allowedParams ?? crudOptions.allowedParams;
            
            if (isBulkUpsert) {
                // Bulk upsert handling
                // Ensure body is an array for bulk operations
                if (!Array.isArray(req.body)) {
                    throw new UnprocessableEntityException('Body must be an array for bulk upsert operations');
                }
                
                if (allowedParams) {
                    req.body = req.body.map((item: any) => 
                        typeof item === 'object' && item !== null ? this.filterAllowedParams(item, allowedParams) : item
                    );
                }
                
                const validatedBodies = await Promise.all(
                    req.body.map((item: any) => this.validateBody(item, upsertOptions))
                );
                
                const crudUpsertManyRequest: CrudUpsertManyRequest<typeof crudOptions.entity> = {
                    body: validatedBodies,
                    exclude: new Set(upsertOptions.exclude ?? []),
                    saveOptions: {
                        listeners: upsertOptions.listeners,
                    },
                    hooks: upsertOptions.hooks,
                    request: req,
                };
                
                this.crudLogger.logRequest(req, crudUpsertManyRequest);
                (req as unknown as Record<string, unknown>)[CRUD_ROUTE_ARGS] = crudUpsertManyRequest;
            } else {
                // Single upsert handling (existing logic)
                const params = await this.checkParams(
                    crudOptions.entity,
                    req.params,
                    factoryOption.columns,
                    new ConflictException('Invalid params'),
                );

                const primaryKeySet = new Set((factoryOption.primaryKeys ?? []).map((primaryKey) => primaryKey.name));
                for (const [key, value] of Object.entries(req.params)) {
                    if (primaryKeySet.has(key)) {
                        continue;
                    }
                    if (!_.isNil(req.body[key]) && `${req.body[key]}` !== `${value}`) {
                        this.crudLogger.log(`The value of ${req.body[key]} for ${key} is not ${value}`);
                        throw new ConflictException(`${key}'s value of body and param do not match`);
                    }
                    req.body[key] = value;
                }

                if (allowedParams && req.body && typeof req.body === 'object') {
                    req.body = this.filterAllowedParams(req.body, allowedParams);
                }

                const body = await this.validateBody(req.body ?? {}, upsertOptions);

                const crudUpsertRequest: CrudUpsertRequest<typeof crudOptions.entity> = {
                    params,
                    body,
                    exclude: new Set(upsertOptions.exclude ?? []),
                    saveOptions: {
                        listeners: upsertOptions.listeners,
                    },
                    hooks: upsertOptions.hooks,
                    request: req,
                };

                this.crudLogger.logRequest(req, crudUpsertRequest);
                (req as unknown as Record<string, unknown>)[CRUD_ROUTE_ARGS] = crudUpsertRequest;
            }

            return next.handle();
        }

        filterAllowedParams(body: any, allowedParams: string[]): any {
            if (!body || typeof body !== 'object') {
                return body;
            }

            const filtered: any = {};
            for (const key of Object.keys(body)) {
                if (allowedParams.includes(key)) {
                    filtered[key] = body[key];
                }
            }
            return filtered;
        }

        async validateBody(body: unknown, methodOptions: any = {}) {
            if (_.isNil(body) || !_.isObject(body)) {
                throw new UnprocessableEntityException('Body must be a valid object');
            }

            const bodyKeys = Object.keys(body);

            // Primary key 체크
            const bodyContainsPrimaryKey = (factoryOption.primaryKeys ?? []).some((primaryKey) => bodyKeys.includes(primaryKey.name));
            if (bodyContainsPrimaryKey) {
                const primaryKeyNames = (factoryOption.primaryKeys ?? []).map((key) => key.name);

                this.crudLogger.log(
                    `Cannot include value of primary key (primary key: ${primaryKeyNames.toLocaleString()}, body key: ${bodyKeys.toLocaleString()}`,
                );
                throw new UnprocessableEntityException('Cannot include value of primary key');
            }

            // 🎯 allowedParams 추출 (메서드별 우선, 전역 fallback)
            const allowedParams = methodOptions.allowedParams ?? crudOptions.allowedParams;

            try {
                // dto가 지정되면 엔티티 대신 DTO로 검증한다 (UPSERT는 PATCH 의미라 lenient 유지).
                const dto = methodOptions.dto as ClassConstructor<object> | undefined;
                const validationTarget = (dto ?? crudOptions.entity) as unknown as ClassConstructor<EntityType>;
                const transformed = plainToInstance(validationTarget, body);

                // Priority: method-specific > global > default (true for UPSERT)
                const skipMissingProperties = methodOptions.skipMissingProperties ?? crudOptions.skipMissingProperties ?? true;

                const errorList = await validate(transformed, {
                    whitelist: true,
                    forbidNonWhitelisted: false,
                    forbidUnknownValues: false,
                    skipMissingProperties,
                });

                if (errorList.length > 0) {
                    this.crudLogger.log(errorList, 'ValidationError');
                    throw new UnprocessableEntityException(errorList);
                }

                // dto로 검증했으면 저장용으로 엔티티에 매핑한다.
                return dto ? plainToInstance(crudOptions.entity as unknown as ClassConstructor<EntityType>, body) : transformed;
            } catch (error) {
                throw error;
            }
        }
    }

    return mixin(MixinInterceptor);
}
