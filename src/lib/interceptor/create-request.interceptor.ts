/* eslint-disable @typescript-eslint/no-explicit-any */
import { mixin, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RequestAbstractInterceptor } from '../abstract';
import { CRUD_ROUTE_ARGS } from '../constants';
import { Method } from '../interface';

import type { CallHandler, ExecutionContext, NestInterceptor, Type } from '@nestjs/common';
import type { ClassConstructor } from 'class-transformer';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { DeepPartial } from 'typeorm';
import type { CrudCreateRequest, CrudOptions, EntityType, FactoryOption } from '../interface';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface NestedBaseEntityArray extends Array<NestedBaseEntityArray | DeepPartial<EntityType>> {}
type BaseEntityOrArray = DeepPartial<EntityType> | NestedBaseEntityArray;

const method = Method.CREATE;
export function CreateRequestInterceptor(crudOptions: CrudOptions, factoryOption: FactoryOption): Type<NestInterceptor> {
    class MixinInterceptor extends RequestAbstractInterceptor implements NestInterceptor {
        constructor() {
            super(factoryOption.logger);
        }

        async intercept(context: ExecutionContext, next: CallHandler<unknown>): Promise<Observable<unknown>> {
            const req = context.switchToHttp().getRequest<Request>();
            const createOptions = crudOptions.routes?.[method] ?? {};

            if (Object.keys(req.params ?? {}).length > 0) {
                Object.assign(req.body, req.params);
            }

            // Filter body parameters based on allowedParams
            const allowedParams = createOptions.allowedParams ?? crudOptions.allowedParams;
            if (allowedParams && req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
                req.body = this.filterAllowedParams(req.body, allowedParams);
            } else if (Array.isArray(req.body)) {
                // Handle array of objects
                req.body = req.body.map((item) =>
                    allowedParams && typeof item === 'object' && item !== null ? this.filterAllowedParams(item, allowedParams) : item,
                );
            }

            const body = await this.validateBody(req.body, createOptions);

            const crudCreateRequest: CrudCreateRequest<typeof crudOptions.entity> = {
                body,
                exclude: new Set(createOptions.exclude ?? []),
                saveOptions: {
                    listeners: createOptions.listeners,
                },
                hooks: createOptions.hooks,
                request: req,
            };

            this.crudLogger.logRequest(req, crudCreateRequest);
            (req as unknown as Record<string, unknown>)[CRUD_ROUTE_ARGS] = crudCreateRequest;
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

        async validateBody(body: unknown, methodOptions: any = {}): Promise<BaseEntityOrArray> {
            if (Array.isArray(body)) {
                return Promise.all(body.map((b) => this.validateBody(b, methodOptions)));
            }

            if (!body || typeof body !== 'object') {
                throw new UnprocessableEntityException('Body must be a valid object');
            }

            // 🎯 allowedParams 추출 (메서드별 우선, 전역 fallback)
            const allowedParams = methodOptions.allowedParams ?? crudOptions.allowedParams;

            // 🚀 동적 검증 메타데이터 생성
            try {
                // 임포트 추가 필요하지만 일단 기존 검증 방식 사용하면서 로깅 강화
                const transformed = plainToInstance(crudOptions.entity as ClassConstructor<EntityType>, body);

                // Priority: method-specific > global > default (true, aligned with UPDATE/UPSERT).
                // CREATE validates the entity directly, and entity optional fields usually lack
                // @IsOptional (the entity doubles as the persistence model), so a strict default
                // (false) turns every missing field into a "required on create" error and breaks
                // empty/partial creates. Consumers that need strict required-field enforcement can
                // opt out per-route with `skipMissingProperties: false`.
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

                return transformed;
            } catch (error) {
                throw error;
            }
        }
    }

    return mixin(MixinInterceptor);
}
