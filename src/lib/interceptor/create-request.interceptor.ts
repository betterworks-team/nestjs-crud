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

            try {
                // dto가 지정되면 엔티티 대신 DTO로 검증한다 (저장은 항상 엔티티 형태로 진행).
                const dto = methodOptions.dto as ClassConstructor<object> | undefined;
                const validationTarget = (dto ?? crudOptions.entity) as ClassConstructor<EntityType>;
                const transformed = plainToInstance(validationTarget, body);

                // Priority: method-specific > global > default.
                // 기본값: dto가 있으면 false(strict) — DTO가 필수/선택을 @IsOptional로 명시하므로
                // CREATE에서 필수값을 강제하는 게 자연스럽다. dto가 없으면 true(lenient, 0.4.1) —
                // 엔티티를 입력 DTO로 재사용하는 특성상 누락 필드를 "생성 시 필수"로 둔갑시키지 않기 위함.
                const skipMissingProperties =
                    methodOptions.skipMissingProperties ?? crudOptions.skipMissingProperties ?? (dto ? false : true);

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

                // dto로 검증했으면 transformed는 DTO 인스턴스이므로, 저장용으로 엔티티에 매핑한다.
                return dto ? plainToInstance(crudOptions.entity as ClassConstructor<EntityType>, body) : transformed;
            } catch (error) {
                throw error;
            }
        }
    }

    return mixin(MixinInterceptor);
}
