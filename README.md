아래는 **개발용 요건정의서 v0.1** 느낌으로 정리한 거야.
전제는 **별도 웹앱 UI 없이, 사용자는 Zoom Team Chat 안에서만 조작**하는 방식이야.

---

# Zoom Team Chat 회의록 Task 분리 봇 요건정의서

## 1. 서비스 개요

### 서비스명

**Meeting Task Bot for Zoom**

### 목적

오프라인 회의 또는 Zoom 회의 후 작성된 회의록/메모를 Zoom Team Chat 채널에 입력하면, AI가 내용을 분석하여 실행 가능한 task를 자동 추출하고, 사용자가 Zoom 안에서 확인한 뒤 Zoom Tasks에 등록할 수 있게 한다.

Zoom Chatbot API는 Zoom Team Chat 안에서 메시지 송수신, 사용자 입력 응답, 자동화 작업 수행에 사용할 수 있다. 또한 Zoom Tasks API는 Zoom 안의 task를 생성, 조회, 수정, 삭제하는 데 사용할 수 있다. ([Zoom][1])

---

## 2. 핵심 컨셉

```txt
오프라인 회의 / Zoom 회의
        ↓
회의록 작성
        ↓
Zoom Team Chat 채널에 회의록 붙여넣기
        ↓
@MeetingTaskBot task化して
        ↓
AI가 task 후보 추출
        ↓
Zoom 채팅 메시지로 결과 표시
        ↓
사용자가 승인
        ↓
Zoom Tasks에 task 등록
```

중요한 방향은 **“Zoom 회의에 참가하는 봇”이 아니라 “Zoom Team Chat 안에서 작동하는 회의 후 처리 봇”**으로 만드는 것.

---

## 3. 사용자

### 주요 사용자

* 회의 참가자
* 회의록 작성자
* 프로젝트 리더
* Zoom Team Chat 채널을 사용하는 팀원

### 관리자

* Zoom Marketplace 앱을 등록/관리하는 사람
* 봇 서버 환경변수와 API 키를 관리하는 사람

---

## 4. MVP 범위

### MVP에 포함

1. Zoom Team Chat 채널에서 봇 호출
2. 회의록 텍스트 입력
3. AI 기반 task 후보 추출
4. 추출된 task를 Zoom 채팅 메시지로 표시
5. 사용자가 전체 승인 또는 취소
6. 승인된 task를 Zoom Tasks에 등록
7. 등록 결과를 Zoom 채팅에 표시

### MVP에서 제외

1. Zoom 회의 실시간 음성 수집
2. 오프라인 회의 음성 녹음/음성 인식
3. 채널 전체 메시지 자동 감시
4. 복잡한 task 수정 UI
5. Notion/Miro 연동
6. 개인별 상세 권한 관리
7. 다국어 자동 번역

---

## 5. 기본 사용 흐름

### 5.1 오프라인 회의 후 사용

사용자가 Zoom Team Chat에 회의록을 붙여넣는다.

```txt
@MeetingTaskBot 아래 회의록에서 task를 분리해줘.

회의록:
- 다음 주까지 API 설계안을 정리하기로 함
- 郭さん이 Zoom Tasks API 권한을 조사
- 田中さん은 UI 문구를 정리
- Miro 시각화는 다음 회의에서 다시 논의
```

봇 응답:

```txt
📌 抽出されたタスク

1. API設計案を作成する
担当: 未定
期限: 来週
優先度: Medium
根拠:「次の週までにAPI設計案を整理する」

2. Zoom Tasks APIの権限を調査する
担当: 郭さん
期限: 未定
優先度: Medium
根拠:「郭さんがZoom Tasks API権限を調査」

3. UI文言を整理する
担当: 田中さん
期限: 未定
優先度: Low
根拠:「田中さんはUI文言を整理」

除外:
- Miro視覚化は「次回再検討」のため、現時点では明確なtaskではありません。

[全部登録] [キャンセル]
```

