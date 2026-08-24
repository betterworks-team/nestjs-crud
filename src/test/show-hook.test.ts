/* eslint-disable @typescript-eslint/no-explicit-any */
import { Controller, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IsOptional, IsString } from 'class-validator';
import request from 'supertest';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { Crud } from '../lib/crud.decorator';
import { CrudService } from '../lib/crud.service';
import { Method } from '../lib/interface';

@Entity('test_users')
class TestUser {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @IsString()
    name: string;

    @Column()
    @IsString()
    email: string;

    @Column({ nullable: true })
    @IsString()
    @IsOptional()
    password?: string;

    @Column({ nullable: true })
    @IsOptional()
    lastViewedAt?: Date;
}

describe('Show Operation Hooks', () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [TestUser],
                    synchronize: true,
                    logging: false,
                }),
                TypeOrmModule.forFeature([TestUser]),
                TestModule,
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        // 테스트 데이터 생성
        const repository = moduleFixture.get('TestUserRepository');
        await repository.save({
            name: 'John Doe',
            email: 'john@example.com',
            password: 'secret123',
        });
    });

    afterEach(async () => {
        await app.close();
    });

    describe('assignBefore hook', () => {
        it('should process parameters before entity lookup', async () => {
            @Controller('users-with-param-hook')
            @Crud({
                entity: TestUser,
                routes: {
                    [Method.SHOW]: {
                        hooks: {
                            assignBefore: async (params, context) => {
                                expect(context.operation).toBe('show');
                                expect(params.id).toBeDefined();
                                
                                // 파라미터 변환 테스트 (예: string ID를 number로)
                                if (typeof params.id === 'string') {
                                    params.id = Number.parseInt(params.id, 10);
                                }
                                
                                return params;
                            },
                        },
                    },
                },
            })
            class TestController {
                constructor(public readonly crudService: CrudService<TestUser>) {}
            }

            @Module({
                imports: [TypeOrmModule.forFeature([TestUser])],
                controllers: [TestController],
                providers: [
                    {
                        provide: CrudService,
                        useFactory: (repository) => new CrudService(repository),
                        inject: ['TestUserRepository'],
                    },
                ],
            })
            class TestModuleWithParamHook {}

            const moduleFixture = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TestModuleWithParamHook,
                ],
            }).compile();

            const testApp = moduleFixture.createNestApplication();
            await testApp.init();

            // 테스트 데이터 생성
            const repository = moduleFixture.get('TestUserRepository');
            const user = await repository.save({
                name: 'Test User',
                email: 'test@example.com',
            });

            const response = await request(testApp.getHttpServer())
                .get(`/users-with-param-hook/${user.id}`)
                .expect(200);

            expect(response.body.data.id).toBe(user.id);
            expect(response.body.data.name).toBe('Test User');

            await testApp.close();
        });
    });

    describe('assignAfter hook', () => {
        it('should process entity after retrieval', async () => {
            @Controller('users-with-after-hook')
            @Crud({
                entity: TestUser,
                routes: {
                    [Method.SHOW]: {
                        hooks: {
                            assignAfter: async (entity, _, context) => {
                                expect(context.operation).toBe('show');
                                expect(entity.id).toBeDefined();
                                
                                // 민감한 정보 마스킹
                                if (entity.password) {
                                    entity.password = '***MASKED***';
                                }
                                
                                // 계산 필드 추가
                                (entity as any).displayName = `${entity.name} (${entity.email})`;
                                
                                // 조회 시간 업데이트 (실제로는 DB에 저장하지 않음)
                                entity.lastViewedAt = new Date();
                                
                                return entity;
                            },
                        },
                    },
                },
            })
            class TestController {
                constructor(public readonly crudService: CrudService<TestUser>) {}
            }

            @Module({
                imports: [TypeOrmModule.forFeature([TestUser])],
                controllers: [TestController],
                providers: [
                    {
                        provide: CrudService,
                        useFactory: (repository) => new CrudService(repository),
                        inject: ['TestUserRepository'],
                    },
                ],
            })
            class TestModuleWithAfterHook {}

            const moduleFixture = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TestModuleWithAfterHook,
                ],
            }).compile();

            const testApp = moduleFixture.createNestApplication();
            await testApp.init();

            // 테스트 데이터 생성
            const repository = moduleFixture.get('TestUserRepository');
            const user = await repository.save({
                name: 'Test User',
                email: 'test@example.com',
                password: 'secret123',
            });

            const response = await request(testApp.getHttpServer())
                .get(`/users-with-after-hook/${user.id}`)
                .expect(200);

            expect(response.body.data.password).toBe('***MASKED***');
            expect(response.body.data.displayName).toBe('Test User (test@example.com)');
            expect(response.body.data.lastViewedAt).toBeDefined();

            await testApp.close();
        });
    });

    describe('both hooks together', () => {
        it('should execute both assignBefore and assignAfter hooks', async () => {
            let beforeHookExecuted = false;
            let afterHookExecuted = false;

            @Controller('users-with-both-hooks')
            @Crud({
                entity: TestUser,
                routes: {
                    [Method.SHOW]: {
                        hooks: {
                            assignBefore: async (params, context) => {
                                beforeHookExecuted = true;
                                expect(context.operation).toBe('show');
                                
                                // 대소문자 구분 없이 ID 처리
                                if (params.ID) {
                                    params.id = params.ID;
                                    delete params.ID;
                                }
                                
                                return params;
                            },
                            assignAfter: async (entity, _, context) => {
                                afterHookExecuted = true;
                                expect(context.operation).toBe('show');
                                
                                // 이메일 도메인 마스킹
                                entity.email = entity.email.replace(/@.*/, '@*****.com');
                                
                                return entity;
                            },
                        },
                    },
                },
            })
            class TestController {
                constructor(public readonly crudService: CrudService<TestUser>) {}
            }

            @Module({
                imports: [TypeOrmModule.forFeature([TestUser])],
                controllers: [TestController],
                providers: [
                    {
                        provide: CrudService,
                        useFactory: (repository) => new CrudService(repository),
                        inject: ['TestUserRepository'],
                    },
                ],
            })
            class TestModuleWithBothHooks {}

            const moduleFixture = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TestModuleWithBothHooks,
                ],
            }).compile();

            const testApp = moduleFixture.createNestApplication();
            await testApp.init();

            // 테스트 데이터 생성
            const repository = moduleFixture.get('TestUserRepository');
            const user = await repository.save({
                name: 'Test User',
                email: 'test@example.com',
                password: 'secret123',
            });

            const response = await request(testApp.getHttpServer())
                .get(`/users-with-both-hooks/${user.id}`)
                .expect(200);

            expect(beforeHookExecuted).toBe(true);
            expect(afterHookExecuted).toBe(true);
            expect(response.body.data.email).toBe('test@*****.com');

            await testApp.close();
        });
    });

    describe('async hooks', () => {
        it('should handle async operations in hooks', async () => {
            @Controller('users-with-async-hooks')
            @Crud({
                entity: TestUser,
                routes: {
                    [Method.SHOW]: {
                        hooks: {
                            assignBefore: async (params, _context) => {
                                // 비동기 작업 시뮬레이션
                                await new Promise((resolve) => setTimeout(resolve, 10));
                                return params;
                            },
                            assignAfter: async (entity, _, _context) => {
                                // 비동기 작업 시뮬레이션
                                await new Promise((resolve) => setTimeout(resolve, 10));
                                
                                // 외부 API 호출 시뮬레이션
                                (entity as any).enrichedData = await Promise.resolve({
                                    additionalInfo: 'From external service',
                                });
                                
                                return entity;
                            },
                        },
                    },
                },
            })
            class TestController {
                constructor(public readonly crudService: CrudService<TestUser>) {}
            }

            @Module({
                imports: [TypeOrmModule.forFeature([TestUser])],
                controllers: [TestController],
                providers: [
                    {
                        provide: CrudService,
                        useFactory: (repository) => new CrudService(repository),
                        inject: ['TestUserRepository'],
                    },
                ],
            })
            class TestModuleWithAsyncHooks {}

            const moduleFixture = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TestModuleWithAsyncHooks,
                ],
            }).compile();

            const testApp = moduleFixture.createNestApplication();
            await testApp.init();

            // 테스트 데이터 생성
            const repository = moduleFixture.get('TestUserRepository');
            const user = await repository.save({
                name: 'Test User',
                email: 'test@example.com',
            });

            const response = await request(testApp.getHttpServer())
                .get(`/users-with-async-hooks/${user.id}`)
                .expect(200);

            expect(response.body.data.enrichedData).toEqual({
                additionalInfo: 'From external service',
            });

            await testApp.close();
        });
    });

    describe('hooks returning undefined', () => {
        it('should keep the previous value when assignBefore returns undefined (no unconditional findOne)', async () => {
            @Controller('users-with-undefined-before-hook')
            @Crud({
                entity: TestUser,
                routes: {
                    [Method.SHOW]: {
                        hooks: {
                            assignBefore: async (_params, _context) => {
                                // 값을 명시적으로 반환하지 않음 (실수로 return을 빼먹은 경우를 시뮬레이션)
                                return undefined as any;
                            },
                        },
                    },
                },
            })
            class TestController {
                constructor(public readonly crudService: CrudService<TestUser>) {}
            }

            @Module({
                imports: [TypeOrmModule.forFeature([TestUser])],
                controllers: [TestController],
                providers: [
                    {
                        provide: CrudService,
                        useFactory: (repository) => new CrudService(repository),
                        inject: ['TestUserRepository'],
                    },
                ],
            })
            class TestModuleWithUndefinedBeforeHook {}

            const moduleFixture = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TestModuleWithUndefinedBeforeHook,
                ],
            }).compile();

            const testApp = moduleFixture.createNestApplication();
            await testApp.init();

            // 테스트 데이터 생성
            const repository = moduleFixture.get('TestUserRepository');
            const user = await repository.save({
                name: 'Test User',
                email: 'test@example.com',
            });

            const response = await request(testApp.getHttpServer())
                .get(`/users-with-undefined-before-hook/${user.id}`)
                .expect(200);

            expect(response.body.data.id).toBe(user.id);
            expect(response.body.data.name).toBe('Test User');

            await testApp.close();
        });

        it('should keep the retrieved entity when assignAfter returns undefined', async () => {
            @Controller('users-with-undefined-after-hook')
            @Crud({
                entity: TestUser,
                routes: {
                    [Method.SHOW]: {
                        hooks: {
                            assignAfter: async (_entity, _params, _context) => {
                                // 값을 명시적으로 반환하지 않음
                                return undefined as any;
                            },
                        },
                    },
                },
            })
            class TestController {
                constructor(public readonly crudService: CrudService<TestUser>) {}
            }

            @Module({
                imports: [TypeOrmModule.forFeature([TestUser])],
                controllers: [TestController],
                providers: [
                    {
                        provide: CrudService,
                        useFactory: (repository) => new CrudService(repository),
                        inject: ['TestUserRepository'],
                    },
                ],
            })
            class TestModuleWithUndefinedAfterHook {}

            const moduleFixture = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TestModuleWithUndefinedAfterHook,
                ],
            }).compile();

            const testApp = moduleFixture.createNestApplication();
            await testApp.init();

            // 테스트 데이터 생성
            const repository = moduleFixture.get('TestUserRepository');
            const user = await repository.save({
                name: 'Test User',
                email: 'test@example.com',
            });

            const response = await request(testApp.getHttpServer())
                .get(`/users-with-undefined-after-hook/${user.id}`)
                .expect(200);

            expect(response.body.data.id).toBe(user.id);
            expect(response.body.data.name).toBe('Test User');
            expect(response.body.data.email).toBe('test@example.com');

            await testApp.close();
        });
    });

    describe('without hooks', () => {
        it('should work normally without hooks defined', async () => {
            @Controller('users-without-hooks')
            @Crud({
                entity: TestUser,
                routes: {
                    [Method.SHOW]: {
                        // hooks 없음
                    },
                },
            })
            class TestController {
                constructor(public readonly crudService: CrudService<TestUser>) {}
            }

            @Module({
                imports: [TypeOrmModule.forFeature([TestUser])],
                controllers: [TestController],
                providers: [
                    {
                        provide: CrudService,
                        useFactory: (repository) => new CrudService(repository),
                        inject: ['TestUserRepository'],
                    },
                ],
            })
            class TestModuleWithoutHooks {}

            const moduleFixture = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TestModuleWithoutHooks,
                ],
            }).compile();

            const testApp = moduleFixture.createNestApplication();
            await testApp.init();

            // 테스트 데이터 생성
            const repository = moduleFixture.get('TestUserRepository');
            const user = await repository.save({
                name: 'Test User',
                email: 'test@example.com',
                password: 'secret123',
            });

            const response = await request(testApp.getHttpServer())
                .get(`/users-without-hooks/${user.id}`)
                .expect(200);

            expect(response.body.data.id).toBe(user.id);
            expect(response.body.data.name).toBe('Test User');
            expect(response.body.data.email).toBe('test@example.com');
            expect(response.body.data.password).toBe('secret123');

            await testApp.close();
        });
    });
});

@Module({
    imports: [TypeOrmModule.forFeature([TestUser])],
    controllers: [],
})
class TestModule {}