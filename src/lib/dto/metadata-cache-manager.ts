/**
 * 🚀 고도화된 메타데이터 캐싱 시스템
 * Entity별, allowedParams별, method별 캐싱으로 성능 최적화
 */

import { EntityType, Method } from '../interface';
import type { DynamicValidationMetadata } from './column-type-validator-map';

// 🔧 캐시 엔트리 인터페이스
interface CacheEntry<T = any> {
    data: T;
    timestamp: number;
    accessCount: number;
    lastAccessed: number;
}

// 🎯 캐시 설정 인터페이스
interface CacheConfig {
    maxSize: number;
    ttl: number; // Time to live in milliseconds
    enableStats: boolean;
    pruneInterval: number; // 자동 정리 간격 (ms)
}

// 📊 캐시 통계 인터페이스
interface CacheStats {
    hits: number;
    misses: number;
    entries: number;
    hitRate: number;
    memoryUsage: number;
    lruEntry: number; // Least Recently Used entry timestamp
    newestEntry: number;
}

// 🗂️ 메타데이터 캐시 매니저 클래스
class MetadataCacheManager {
    private cache = new Map<string, CacheEntry<DynamicValidationMetadata[]>>();
    private dtoCache = new Map<string, CacheEntry<any>>();
    private stats = {
        hits: 0,
        misses: 0,
    };

    private readonly config: CacheConfig;
    private pruneTimer?: NodeJS.Timeout;

    constructor(config: Partial<CacheConfig> = {}) {
        this.config = {
            maxSize: 1000, // 최대 1000개 엔트리
            ttl: 5 * 60 * 1000, // 5분 TTL
            enableStats: true,
            pruneInterval: 2 * 60 * 1000, // 2분마다 정리
            ...config,
        };

        // 자동 정리 타이머 시작
        this.startPruning();
    }

    /**
     * 🔧 검증 메타데이터 캐시 키 생성
     * @param entity Entity 클래스
     * @param allowedParams 허용된 파라미터들
     * @param method CRUD 메서드
     * @returns 캐시 키
     */
    private createValidationCacheKey(entity: EntityType, allowedParams?: string[], method?: Method): string {
        const entityName = entity.name;
        const paramsKey = allowedParams?.sort().join(',') || 'all';
        const methodKey = method || 'default';

        return `validation:${entityName}:${paramsKey}:${methodKey}`;
    }

    /**
     * 🔧 DTO 캐시 키 생성
     * @param entity Entity 클래스
     * @param method CRUD 메서드
     * @param allowedParams 허용된 파라미터들
     * @returns 캐시 키
     */
    private createDtoCacheKey(entity: EntityType, method: Method, allowedParams?: string[]): string {
        const entityName = entity.name;
        const paramsKey = allowedParams?.sort().join(',') || 'all';

        return `dto:${entityName}:${method}:${paramsKey}`;
    }

    /**
     * 🔧 캐시 엔트리 생성
     * @param data 캐시할 데이터
     * @returns 캐시 엔트리
     */
    private createCacheEntry<T>(data: T): CacheEntry<T> {
        const now = Date.now();
        return {
            data,
            timestamp: now,
            accessCount: 1,
            lastAccessed: now,
        };
    }

    /**
     * 🔧 캐시 엔트리 유효성 검사
     * @param entry 캐시 엔트리
     * @returns 유효한지 여부
     */
    private isValidEntry<T>(entry: CacheEntry<T>): boolean {
        const now = Date.now();
        return now - entry.timestamp < this.config.ttl;
    }

    /**
     * 📥 검증 메타데이터 캐시에서 가져오기
     * @param entity Entity 클래스
     * @param allowedParams 허용된 파라미터들
     * @param method CRUD 메서드
     * @returns 캐시된 메타데이터 또는 null
     */
    getValidationMetadata(entity: EntityType, allowedParams?: string[], method?: Method): DynamicValidationMetadata[] | null {
        const key = this.createValidationCacheKey(entity, allowedParams, method);
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        if (!this.isValidEntry(entry)) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        // 캐시 히트 통계 업데이트
        entry.accessCount++;
        entry.lastAccessed = Date.now();
        this.stats.hits++;

        return entry.data;
    }

    /**
     * 📤 검증 메타데이터를 캐시에 저장
     * @param entity Entity 클래스
     * @param allowedParams 허용된 파라미터들
     * @param method CRUD 메서드
     * @param metadata 저장할 메타데이터
     */
    setValidationMetadata(
        entity: EntityType,
        allowedParams: string[] | undefined,
        method: Method | undefined,
        metadata: DynamicValidationMetadata[],
    ): void {
        const key = this.createValidationCacheKey(entity, allowedParams, method);

        // 캐시 크기 제한 체크
        if (this.cache.size >= this.config.maxSize) {
            this.evictLeastRecentlyUsed();
        }

        const entry = this.createCacheEntry(metadata);
        this.cache.set(key, entry);
    }