사용자가 `[全部登録]`을 누르면 Zoom Tasks에 등록한다.

---

## 6. 기능 요건

## FR-001: 봇 호출

### 설명

사용자는 Zoom Team Chat 채널에서 봇을 호출할 수 있어야 한다.

### 입력 예시

```txt
@MeetingTaskBot task化して
```

```txt
@MeetingTaskBot 아래 회의록에서 할 일 뽑아줘
```

### 처리

* 봇은 호출 메시지에 포함된 회의록 텍스트를 읽는다.
* 회의록 텍스트가 없으면 사용법 안내 메시지를 반환한다.

### 완료 조건

* 봇을 멘션하면 서버 endpoint가 요청을 받는다.
* 회의록이 포함되어 있으면 task 추출 처리를 시작한다.
* 회의록이 없으면 에러가 아니라 안내 메시지를 반환한다.

---

## FR-002: 회의록 텍스트 입력

### 설명

사용자는 회의록 또는 회의 메모를 Zoom 채팅 메시지에 직접 붙여넣을 수 있어야 한다.

### 입력 형식

자유 텍스트.

```txt
회의록:
오늘은 Zoom bot 기능에 대해 논의했다.
별도 웹앱은 만들지 않고 Zoom 안에서 끝내기로 했다.
郭さん이 요건정의를 정리하고, 田中さん이 Zoom API 권한을 확인하기로 했다.
```

### 제약

* MVP에서는 텍스트 입력만 지원한다.
* PDF, Word, 음성 파일 업로드 분석은 제외한다.
* 너무 긴 회의록은 서버에서 chunking 처리한다.

---

## FR-003: task 추출

### 설명

AI는 회의록에서 실행 가능한 task만 추출해야 한다.

### task로 추출해야 하는 것

* 누군가가 해야 하는 일
* 다음 회의 전까지 확인해야 하는 것
* 조사/정리/구현/검토/공유 요청
* 담당자나 기한이 명시된 action item

### task로 추출하지 말아야 하는 것

* 단순 잡담
* 완료된 일
* 단순 아이디어
* “다음에 논의하자”처럼 아직 실행이 확정되지 않은 내용
* 감상, 배경 설명

### 출력 JSON

```ts
type ExtractedTask = {
  tempId: string;
  title: string;
  description: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  dueDate: string | null; // yyyy-MM-dd
  priority: "Low" | "Medium" | "High" | "Highest";
  status: "To do" | "In progress" | "Blocked" | "Recommended";
  evidence: string;
  confidence: number;
  shouldCreateTask: boolean;
  reasonIfExcluded?: string;
};
```

Zoom Tasks API의 task 생성에서는 `title`, `description`, `priority`, `status`, `due_date`, `assignees`, `collaborators` 등을 사용할 수 있고, `title`은 필수다. 우선순위는 `"Low"`, `"Medium"`, `"High"`, `"Highest"`이고, 상태는 `"To do"`, `"In progress"`, `"Done"`, `"Blocked"`, `"Recommended"` 형식이다. ([Zoom][2])

---

## FR-004: task 후보 표시

### 설명

AI가 추출한 task 후보를 Zoom Team Chat 메시지로 표시한다.

### 표시 항목

각 task마다 다음 항목을 보여준다.

```txt
- 제목
- 설명
- 담당자
- 기한
- 우선순위
- 근거 문장
- 신뢰도
```

### 메시지 예시

```txt
📌 抽出されたタスク

1. Zoom API権限を確認する
担当: 田中さん
期限: 未定
優先度: Medium
根拠:「田中さんがZoom API権限を確認する」

2. 要件定義を整理する
担当: 郭さん
期限: 明日
優先度: High
根拠:「郭さんが明日までに要件定義をまとめる」

[全部登録] [キャンセル]
```

