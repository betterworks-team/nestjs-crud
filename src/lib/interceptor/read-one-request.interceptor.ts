import { mixin, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import _ from 'lodash';

import { RequestAbstractInterceptor } from '../abstract';
import { CRUD_ROUTE_ARGS, CUSTOM_REQUEST_OPTIONS } from '../constants';
import { CRUD_POLICY } from '../crud.policy';
import { RequestFieldsDto } from '../dto/request-fields.dto';
import { Method } from '../interface';
import { QueryParser } from '../provider';

import type { CustomReadOneRequestOptions } from './custom-request.interceptor';
import type { CrudOptions, FactoryOption, CrudReadOneRequest, QueryParserOptions } from '../interface';
import type { IncludeOperation } from '../interface/query-parser.interface';
import type { CallHandler, ExecutionContext, NestInterceptor, Type } from '@nestjs/common';
import type { Request } from 'express';
import type QueryString from 'qs';
import type { Observable } from 'rxjs';

const method = Method.SHOW;
export function ReadOneRequestInterceptor(crudOptions: CrudOptions, factoryOption: FactoryOption): Type<NestInterceptor> {
    class MixinInterceptor extends RequestAbstractInterceptor implements NestInterceptor {
        constructor() {
            super(factoryOption.logger);
        }

        async intercept(context: ExecutionContext, next: CallHandler<unknown>): Promise<Observable<unknown>> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const req: Record<string, any> = context.switchToHttp().getRequest<Request>();
            const readOneOptions = crudOptions.routes?.[method] ?? {};
            const customReadOneRequestOptions: CustomReadOneRequestOptions = req[CUSTOM_REQUEST_OPTIONS];

            const fieldsByRequest = this.checkFields(req.query?.fields);

            const softDeleted = _.isBoolean(customReadOneRequestOptions?.softDeleted)
                ? customReadOneRequestOptions.softDeleted
                : readOneOptions.softDelete ?? CRUD_POLICY[method].default.softDeleted;

            // Parse include parameters with allowedIncludes filtering
            // Priority: route-specific allowedIncludes > global CrudOptions allowedIncludes > undefined (block all includes)
            const allowedIncludes = readOneOptions.allowedIncludes ?? crudOptions.allowedIncludes;

            const queryParserOptions: QueryParserOptions = {
                allowedIncludes,
            };

            const queryParser = new QueryParser(queryParserOptions);
            const parsedQuery = queryParser.parse(req.query);

            // Convert includes to string array for relations
            const includeRelations = this.convertIncludes(parsedQuery.includes);

            const params = await this.checkParams(crudOptions.entity, req.params, factoryOption.columns);
            const crudReadOneRequest: CrudReadOneRequest<typeof crudOptions.entity> = {
                params,
                selectColumns: this.getFields(customReadOneRequestOptions?.fields, fieldsByRequest),
                excludedColumns: readOneOptions.exclude,
                softDeleted,
                relations: [...new Set([...includeRelations, ...this.getRelations(customReadOneRequestOptions)])],
                hooks: readOneOptions.hooks,
                request: req,
            };

            this.crudLogger.logRequest(req, crudReadOneRequest);
            req[CRUD_ROUTE_ARGS] = crudReadOneRequest;

            return next.handle();
        }

        getFields(interceptorFields?: string[], requestFields?: string[]): string[] | undefined {
            if (!interceptorFields) {
                return requestFields;
            }
            if (!requestFields) {
                return interceptorFields;
            }
            return _.intersection(interceptorFields, requestFields);
        }

        checkFields(fields?: string | QueryString.ParsedQs | string[] | QueryString.ParsedQs[]): string[] | undefined {
            if (!fields || (Array.isArray(fields) && fields.length === 0)) {
                return;
            }
            const requestFields = plainToInstance(RequestFieldsDto, { fields });
            const errorList = validateSync(requestFields);
            if (errorList.length > 0) {
                this.crudLogger.log(errorList, 'ValidationError');
                throw new UnprocessableEntityException(errorList);
            }
            const columns = (factoryOption.columns ?? []).map(({ name }) => name);
            const invalidColumns = _.difference(requestFields.fields, columns);
            if (invalidColumns.length > 0) {
                throw new UnprocessableEntityException(`used Invalid name ${invalidColumns.toLocaleString()}`);
            }

            return requestFields.fields;
        }

        convertIncludes(includes: IncludeOperation[]): string[] {
            const relations: string[] = [];

            for (const include of includes) {
                if (include.nested && include.nested.length > 0) {
                    // Handle nested includes recursively
                    const nestedRelations = this.convertIncludes(include.nested);
                    for (const nestedRelation of nestedRelations) {
                        relations.push(`${include.relation}.${nestedRelation}`);
                    }
                } else {
                    relations.push(include.relation);
                }
            }

            return relations;
        }

        getRelations(customReadOneRequestOptions: CustomReadOneRequestOptions): string[] {
            if (Array.isArray(customReadOneRequestOptions?.relations)) {
                return customReadOneRequestOptions.relations;
            }
            // 기본 관계포함 기능 제거 - include 파라미터가 없으면 관계 포함하지 않음
            return [];
        }
    }
    return mixin(MixinInterceptor);
}