    /**
     * 📥 DTO 캐시에서 가져오기
     * @param entity Entity 클래스
     * @param method CRUD 메서드
     * @param allowedParams 허용된 파라미터들
     * @returns 캐시된 DTO 또는 null
     */
    getDtoClass(entity: EntityType, method: Method, allowedParams?: string[]): any | null {
        const key = this.createDtoCacheKey(entity, method, allowedParams);
        const entry = this.dtoCache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        if (!this.isValidEntry(entry)) {
            this.dtoCache.delete(key);
            this.stats.misses++;
            return null;
        }

        // 캐시 히트 통계 업데이트
        entry.accessCount++;
        entry.lastAccessed = Date.now();
        this.stats.hits++;

        return entry.data;
    }

    /**
     * 📤 DTO를 캐시에 저장
     * @param entity Entity 클래스
     * @param method CRUD 메서드
     * @param allowedParams 허용된 파라미터들
     * @param dtoClass 저장할 DTO 클래스
     */
    setDtoClass(entity: EntityType, method: Method, allowedParams: string[] | undefined, dtoClass: any): void {
        const key = this.createDtoCacheKey(entity, method, allowedParams);

        // 캐시 크기 제한 체크
        if (this.dtoCache.size >= this.config.maxSize) {
            this.evictLeastRecentlyUsedDto();
        }

        const entry = this.createCacheEntry(dtoClass);
        this.dtoCache.set(key, entry);
    }

    /**
     * 🗑️ LRU 방식으로 가장 오래된 검증 메타데이터 캐시 제거
     */
    private evictLeastRecentlyUsed(): void {
        let lruKey = '';
        let lruTime = Date.now();

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < lruTime) {
                lruTime = entry.lastAccessed;
                lruKey = key;
            }
        }

        if (lruKey) {
            this.cache.delete(lruKey);
        }
    }

    /**
     * 🗑️ LRU 방식으로 가장 오래된 DTO 캐시 제거
     */
    private evictLeastRecentlyUsedDto(): void {
        let lruKey = '';
        let lruTime = Date.now();

        for (const [key, entry] of this.dtoCache.entries()) {
            if (entry.lastAccessed < lruTime) {
                lruTime = entry.lastAccessed;
                lruKey = key;
            }
        }

        if (lruKey) {
            this.dtoCache.delete(lruKey);
        }
    }

    /**
     * 🧹 만료된 캐시 엔트리 정리
     */
    private pruneExpiredEntries(): void {
        const now = Date.now();
        let removedCount = 0;

        // 검증 메타데이터 캐시 정리
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp >= this.config.ttl) {
                this.cache.delete(key);
                removedCount++;
            }
        }

        // DTO 캐시 정리
        for (const [key, entry] of this.dtoCache.entries()) {
            if (now - entry.timestamp >= this.config.ttl) {
                this.dtoCache.delete(key);
                removedCount++;
            }
        }

    }

    /**
     * ⏰ 자동 정리 타이머 시작
     */
    private startPruning(): void {
        if (this.pruneTimer) {
            clearInterval(this.pruneTimer);
        }

        this.pruneTimer = setInterval(() => {
            this.pruneExpiredEntries();
        }, this.config.pruneInterval);
        this.pruneTimer.unref();
    }

    /**
     * 🗑️ 캐시 완전 초기화
     */
    clear(): void {
        this.cache.clear();
        this.dtoCache.clear();
        this.stats.hits = 0;
        this.stats.misses = 0;
    }

    /**
     * 📊 캐시 통계 조회
     * @returns 캐시 통계
     */
    getStats(): CacheStats {
        const totalRequests = this.stats.hits + this.stats.misses;
        const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

        // 메모리 사용량 추정 (대략적)
        const memoryUsage = (this.cache.size + this.dtoCache.size) * 1024; // 1KB per entry 추정

        // LRU/MRU (Most Recently Used) 엔트리 찾기
        let lruEntry = Date.now();
        let newestEntry = 0;

        for (const entry of this.cache.values()) {
            if (entry.timestamp < lruEntry) lruEntry = entry.timestamp;
            if (entry.timestamp > newestEntry) newestEntry = entry.timestamp;
        }

        for (const entry of this.dtoCache.values()) {
            if (entry.timestamp < lruEntry) lruEntry = entry.timestamp;
            if (entry.timestamp > newestEntry) newestEntry = entry.timestamp;
        }

        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            entries: this.cache.size + this.dtoCache.size,
            hitRate: Math.round(hitRate * 100) / 100,
            memoryUsage,
            lruEntry,
            newestEntry,
        };
    }


    /**
     * 🛑 캐시 매니저 종료 (메모리 정리)
     */
    destroy(): void {
        if (this.pruneTimer) {
            clearInterval(this.pruneTimer);
            this.pruneTimer = undefined;
        }
        this.clear();
    }
}

// 🌍 전역 캐시 매니저 인스턴스
export const globalMetadataCache = new MetadataCacheManager({
    maxSize: 1000,
    ttl: 10 * 60 * 1000, // 10분
    enableStats: true,
    pruneInterval: 5 * 60 * 1000, // 5분마다 정리
});


export { MetadataCacheManager, type CacheConfig, type CacheStats };