Zoom Chatbot의 메시지 전송 API는 `/im/chat/messages`이며, Marketplace Chatbot app에서 메시지를 보낼 수 있다. 메시지에는 bot JID, 전송 대상 JID, account ID, content 등이 필요하다. ([Zoom][1])

---

## FR-005: 전체 승인

### 설명

사용자는 추출된 task 후보 전체를 승인할 수 있어야 한다.

### 처리

사용자가 `[全部登録]`을 누르면:

1. 승인 가능한 task만 필터링한다.
2. 각 task를 Zoom Tasks API로 생성한다.
3. 생성 성공/실패 결과를 채팅에 표시한다.

### 완료 메시지 예시

```txt
✅ 3件のタスクをZoom Tasksに登録しました。

1. Zoom API権限を確認する
2. 要件定義を整理する
3. UI文言を作成する
```

Zoom Tasks API는 `POST /tasks/items`로 새 task를 생성하며, 생성 성공 시 `task_id`, `title`, `description`, `due_date`, `link` 등을 반환한다. ([Zoom][2])

---

## FR-006: 취소

### 설명

사용자는 task 등록을 취소할 수 있어야 한다.

### 처리

* `[キャンセル]`을 누르면 task를 생성하지 않는다.
* 채팅에 취소 메시지를 표시한다.

### 메시지 예시

```txt
登録をキャンセルしました。
```

---

## FR-007: 담당자 매핑

### 설명

회의록에 나온 사람 이름을 Zoom 사용자 이메일과 매핑할 수 있어야 한다.

### MVP 처리 방식

MVP에서는 자동 매핑을 완벽하게 하지 않는다.

```txt
郭さん → 등록된 매핑이 있으면 email 사용
郭さん → 매핑이 없으면 assignee 없이 task 생성
```

### 내부 매핑 예시

```ts
const userMap = {
  "郭さん": "gwakkyoungpin@gmail.com",
  "田中さん": "tanaka@example.com"
};
```

### 완료 조건

* 매핑 가능한 사람은 assignee로 등록한다.
* 매핑 불가능한 사람은 description에 담당자 이름만 남긴다.
* 담당자 불명은 `未定`으로 표시한다.

Zoom Tasks API에서 assignee를 추가할 때는 이메일을 사용할 수 있고, 해당 사용자는 요청 사용자와 같은 account에 속해야 한다. ([Zoom][2])

---

## FR-008: 기한 처리

### 설명

회의록의 자연어 날짜를 `yyyy-MM-dd`로 변환한다.

### 예시

현재 날짜가 2026-06-06이라고 가정하면:

```txt
明日 → 2026-06-07
来週の月曜 → 2026-06-08
6月10日 → 2026-06-10
来週まで → null 또는 2026-06-13
```

### 방침

* 명확한 날짜만 `dueDate`로 넣는다.
* 애매한 표현은 task description에 남기고 `dueDate: null`로 둔다.
* 잘못된 날짜를 추측해서 넣지 않는다.

---

## FR-009: 중복 task 방지

### 설명

같은 회의록에서 거의 동일한 task가 여러 번 추출되면 하나로 병합한다.

### 중복 판단 기준

* 제목이 거의 같음
* 담당자가 같음
* 근거 문장이 유사함
* 같은 행동을 요구함

### 예시

```txt
API権限を確認する
Zoom APIのscopeを確認する
```

위 두 개는 하나로 합친다.

---

## FR-010: 에러 처리

### 에러 케이스

| 상황               | 봇 응답                |
| ---------------- | ------------------- |
| 회의록 없음           | 사용법 안내              |
| AI 추출 실패         | 다시 시도 안내            |
| task 없음          | “明確なタスクは見つかりませんでした” |
| Zoom Tasks 등록 실패 | 실패한 task 목록 표시      |
| 권한 부족            | 관리자에게 권한 확인 요청      |
| 담당자 이메일 불명       | 담당자 없이 등록           |

---

# 7. 비기능 요건

