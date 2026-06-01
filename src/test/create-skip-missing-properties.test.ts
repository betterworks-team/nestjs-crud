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

/**
 * CREATE skipMissingProperties 기본값 회귀 테스트.
 *
 * 이 라이브러리의 CREATE 인터셉터는 엔티티 자체를 검증 대상으로 사용한다. 엔티티의
 * 선택 필드는 영속화 모델 특성상 @IsOptional이 없는 경우가 많은데, 과거 CREATE 기본값
 * (skipMissingProperties:false)에서는 그런 필드가 "생성 시 필수"로 둔갑해 빈/부분 생성이
 * 422로 실패했다. 0.4.1부터 CREATE 기본값을 true로 맞춰 update/upsert와 일관되게 한다.
 * (엄격 검증이 필요하면 route별 skipMissingProperties:false로 opt-out)
 */
@Entity('create_smp_items')
class CreateSmpItem {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @IsString()
    name: string;

    // 검증 데코레이터는 있으나 @IsOptional이 없고 DB default가 있는 필드.
    // (Blog의 status/sortOrder, Profile의 keyword 배열과 동일한 패턴)
    @Column({ default: 'active' })
    @IsString()
    status: string;

    // 명시적으로 선택인 필드
    @Column({ nullable: true })
    @IsString()
    @IsOptional()
    nickname?: string;
}

const ALLOWED = ['name', 'status', 'nickname'];

// 기본값(lenient) 컨트롤러
@Controller('smp-default')
@Crud({
    entity: CreateSmpItem,
    only: ['create'],
    allowedParams: ALLOWED,
})
class DefaultController {
    constructor(public readonly crudService: CrudService<CreateSmpItem>) {}
}

// strict opt-out 컨트롤러 (route별 skipMissingProperties:false)
@Controller('smp-strict')
@Crud({
    entity: CreateSmpItem,
    only: ['create'],
    allowedParams: ALLOWED,
    routes: {
        [Method.CREATE]: {
            skipMissingProperties: false,
        },
    },
})
class StrictController {
    constructor(public readonly crudService: CrudService<CreateSmpItem>) {}
}

@Module({
    imports: [TypeOrmModule.forFeature([CreateSmpItem])],
    controllers: [DefaultController, StrictController],
    providers: [
        {
            provide: CrudService,
            useFactory: (repository) => new CrudService(repository),
            inject: ['CreateSmpItemRepository'],
        },
    ],
})
class TestModule {}

describe('CREATE skipMissingProperties default (0.4.1)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [CreateSmpItem],
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

    it('기본값(lenient): @IsOptional 없는 필드(status)를 생략해도 생성 성공한다', async () => {
        const response = await request(app.getHttpServer())
            .post('/smp-default')
            .send({ name: 'Kim' }) // status, nickname 생략
            .expect(201);

        expect(response.body.data.name).toBe('Kim');
        // DB default가 적용되어 status가 채워진다
        expect(response.body.data.status).toBe('active');
    });

    it('present 필드는 여전히 검증한다: 잘못된 타입은 422', async () => {
        await request(app.getHttpServer())
            .post('/smp-default')
            .send({ name: 123 }) // name은 전송됐고 타입이 틀림
            .expect(422);
    });

    it('opt-out(skipMissingProperties:false): 누락 필드는 다시 엄격하게 422', async () => {
        await request(app.getHttpServer())
            .post('/smp-strict')
            .send({ name: 'Kim' }) // status 생략 → strict에서는 거부
            .expect(422);
    });
});
