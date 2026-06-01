import { Test, TestingModule } from '@nestjs/testing';
import { Controller, INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Entity, PrimaryGeneratedColumn, Column, DeleteDateColumn } from 'typeorm';
import { IsString, IsEmail, IsOptional } from 'class-validator';
import request from 'supertest';

import { Crud } from '../lib/crud.decorator';
import { CrudService } from '../lib/crud.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Test Entity
@Entity()
class TestUser {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @IsString()
    name: string;

    @Column({ unique: true })
    @IsEmail()
    email: string;

    @Column({ nullable: true })
    @IsOptional()
    @IsString()
    bio?: string;

    @Column({ default: 'active' })
    status: string;

    @DeleteDateColumn()
    deletedAt?: Date;
}

// Test Service
class TestUserService extends CrudService<TestUser> {
    constructor(
        @InjectRepository(TestUser)
        repository: Repository<TestUser>,
    ) {
        super(repository);
    }
}

// Test Controller
@Controller('test-users')
@Crud({
    entity: TestUser,
    allowedParams: ['name', 'email', 'bio', 'status'],
})
class TestUserController {
    constructor(public readonly crudService: TestUserService) {}
}

describe('Bulk Operations Tests', () => {
    let app: INestApplication;
    let userService: TestUserService;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [TestUser],
                    synchronize: true,
                    logging: false,
                }),
                TypeOrmModule.forFeature([TestUser]),
            ],
            controllers: [TestUserController],
            providers: [TestUserService],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        userService = moduleFixture.get<TestUserService>(TestUserService);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        // Clear database before each test
        await userService.repository.delete({});
    });

    describe('Bulk CREATE Operations', () => {
        it('should create multiple users at once', async () => {
            const users = [
                { name: 'John Doe', email: 'john@example.com', bio: 'Developer' },
                { name: 'Jane Smith', email: 'jane@example.com', bio: 'Designer' },
                { name: 'Bob Johnson', email: 'bob@example.com', bio: 'Manager' },
            ];

            const response = await request(app.getHttpServer())
                .post('/test-users')
                .send(users)
                .expect(201);

            expect(response.body.data).toHaveLength(3);
            expect(response.body.metadata.affectedCount).toBe(3);
            expect(response.body.data[0].name).toBe('John Doe');
            expect(response.body.data[1].name).toBe('Jane Smith');
            expect(response.body.data[2].name).toBe('Bob Johnson');
        });

        it('should handle validation errors in bulk create', async () => {
            // CREATE 기본값이 lenient(skipMissingProperties:true)이므로 "누락" 필드는 더 이상
            // 검증 오류가 아니다. 전송된(present) 필드의 잘못된 값은 여전히 422로 거부된다.
            const users = [
                { name: 'John Doe', email: 'john@example.com' },
                { name: 'Jane Smith', email: 'not-an-email' }, // Invalid email format
                { name: 'Bob Johnson', email: 'bob@example.com' },
            ];

            await request(app.getHttpServer())
                .post('/test-users')
                .send(users)
                .expect(422); // UnprocessableEntity
        });
    });

    describe('Bulk UPDATE Operations', () => {
        it('should update multiple users at once', async () => {
            // First, create some users
            const createdUsers = await userService.repository.save([
                { name: 'John Doe', email: 'john@example.com', status: 'active' },
                { name: 'Jane Smith', email: 'jane@example.com', status: 'active' },
                { name: 'Bob Johnson', email: 'bob@example.com', status: 'active' },
            ]);

            const updates = createdUsers.map(user => ({
                id: user.id,
                name: `Updated ${user.name}`,
                status: 'inactive',
            }));

            const response = await request(app.getHttpServer())
                .patch('/test-users/bulk')
                .send(updates)
                .expect(200);

            expect(response.body.data).toHaveLength(3);
            expect(response.body.metadata.affectedCount).toBe(3);
            expect(response.body.data[0].name).toContain('Updated');
            expect(response.body.data[0].status).toBe('inactive');
        });

        it('should require ID for each item in bulk update', async () => {
            const updates = [
                { name: 'Updated John' }, // Missing ID
                { id: 999, name: 'Updated Jane' },
            ];

            await request(app.getHttpServer())
                .patch('/test-users/bulk')
                .send(updates)
                .expect(422); // UnprocessableEntity
        });

        it('should handle not found entities in bulk update', async () => {
            const updates = [
                { id: 999, name: 'Non-existent User' },
            ];

            await request(app.getHttpServer())
                .patch('/test-users/bulk')
                .send(updates)
                .expect(404); // NotFoundException
        });
    });

    describe('Bulk UPSERT Operations', () => {
        it('should create and update in single bulk upsert', async () => {
            // Create one user first
            const existingUser = await userService.repository.save({
                name: 'Existing User',
                email: 'existing@example.com',
                status: 'active',
            });

            const upsertData = [
                { id: existingUser.id, name: 'Updated Existing', email: 'existing@example.com' }, // Update
                { name: 'New User 1', email: 'new1@example.com' }, // Create
                { name: 'New User 2', email: 'new2@example.com' }, // Create
            ];

            const response = await request(app.getHttpServer())
                .put('/test-users/bulk')
                .send(upsertData)
                .expect(201);

            expect(response.body.data).toHaveLength(3);
            expect(response.body.metadata.affectedCount).toBe(3);
            
            // Check upsertInfo metadata
            expect(response.body.metadata.upsertInfo).toBeDefined();
            expect(response.body.metadata.upsertInfo[0].isNew).toBe(false); // Updated
            expect(response.body.metadata.upsertInfo[1].isNew).toBe(true);  // Created
            expect(response.body.metadata.upsertInfo[2].isNew).toBe(true);  // Created
        });
    });

    describe('Bulk DELETE Operations', () => {
        it('should delete multiple users by IDs in body', async () => {
            // Create some users first
            const createdUsers = await userService.repository.save([
                { name: 'User 1', email: 'user1@example.com' },
                { name: 'User 2', email: 'user2@example.com' },
                { name: 'User 3', email: 'user3@example.com' },
            ]);

            const idsToDelete = createdUsers.slice(0, 2).map(u => u.id);

            const response = await request(app.getHttpServer())
                .delete('/test-users/bulk')
                .send({ ids: idsToDelete })
                .expect(200);

            expect(response.body.data).toHaveLength(2);
            expect(response.body.metadata.affectedCount).toBe(2);
            expect(response.body.metadata.wasSoftDeleted).toBe(false);

            // Verify only 1 user remains
            const remaining = await userService.repository.find();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].name).toBe('User 3');
        });

        it('should soft delete multiple users when configured', async () => {
            // Create controller with soft delete enabled
            @Controller('soft-delete-users')
            @Crud({
                entity: TestUser,
                routes: {
                    destroy: {
                        softDelete: true,
                    },
                },
            })
            class SoftDeleteController {
                constructor(public readonly crudService: TestUserService) {}
            }

            const module = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TypeOrmModule.forFeature([TestUser]),
                ],
                controllers: [SoftDeleteController],
                providers: [TestUserService],
            }).compile();

            const testApp = module.createNestApplication();
            await testApp.init();

            const service = module.get<TestUserService>(TestUserService);

            // Create users
            const users = await service.repository.save([
                { name: 'User 1', email: 'soft1@example.com' },
                { name: 'User 2', email: 'soft2@example.com' },
            ]);

            const response = await request(testApp.getHttpServer())
                .delete('/soft-delete-users/bulk')
                .send({ ids: users.map(u => u.id) })
                .expect(200);

            expect(response.body.metadata.wasSoftDeleted).toBe(true);

            // Check soft deleted
            const withDeleted = await service.repository.find({ withDeleted: true });
            expect(withDeleted).toHaveLength(2);
            expect(withDeleted[0].deletedAt).toBeDefined();

            await testApp.close();
        });
    });

    describe('Bulk RECOVER Operations', () => {
        it('should recover multiple soft-deleted users', async () => {
            // First soft delete some users
            const users = await userService.repository.save([
                { name: 'Deleted 1', email: 'del1@example.com' },
                { name: 'Deleted 2', email: 'del2@example.com' },
                { name: 'Active User', email: 'active@example.com' },
            ]);

            // Soft delete first two
            await userService.repository.softRemove(users.slice(0, 2));

            const idsToRecover = users.slice(0, 2).map(u => u.id);

            const response = await request(app.getHttpServer())
                .post('/test-users/bulk/recover')
                .send({ ids: idsToRecover })
                .expect(201);

            expect(response.body.data).toHaveLength(2);
            expect(response.body.metadata.affectedCount).toBe(2);
            expect(response.body.metadata.wasSoftDeleted).toBe(true);

            // Verify recovery
            const allUsers = await userService.repository.find();
            expect(allUsers).toHaveLength(3);
        });

        it('should handle not found entities in bulk recover', async () => {
            const response = await request(app.getHttpServer())
                .post('/test-users/bulk/recover')
                .send({ ids: [999, 1000] })
                .expect(404);
        });
    });

    describe('Lifecycle Hooks with Bulk Operations', () => {
        it('should execute hooks for each item in bulk operations', async () => {
            let createCount = 0;
            let updateCount = 0;

            @Controller('hook-test-users')
            @Crud({
                entity: TestUser,
                allowedParams: ['name', 'email', 'bio'],
                routes: {
                    create: {
                        hooks: {
                            assignBefore: async (body, context) => {
                                createCount++;
                                body.bio = `Created #${createCount}`;
                                return body;
                            },
                        },
                    },
                    update: {
                        hooks: {
                            assignBefore: async (entity, context) => {
                                updateCount++;
                                entity.bio = `Updated #${updateCount}`;
                                return entity;
                            },
                        },
                    },
                },
            })
            class HookTestController {
                constructor(public readonly crudService: TestUserService) {}
            }

            const module = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TypeOrmModule.forFeature([TestUser]),
                ],
                controllers: [HookTestController],
                providers: [TestUserService],
            }).compile();

            const hookApp = module.createNestApplication();
            await hookApp.init();

            // Test bulk create with hooks
            const createResponse = await request(hookApp.getHttpServer())
                .post('/hook-test-users')
                .send([
                    { name: 'User 1', email: 'hook1@example.com' },
                    { name: 'User 2', email: 'hook2@example.com' },
                ])
                .expect(201);

            expect(createCount).toBe(2);
            expect(createResponse.body.data[0].bio).toBe('Created #1');
            expect(createResponse.body.data[1].bio).toBe('Created #2');

            // Test bulk update with hooks
            const updateResponse = await request(hookApp.getHttpServer())
                .patch('/hook-test-users/bulk')
                .send([
                    { id: createResponse.body.data[0].id, name: 'Updated 1' },
                    { id: createResponse.body.data[1].id, name: 'Updated 2' },
                ])
                .expect(200);

            expect(updateCount).toBe(2);
            expect(updateResponse.body.data[0].bio).toBe('Updated #1');
            expect(updateResponse.body.data[1].bio).toBe('Updated #2');

            await hookApp.close();
        });
    });

    describe('Error Handling in Bulk Operations', () => {
        it('should handle mixed validation errors in bulk operations', async () => {
            const invalidUsers = [
                { name: 'Valid User', email: 'valid@example.com' },
                { name: 'Invalid Email', email: 'not-an-email' }, // Invalid email
                { email: 'missing-name@example.com' }, // Missing name
            ];

            await request(app.getHttpServer())
                .post('/test-users')
                .send(invalidUsers)
                .expect(422);
        });

        it('should handle database constraints in bulk operations', async () => {
            // Create a user with unique email
            await userService.repository.save({
                name: 'Existing',
                email: 'unique@example.com',
            });

            // Try to create users with duplicate email
            const duplicateUsers = [
                { name: 'New User', email: 'new@example.com' },
                { name: 'Duplicate', email: 'unique@example.com' }, // Duplicate email
            ];

            await request(app.getHttpServer())
                .post('/test-users')
                .send(duplicateUsers)
                .expect(409); // ConflictException
        });
    });

    describe('Performance Tests', () => {
        it('should handle large bulk operations efficiently', async () => {
            const largeDataset = Array.from({ length: 100 }, (_, i) => ({
                name: `User ${i}`,
                email: `user${i}@example.com`,
                bio: `Bio for user ${i}`,
            }));

            const startTime = Date.now();
            const response = await request(app.getHttpServer())
                .post('/test-users')
                .send(largeDataset)
                .expect(201);

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(response.body.data).toHaveLength(100);
            expect(response.body.metadata.affectedCount).toBe(100);
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

            // Verify all were created
            const count = await userService.repository.count();
            expect(count).toBe(100);
        });
    });
});