## NFR-001: 사용자 경험

* 사용자는 Zoom 밖으로 나가지 않아야 한다.
* 별도 웹앱 화면을 열지 않아야 한다.
* 결과는 Zoom Team Chat 메시지 안에서 확인 가능해야 한다.

## NFR-002: 보안

* OpenAI API Key, Zoom Client Secret은 환경변수로 관리한다.
* 회의록 원문은 기본적으로 장기 저장하지 않는다.
* 로그에는 회의록 전문을 남기지 않는다.
* task 생성 결과와 오류 코드 정도만 저장한다.

## NFR-003: 개인정보

* 회의록에는 개인 정보나 회사 내부 정보가 포함될 수 있으므로 최소 저장 원칙을 따른다.
* 사용자가 명시적으로 요청하지 않으면 회의록 원문을 DB에 저장하지 않는다.
* 디버그 로그에 회의록 원문이 출력되지 않게 한다.

## NFR-004: 성능

* 짧은 회의록은 10초 내외 응답을 목표로 한다.
* 긴 회의록은 “처리 중” 메시지를 먼저 보내고, 완료 후 결과 메시지를 업데이트한다.
* Zoom API에는 rate limit이 있으므로 재시도 로직을 둔다. Zoom API 문서에서도 rate limit 초과 시 HTTP 429가 반환될 수 있다고 설명한다. ([Zoom][3])

---

# 8. 시스템 구성

```txt
Zoom Team Chat
    ↓
Zoom Chatbot Event
    ↓
Backend API
    ↓
Task Extraction Service
    ↓
OpenAI API
    ↓
Task Review Message Generator
    ↓
Zoom Chatbot Message API
    ↓
User Approval
    ↓
Zoom Tasks API
```

---

# 9. 권장 기술 스택

## Backend

둘 중 하나 추천.

### 선택 A: Next.js API Routes

네가 Next.js를 많이 쓰니까 가장 편함.

```txt
Next.js
Vercel
OpenAI API
Zoom API
```

### 선택 B: FastAPI

API 분리하고 싶으면 좋음.

```txt
FastAPI
AWS Lambda or Railway
OpenAI API
Zoom API
```

이번 프로젝트는 “앱 UI를 따로 만들지 않는다”가 조건이므로, **Next.js API Routes만으로 충분**해 보임.

---

# 10. API 설계

## 10.1 Zoom Event 수신

```txt
POST /api/zoom/events
```

### 역할

Zoom Chatbot 이벤트를 수신한다.

### 처리

1. Zoom 요청 검증
2. 메시지 내용 파싱
3. 봇 호출 여부 확인
4. 회의록 텍스트 추출
5. task 추출 실행
6. Zoom 채팅에 결과 응답

---

## 10.2 task 추출

```txt
POST /api/internal/extract-tasks
```

### Request

```json
{
  "channelId": "string",
  "userId": "string",
  "meetingText": "string",
  "language": "ja"
}
```

### Response

```json
{
  "tasks": [
    {
      "tempId": "task_1",
      "title": "Zoom API権限を確認する",
      "description": "Zoom Tasks APIを利用するために必要なscopeを確認する。",
      "assigneeName": "田中さん",
      "assigneeEmail": null,
      "dueDate": null,
      "priority": "Medium",
      "status": "To do",
      "evidence": "田中さんがZoom API権限を確認する",
      "confidence": 0.91,
      "shouldCreateTask": true
    }
  ],
  "excludedItems": [
    {
      "text": "Miro視覚化は次回再検討",
      "reason": "まだ実行が確定していないため"
    }
  ]
}
```

---

## 10.3 승인 처리

```txt
POST /api/zoom/actions/approve-tasks
```

### Request

```json
{
  "approvalId": "approval_123",
  "channelId": "string",
  "approvedBy": "string"
}
```

### 처리

1. 임시 저장된 task 후보 조회
2. `shouldCreateTask = true`인 task만 필터링
3. Zoom Tasks API로 생성
4. 결과 메시지 전송

