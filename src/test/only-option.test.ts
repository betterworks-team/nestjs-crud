/* eslint-disable @typescript-eslint/no-extraneous-class, max-classes-per-file */
import { Controller } from '@nestjs/common';
import { Entity, PrimaryGeneratedColumn } from 'typeorm';

import { Crud } from '../lib/crud.decorator';
import { Method } from '../lib/interface';

@Entity()
class OnlyOptionEntity {
    @PrimaryGeneratedColumn()
    id!: number;
}

const reservedHandlers = (target: abstract new (...args: never[]) => unknown): string[] =>
    Object.values(Method).filter(
        (m) => typeof (target.prototype as Record<string, unknown>)[`reserved${m.charAt(0).toUpperCase()}${m.slice(1)}`] === 'function',
    );

describe('Crud only option', () => {
    it('registers no reserved handlers when only is []', () => {
        @Crud({ entity: OnlyOptionEntity, only: [] })
        @Controller('none')
        class NoneController {}
        expect(reservedHandlers(NoneController)).toEqual([]);
    });

    it('registers only the listed handlers', () => {
        @Crud({ entity: OnlyOptionEntity, only: [Method.INDEX] })
        @Controller('index-only')
        class IndexOnlyController {}
        expect(reservedHandlers(IndexOnlyController)).toEqual([Method.INDEX]);
    });

    it('registers every handler when only is omitted', () => {
        @Crud({ entity: OnlyOptionEntity, routes: { destroy: { softDelete: true } } })
        @Controller('all')
        class AllController {}
        expect(reservedHandlers(AllController).sort()).toEqual(Object.values(Method).sort());
    });
});
