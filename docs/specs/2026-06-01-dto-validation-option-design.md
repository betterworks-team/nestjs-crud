# Opt-in DTO Validation for Write Routes (0.5.0)

## 배경 / 문제

이 라이브러리는 `@Crud({ entity })`의 **엔티티 자체를 생성/수정 입력 DTO로 검증**한다. 엔티티는 영속화 모델이라 선택 필드에 `@IsOptional`이 없는 경우가 많고, 서버 관리 필드(id, 생성 컬럼 등)도 같은 클래스에 섞여 있다. 그 결과:

- 입력 계약이 엔티티 구조에 종속됨 (DB 스키마 변경이 API 검증을 바꿈)
- 연산별(생성 vs 수정) 필수/선택을 정확히 표현하기 어려움
- `skipMissingProperties` 같은 전역 플래그로 우회해야 함

(0.4.1에서 CREATE 기본값을 lenient로 바꿔 "빈/부분 생성 422" 버그는 해소했으나, 이는 실용적 회피이지 입력 계약 분리가 아니다.)

## 목표

create/update/upsert 입력을 **엔티티 대신 전용 DTO**로 검증할 수 있는 **opt-in 옵션**을 추가한다. 기존 동작은 100% 유지(하위호환).

비목표: 자동 DTO→엔티티 매핑 계층, 응답 DTO, 엔티티에서 검증 데코레이터 제거(앱 측 마이그레이션). 이번 범위는 **라이브러리 enabler만**.

## API

route별 `dto` 옵션을 추가한다 (기존 `allowedParams`/`skipMissingProperties`와 동일하게 route별 배치):

```ts
@Crud({
  entity: Profile,
  routes: {
    create: { dto: CreateProfileDto },
    update: { dto: UpdateProfileDto },
    // upsert: { dto: UpsertProfileDto },
  },
})
```

- 타입: `dto?: ClassConstructor`
- 적용 대상: CREATE, UPDATE, UPSERT route 옵션

## 동작

각 인터셉터의 `validateBody`(및 update의 `validateBulkUpdateItem`):

```ts
const target = methodOptions.dto ?? crudOptions.entity;   // dto 있으면 dto로 검증
const transformed = plainToInstance(target, body);
const errors = await validate(transformed, {
  whitelist: true,
  forbidNonWhitelisted: false,
  forbidUnknownValues: false,
  skipMissingProperties,                                  // 아래 규칙
});
if (errors.length) throw new UnprocessableEntityException(errors);
// 저장 본문은 항상 엔티티 형태로 반환 (dto는 검증 게이트일 뿐)
return methodOptions.dto ? plainToInstance(crudOptions.entity, body) : transformed;
```

`skipMissingProperties` 해석 (method > global > default 우선순위는 유지):
- **CREATE**: `dto`가 있으면 default `false`(strict) — DTO가 필수/선택을 명시하므로 필수값 강제가 자연스럽다. `dto`가 없으면 기존 default(`true`, 0.4.1).
- **UPDATE / UPSERT**: 기존 default(`true`) 유지 — DTO 유무와 무관하게 PATCH 의미(보낸 필드만 검증).

## 영향 파일

- `src/lib/interface/decorator-option.interface.ts` — create/update/upsert route 옵션에 `dto?` + 주석
- `src/lib/interceptor/create-request.interceptor.ts` — `validateBody`
- `src/lib/interceptor/update-request.interceptor.ts` — `validateBody`, `validateBulkUpdateItem`
- `src/lib/interceptor/upsert-request.interceptor.ts` — `validateBody`
- `src/test/dto-validation-option.test.ts` — 신규 (sqlite in-memory)
- `package.json` / `package-lock.json` — 0.4.1 → 0.5.0

## 하위호환

`dto` 미지정 시 검증 대상·동작이 현재와 완전히 동일. 신규 옵션은 순수 opt-in.

## 테스트 (sqlite in-memory)

1. CREATE + dto: DTO-선택 필드 생략 → 통과 / DTO-필수 필드 생략 → 422(strict) / DTO에 없는 필드 → strip(whitelist)
2. UPDATE + dto: 부분 본문(필드 생략) → 통과(lenient)
3. present 필드 타입 오류 → 422
4. 하위호환: dto 없음 → 엔티티 검증 동작 불변

## 엣지케이스

- 중첩 DTO(`@ValidateNested` + `@Type`) 지원 — `plainToInstance(dto, body)`가 처리
- `allowedParams`가 검증 전에 본문을 필터 (DTO는 allowedParams의 부분집합 가정)
- bulk create(배열) / bulk update 각 항목에 dto 적용