---

# 11. 내부 데이터 모델

## 11.1 TaskCandidate

```ts
type TaskCandidate = {
  id: string;
  approvalId: string;
  sourceChannelId: string;
  sourceUserId: string;
  title: string;
  description: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  priority: "Low" | "Medium" | "High" | "Highest";
  status: "To do" | "In progress" | "Blocked" | "Recommended";
  evidence: string;
  confidence: number;
  shouldCreateTask: boolean;
  createdZoomTaskId?: string;
  createdAt: string;
};
```

## 11.2 UserAliasMap

```ts
type UserAliasMap = {
  id: string;
  zoomAccountId: string;
  alias: string;       // 郭さん, 田中さん
  email: string;
  zoomUserId?: string;
  createdAt: string;
};
```

## 11.3 ApprovalSession

```ts
type ApprovalSession = {
  id: string;
  channelId: string;
  requestedBy: string;
  status: "pending" | "approved" | "cancelled" | "failed";
  createdAt: string;
  expiresAt: string;
};
```

---

# 12. DB 사용 여부

MVP에서도 최소 DB는 있는 게 좋음.

## DB가 필요한 이유

* `[全部登録]` 버튼을 눌렀을 때, 이전에 추출한 task 후보를 다시 찾아야 함
* 담당자 이름과 이메일 매핑을 저장해야 함
* 중복 승인 방지 필요
* 에러 추적 필요

## 추천

```txt
Supabase PostgreSQL
```


---

# 13. OpenAI 프롬프트 요건

## System Prompt

```txt
You are a meeting task extraction agent.

Extract only actionable tasks from the meeting notes.
Do not invent assignees, deadlines, or decisions.
If the assignee is unclear, set assigneeName and assigneeEmail to null.
If the deadline is unclear, set dueDate to null.
Exclude discussion points, ideas, and undecided items.
Return valid JSON only.
```

## User Prompt Template

```txt
Current date: {{currentDate}}
Language: Japanese or Korean

Meeting notes:
{{meetingText}}

Return:
{
  "tasks": [...],
  "excludedItems": [...]
}
```

---

# 14. Zoom Tasks 생성 매핑

AI 출력값을 Zoom Tasks API 요청으로 변환한다.

```ts
const zoomTaskPayload = {
  title: task.title,
  description: [
    task.description,
    "",
    `根拠: ${task.evidence}`,
    `AI confidence: ${task.confidence}`
  ].join("\n"),
  priority: task.priority,
  status: "To do",
  due_date: task.dueDate ?? undefined,
  is_public: false,
  starred: false,
  assignees: task.assigneeEmail
    ? [{ email: task.assigneeEmail }]
    : undefined,
  skip_notifications: false
};
```

Zoom Tasks API에서 `assignees`와 `collaborators`는 최대 20명까지 지정 가능하고, `due_date`는 `yyyy-MM-dd` 형식이다. ([Zoom][2])

---

# 15. 화면/메시지 문구

UI는 Zoom 메시지뿐이므로, 문구 설계가 중요함.

## task 없음

```txt
明確なタスクは見つかりませんでした。
議論中の内容や未確定の内容はtaskとして抽出していません。
```

## 회의록 없음

```txt
会議メモを一緒に送ってください。

例:
@MeetingTaskBot 以下の会議メモからtaskを抽出して

会議メモ:
...
```

## 추출 성공

```txt
📌 抽出されたタスク

{{task list}}

[全部登録] [キャンセル]
```

## 등록 성공

```txt
✅ {{count}}件のタスクをZoom Tasksに登録しました。
```

## 일부 실패

```txt
⚠️ 一部のタスク登録に失敗しました。

成功: 2件
失敗: 1件

失敗理由:
- 担当者のemailがZoom account内で見つかりませんでした。
```

---

# 16. 개발 티켓 분리

