# Delivery Order Log Analytics (Mini)

배달 앱(배달의민족/쿠팡이츠 스타일)을 가정한 주문 이벤트 로그(event log) 를 기반으로
데이터를 정규화/가공하고 KPI(리드타임, 취소율 등)를 계산해 대시보드/리포트에 활용하는 미니 프로젝트.

## Goals (MVP)

-   샘플 이벤트 로그(JSON)로부터 주문 단위로 이벤트를 묶고 정렬

-   이상치/누락치 최소 처리(검증/정규화)

-   KPI 및 시계열 집계 결과를 JSON으로 생성

-   웹 대시보드에서 결과 시각화

## Project Structure

```powershell
.
├─ README.md
├─ docs/
├─ data/
│  ├─ raw/                 # 원본 샘플 로그
│  └─ processed/           # 처리/집계 결과(웹/대시보드가 읽는 산출물)
├─ scripts/
│  ├─ buildMetrics.js      # raw → core 처리 → processed 산출물 생성
│  └─ generateSample.js    # 샘플 데이터 생성
└─ src/
   ├─ core/                # 순수 로직
   └─ web/                 # 대시보드 UI
```
