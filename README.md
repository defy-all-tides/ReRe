# 🧠 Relationship Reminder (시각적 사고의 연결)

> **사람과 생각을 연결하는 지능형 관계 마인드맵 & 소통 관리 도구**

Relationship Reminder는 소중한 인연들과의 만남, 메모, 친밀도, 그리고 관계 네트워크를 인터랙티브 마인드맵과 타임라인으로 한눈에 파악하고 관리할 수 있는 웹 애플리케이션입니다.

---

## ✨ 주요 기능

### 1. 🌐 인터랙티브 관계 마인드맵
- **중심 인물(나) 기반 시각화**: 인물 노드를 자유롭게 배치하고 드래그 앤 드롭으로 이동할 수 있습니다.
- **관계선(Connection) 생성 및 삭제**: 두 노드를 선택하여 유기적인 관계선을 생성하거나 분리할 수 있습니다.
- **그룹 분류 & 색상 태그**: 가족, 친구, 직장 등 다중 그룹 지정 및 그룹별 필터링/숨김 기능을 지원합니다.
- **물리 엔진 기반 자동 정렬**: 친밀도 점수 및 그룹별 군집을 계산하여 최적의 방사형 마인드맵 레이아웃을 자동 계산합니다.

### 2. 👤 인물 상세 프로필 & 메모
- 프로필 사진 업로드 (Supabase Storage `profiles` 버킷)
- 직업, 나이, 관계 정의
- 4대 영역 맞춤형 메모:
  - 📅 약속 메모
  - 📝 개인 특성/취향
  - 📜 히스토리/스토리
  - ⚠️ 주의사항/체크포인트

### 3. ☕ 만남 및 활동 기록 타임라인 (Activity & Meeting Log)
- 만남 유형(대화, 식사/커피, 활동/취미, 선물, 전화 등)별 기록 관리
- 만남 사진 및 문서 첨부파일 업로드 (Supabase Storage `documents` 버킷)
- 최근 만남 이력 기반 **친밀도 점수(Intimacy Score)** 및 관계 거리 자동 산출
- 전체 만남 목록을 한눈에 조회하고 수정/삭제할 수 있는 전용 뷰어 제공

### 4. 🔒 안전한 인증 & 클라우드 동기화
- Supabase Auth 기반 사용자 인증
- 브라우저 확장프로그램(광고차단/보안도구) 간섭 우회를 위한 자체 Next.js API 라우트 연동
- 비밀번호 분실 시 보안 질문 기반 원격 복구 지원
- Supabase 실시간 데이터베이스 자동 동기화 & 마이그레이션

---

## 🛠 기술 스택

- **Frontend**: Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Styling**: Tailwind CSS v4, Framer Motion, Lucide React
- **Backend / DB**: Supabase (PostgreSQL, Auth, Storage)

---

## 🚀 시작하기

### 1. 레포지토리 클론
```bash
git clone <repository-url>
cd ppl_mindmap
```

### 2. 의존성 설치
```bash
npm install
```

### 3. 환경 변수 설정
`.env.example` 파일을 복사하여 `.env.local`을 생성하고 본인의 Supabase 프로젝트 정보를 입력합니다.
```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. 개발 서버 실행
```bash
npm run dev
```
브라우저에서 [http://localhost:3000](http://localhost:3000)으로 접속합니다.