## Phase 1: Zoom Chatbot 기본 연결

* Zoom Marketplace에서 Chatbot app 생성
* Bot endpoint 설정
* 환경변수 설정
* `/api/zoom/events` 구현
* 봇 호출 시 “pong” 메시지 반환

완료 조건:

```txt
Zoom Team Chat에서 봇을 호출하면 응답이 온다.
```

---

## Phase 2: 회의록 입력 파싱

* 봇 호출 메시지에서 회의록 부분 추출
* 회의록이 없을 때 안내 메시지 반환
* 긴 텍스트 처리 준비

완료 조건:

```txt
회의록 텍스트만 backend에서 추출 가능하다.
```

---

## Phase 3: AI task 추출

* OpenAI 호출 구현
* JSON schema 강제
* task/excludedItems 분리
* 중복 task 병합

완료 조건:

```txt
회의록 입력 시 task 후보 JSON이 생성된다.
```

---

## Phase 4: Zoom 채팅 결과 표시

* task 후보를 Zoom 메시지 형태로 formatting
* 승인/취소 action ID 생성
* approval session 저장

완료 조건:

```txt
Zoom 채팅에 task 후보 목록이 표시된다.
```

---

## Phase 5: Zoom Tasks 등록

* Zoom Tasks API 연결
* task 생성
* assignee email 매핑
* 성공/실패 결과 메시지 표시

완료 조건:

```txt
승인 시 Zoom Tasks에 실제 task가 생성된다.
```

---

## Phase 6: 안정화

* 에러 처리
* rate limit 대응
* 로그 정리
* 권한 부족 메시지 개선
* 보안 점검

완료 조건:

```txt
실제 팀 채널에서 반복 사용 가능하다.
```

---

# 17. 수용 기준

## 기본 성공 조건

* 사용자가 Zoom Team Chat에서 회의록을 붙여넣고 봇을 호출할 수 있다.
* AI가 실행 가능한 task만 추출한다.
* task 후보가 Zoom 채팅 안에 표시된다.
* 사용자가 승인하면 Zoom Tasks에 등록된다.
* 등록 결과가 Zoom 채팅에 표시된다.
* 별도 웹앱 화면이 필요 없다.

## 품질 기준

* 담당자/기한을 모르면 추측하지 않는다.
* “다음에 논의” 같은 미확정 내용은 task로 만들지 않는다.
* task의 근거 문장을 함께 보여준다.
* 사용자가 승인하기 전에는 Zoom Tasks에 등록하지 않는다.

---

# 18. 최종 MVP 한 줄 정의

> Zoom Team Chat上で会議メモを送信すると、AIがアクションアイテムを抽出し、ユーザー確認後にZoom Tasksへ登録できるChatbot機能。

---

# 19. 구현 상태

현재 저장소에는 위 요건을 실행할 수 있는 Next.js API-only MVP가 구현되어 있다.

* Zoom slash command와 `team_chat.app_mention` 수신
* Zoom webhook 서명 및 endpoint validation 처리
* OpenAI, Gemini, Claude structured output 호출
* provider별 복수 API key와 자동 fallback
* account별 provider 순서와 모델 설정
* API key AES-256-GCM 암호화 저장
* task 후보 PostgreSQL 저장과 승인/취소
* Zoom Tasks 생성, 일부 실패 표시, 429/5xx 재시도
* 중복 task 병합과 긴 회의록 chunking
* API key, fallback, 승인 중복 방지, webhook 검증 테스트

기본 AI 우선순위:

```txt
OpenAI → Gemini → Claude
```

각 provider 안에서는 key priority 숫자가 작은 key부터 호출한다. 한 key가 실패하면 같은 provider의 다음 key를 호출하고, 모두 실패하면 다음 provider로 넘어간다.

---

# 20. 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

## Supabase 설정

프로덕션 및 영속 저장소는 Supabase PostgreSQL을 사용한다.

