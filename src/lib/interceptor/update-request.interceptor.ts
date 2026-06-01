/* eslint-disable @typescript-eslint/no-explicit-any */
import { mixin, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance, instanceToPlain } from 'class-transformer';
import { validate } from 'class-validator';
import _ from 'lodash';

import { RequestAbstractInterceptor } from '../abstract';
import { CRUD_ROUTE_ARGS } from '../constants';
import { Method } from '../interface';

import type { CallHandler, ExecutionContext, NestInterceptor, Type } from '@nestjs/common';
import type { ClassConstructor } from 'class-transformer';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { CrudOptions, CrudUpdateOneRequest, CrudUpdateManyRequest, EntityType, FactoryOption } from '../interface';

const method = Method.UPDATE;
export function UpdateRequestInterceptor(crudOptions: CrudOptions, factoryOption: FactoryOption): Type<NestInterceptor> {
    class MixinInterceptor extends RequestAbstractInterceptor implements NestInterceptor {
        constructor() {
            super(factoryOption.logger);
        }

        async intercept(context: ExecutionContext, next: CallHandler<unknown>): Promise<Observable<unknown>> {
            const req = context.switchToHttp().getRequest<Request>();
            const updatedOptions = crudOptions.routes?.[method] ?? {};

            // Check if body is array for bulk update or if the ID is "bulk"
            const isBulkUpdate = Array.isArray(req.body) || req.params?.id === 'bulk';
            
            // Filter body parameters based on allowedParams
            const allowedParams = updatedOptions.allowedParams ?? crudOptions.allowedParams;
            
            if (isBulkUpdate) {
                // Bulk update handling
                // Ensure body is an array for bulk operations
                if (!Array.isArray(req.body)) {
                    throw new UnprocessableEntityException('Body must be an array for bulk update operations');
                }
                
                if (allowedParams) {
                    // For bulk updates, we need to preserve the primary key
                    const primaryKeyName = factoryOption.primaryKeys?.[0]?.name || 'id';
                    req.body = req.body.map((item: any) => {
                        if (typeof item === 'object' && item !== null) {
                            const filtered = this.filterAllowedParams(item, allowedParams);
                            // Always preserve the primary key for bulk updates
                            if (item[primaryKeyName] !== undefined) {
                                filtered[primaryKeyName] = item[primaryKeyName];
                            }
                            return filtered;
                        }
                        return item;
                    });
                }
                
                const validatedBodies = await Promise.all(
                    req.body.map((item: any) => this.validateBulkUpdateItem(item, updatedOptions))
                );
                
                const crudUpdateManyRequest: CrudUpdateManyRequest<typeof crudOptions.entity> = {
                    body: validatedBodies,
                    exclude: new Set(updatedOptions.exclude ?? []),
                    saveOptions: {
                        listeners: updatedOptions.listeners,
                    },
                    hooks: updatedOptions.hooks,
                    request: req,
                };
                
                this.crudLogger.logRequest(req, crudUpdateManyRequest);
                (req as unknown as Record<string, unknown>)[CRUD_ROUTE_ARGS] = crudUpdateManyRequest;
            } else {
                // Single update handling (existing logic)
                if (allowedParams && req.body && typeof req.body === 'object') {
                    req.body = this.filterAllowedParams(req.body, allowedParams);
                }

                const body = await this.validateBody(req.body ?? {}, updatedOptions);

                const params = await this.checkParams(crudOptions.entity, req.params, factoryOption.columns);
                const crudUpdateOneRequest: CrudUpdateOneRequest<typeof crudOptions.entity> = {
                    params,
                    body,
                    exclude: new Set(updatedOptions.exclude ?? []),
                    saveOptions: {
                        listeners: updatedOptions.listeners,
                    },
                    hooks: updatedOptions.hooks,
                    request: req,
                };

                this.crudLogger.logRequest(req, crudUpdateOneRequest);
                (req as unknown as Record<string, unknown>)[CRUD_ROUTE_ARGS] = crudUpdateOneRequest;
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
                throw new UnprocessableEntityException('Cannot changed value of primary key');
            }

            // 🎯 allowedParams 추출 (메서드별 우선, 전역 fallback)
            const allowedParams = methodOptions.allowedParams ?? crudOptions.allowedParams;

            try {
                // dto가 지정되면 엔티티 대신 DTO로 검증한다 (UPDATE는 PATCH 의미라 lenient 유지).
                const dto = methodOptions.dto as ClassConstructor<object> | undefined;
                const validationTarget = (dto ?? crudOptions.entity) as ClassConstructor<EntityType>;
                const transformed = plainToInstance(validationTarget, body);

                // Priority: method-specific > global > default (true for UPDATE)
                const skipMissingProperties = methodOptions.skipMissingProperties ?? crudOptions.skipMissingProperties ?? true;

                const errorList = await validate(transformed, {
                    whitelist: true,
                    forbidNonWhitelisted: false,
                    forbidUnknownValues: false,
                    stopAtFirstError: true,
                    skipMissingProperties,
                });

                if (errorList.length > 0) {
                    this.crudLogger.log(errorList, 'ValidationError');
                    throw new UnprocessableEntityException(errorList);
                }

                // dto로 검증했으면 저장용으로 엔티티에 매핑한다.
                return dto ? plainToInstance(crudOptions.entity as ClassConstructor<EntityType>, body) : transformed;
            } catch (error) {
                throw error;
            }
        }

        async validateBulkUpdateItem(body: unknown, methodOptions: any = {}) {
            if (_.isNil(body) || !_.isObject(body)) {
                throw new UnprocessableEntityException('Each item must be a valid object');
            }

            const bodyKeys = Object.keys(body);

            // Check for ID (required for bulk update)
            const primaryKeyName = factoryOption.primaryKeys?.[0]?.name || 'id';
            if (!bodyKeys.includes(primaryKeyName)) {
                throw new UnprocessableEntityException(`Each item must include the primary key: ${primaryKeyName}`);
            }

            // Extract ID and validate other fields (ID is allowed in bulk update)
            const { [primaryKeyName]: id, ...updateData } = body as any;
            
            // Validate update data
            try {
                const dto = methodOptions.dto as ClassConstructor<object> | undefined;
                const validationTarget = (dto ?? crudOptions.entity) as ClassConstructor<EntityType>;
                const transformed = plainToInstance(validationTarget, updateData);

                // Priority: method-specific > global > default (true for UPDATE)
                const skipMissingProperties = methodOptions.skipMissingProperties ?? crudOptions.skipMissingProperties ?? true;

                const errorList = await validate(transformed, {
                    whitelist: true,
                    forbidNonWhitelisted: false,
                    forbidUnknownValues: false,
                    stopAtFirstError: true,
                    skipMissingProperties,
                });

                if (errorList.length > 0) {
                    this.crudLogger.log(errorList, 'ValidationError');
                    throw new UnprocessableEntityException(errorList);
                }

                // Return the complete object with ID
                // Return the original body since validation passed
                // This preserves all properties that were in the original request
                return body;
            } catch (error) {
                throw error;
            }
        }
    }
    return mixin(MixinInterceptor);
}
