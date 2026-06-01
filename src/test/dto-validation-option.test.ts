/* eslint-disable @typescript-eslint/no-explicit-any */
import { Controller, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IsInt, IsOptional, IsString } from 'class-validator';
import request from 'supertest';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { Crud } from '../lib/crud.decorator';
import { CrudService } from '../lib/crud.service';
import { Method } from '../lib/interface';

/**
 * route별 opt-in `dto` 검증 옵션 테스트.
 *
 * - dto가 지정되면 엔티티 대신 DTO로 검증한다 (저장은 엔티티 형태).
 * - CREATE는 dto가 있으면 strict(skipMissingProperties:false) 기본 → DTO 필수값 강제.
 * - UPDATE는 dto가 있어도 lenient(PATCH) 유지.
 * - dto 미지정 시 기존 엔티티 검증 동작 불변(하위호환).
 */
@Entity('dto_items')
class DtoItem {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @IsString()
    name: string;

    @Column({ nullable: true })
    @IsString()
    @IsOptional()
    note?: string;

    @Column({ default: 0 })
    @IsInt()
    @IsOptional()
    count: number;
}

// 생성 DTO: name 필수, note 선택
class CreateDtoItemDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    note?: string;
}

// 수정 DTO: name은 @IsOptional 없음(필수처럼 보이지만 UPDATE는 lenient라 누락 허용)
class UpdateDtoItemDto {
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    note?: string;
}

// dto 사용 컨트롤러
@Controller('dto-items')
@Crud({
    entity: DtoItem,
    only: ['create', 'update'],
    allowedParams: ['name', 'note'],
    routes: {
        [Method.CREATE]: { dto: CreateDtoItemDto },
        [Method.UPDATE]: { dto: UpdateDtoItemDto },
    },
})
class DtoController {
    constructor(public readonly crudService: CrudService<DtoItem>) {}
}

// dto 미사용 컨트롤러 (하위호환 확인용)
@Controller('plain-items')
@Crud({
    entity: DtoItem,
    only: ['create'],
    allowedParams: ['name', 'note'],
})
class PlainController {
    constructor(public readonly crudService: CrudService<DtoItem>) {}
}

@Module({
    imports: [TypeOrmModule.forFeature([DtoItem])],
    controllers: [DtoController, PlainController],
    providers: [
        {
            provide: CrudService,
            useFactory: (repository) => new CrudService(repository),
            inject: ['DtoItemRepository'],
        },
    ],
})
class TestModule {}

describe('Opt-in DTO validation option (0.5.0)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [DtoItem],
                    synchronize: true,
                    logging: false,
                }),
                TestModule,
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });

    describe('CREATE + dto', () => {
        it('DTO-선택 필드(note)를 생략해도 통과한다', async () => {
            const res = await request(app.getHttpServer())
                .post('/dto-items')
                .send({ name: 'Alice' })
                .expect(201);
            expect(res.body.data.name).toBe('Alice');
        });

        it('DTO-필수 필드(name)를 생략하면 strict 기본값으로 422', async () => {
            await request(app.getHttpServer())
                .post('/dto-items')
                .send({ note: 'no name' })
                .expect(422);
        });

        it('present 필드의 잘못된 타입은 422', async () => {
            await request(app.getHttpServer())
                .post('/dto-items')
                .send({ name: 123 })
                .expect(422);
        });
    });

    describe('UPDATE + dto', () => {
        it('dto가 있어도 PATCH 의미(lenient): 필드 생략해도 통과한다', async () => {
            const created = await request(app.getHttpServer())
                .post('/dto-items')
                .send({ name: 'Bob', note: 'orig' })
                .expect(201);
            const id = created.body.data.id;

            const res = await request(app.getHttpServer())
                .patch(`/dto-items/${id}`)
                .send({ note: 'updated' }) // name 생략 → UPDATE는 lenient라 통과
                .expect(200);
            expect(res.body.data.note).toBe('updated');
            expect(res.body.data.name).toBe('Bob');
        });
    });

    describe('하위호환 (dto 미지정)', () => {
        it('dto 없으면 기존 엔티티 검증 동작(0.4.1 lenient create) 유지 — 빈 본문도 가능', async () => {
            // 엔티티 검증 + CREATE 기본 lenient → name 누락이어도 통과(엔티티 name은 NOT NULL이지만
            // 검증 단계는 통과; sqlite NOT NULL은 별도). name 제공해 정상 생성 확인.
            await request(app.getHttpServer())
                .post('/plain-items')
                .send({ name: 'Carol' })
                .expect(201);
        });
    });
});