1. Supabase Dashboard에서 `zoom-task-bot` 프로젝트를 연다 (project ref: `utvzoegrwkbolxrdflta`).
2. **Project Settings → Database → Connection string**에서 비밀번호를 확인하거나 재설정한다.
3. `.env.local`에 `DATABASE_URL`을 설정한다.
   - 로컬 개발·마이그레이션: **Session mode** 또는 **Direct** (port `5432`)
   - Vercel 등 serverless 배포: **Transaction pooler** (port `6543`, `?pgbouncer=true` 포함)
4. 스키마는 `db/migrations/`에 있으며, 원격에는 이미 적용되어 있다. 로컬에서 재실행해도 `if not exists`로 멱등하다.

```bash
npm run db:migrate
curl http://localhost:3000/api/health
# persistence: "postgres", database: "ok" 확인
```

`DATABASE_URL` 없이 실행하면 in-memory 저장소를 사용한다. 이 모드는 재시작 시 API key 설정과 승인 세션이 사라지므로 로컬 확인 용도로만 사용한다.

필수 확인:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

# 21. Zoom 설정

Zoom Marketplace Chatbot 또는 Team Chat 기능에서 다음 값을 설정한다.

```txt
Bot Endpoint URL:
https://YOUR_DOMAIN/api/zoom/events

Slash command 예시:
/meetingtask
```

Chatbot 메시지에는 `imchat:bot`, Zoom Tasks 생성에는 `tasks:write` scope가 필요하다. Chatbot OAuth와 Zoom Tasks용 Server-to-Server OAuth를 별도 앱으로 관리할 수 있다.

주요 환경변수:

```txt
ZOOM_CLIENT_ID
ZOOM_CLIENT_SECRET
ZOOM_BOT_JID
ZOOM_WEBHOOK_SECRET_TOKEN

ZOOM_TASKS_ACCOUNT_ID
ZOOM_TASKS_CLIENT_ID
ZOOM_TASKS_CLIENT_SECRET

DATABASE_URL
KEY_ENCRYPTION_SECRET
```

---

# 22. AI 설정 채팅 명령

API key 관련 명령은 bot과의 1:1 채팅에서만 허용된다.

```txt
ai status
ai key add openai sk-... main-openai
ai key add gemini AIza... backup-gemini
ai key add claude sk-ant-... claude-1
ai key list
ai key remove key_abcd
ai key disable key_abcd
ai key enable key_abcd
ai key priority key_abcd 10
ai priority set claude openai gemini
ai model set openai gpt-5-mini
ai model set gemini gemini-3.5-flash
ai model set claude claude-sonnet-4-6
```

`AI_CONFIG_ADMIN_USER_IDS`에 Zoom user ID를 쉼표로 등록하면 해당 사용자만 AI 설정을 변경할 수 있다.

보안상 production에서는 secret manager 또는 환경변수 등록을 우선 권장한다. 1:1 채팅이어도 사용자가 보낸 원문 API key가 Zoom 채팅 기록에 남을 수 있으며, bot은 사용자의 메시지를 삭제할 수 없다. 서버 DB에는 key 원문 대신 AES-256-GCM 암호문과 일부 마스킹 값만 저장한다.

환경변수로도 복수 key를 등록할 수 있다.

```txt
OPENAI_API_KEYS=key1,key2
GEMINI_API_KEYS=key1,key2
ANTHROPIC_API_KEYS=key1,key2
```

---

# 23. API endpoints

```txt
GET  /api/health
POST /api/zoom/events
POST /api/internal/extract-tasks
POST /api/zoom/actions/approve-tasks
```

내부 endpoint는 production에서 `INTERNAL_API_TOKEN` Bearer 인증이 필요하다.

---

[1]: https://developers.zoom.us/docs/api/chatbot/
[2]: https://developers.zoom.us/docs/api/tasks/
[3]: https://developers.zoom.us/docs/api/rate-limits/
