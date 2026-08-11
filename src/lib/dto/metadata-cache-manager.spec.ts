import { globalMetadataCache, MetadataCacheManager } from './metadata-cache-manager';

type TimerOwner = {
    pruneTimer?: NodeJS.Timeout;
};

describe('MetadataCacheManager', () => {
    afterAll(() => {
        globalMetadataCache.destroy();
    });

    it('캐시 정리 타이머가 Node.js 프로세스 종료를 막지 않는다', () => {
        const manager = new MetadataCacheManager({ pruneInterval: 60_000 });

        try {
            const timer = (manager as unknown as TimerOwner).pruneTimer;

            expect(timer).toBeDefined();
            expect(timer?.hasRef()).toBe(false);
        } finally {
            manager.destroy();
        }
    });
});
