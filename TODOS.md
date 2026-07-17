# TODOS

## Workshop — Time Tracking

### 階段級時間線(Approach B)

**What:** 把 `workshop_jobs.created_at`、`workshop_quotes.created_at`/`confirmed_at`、`workshop_invoices` 的自動時間戳串起來,做真正的階段級時間線,能說出「平均卡在報價階段 2 天」這種具體故事。

**Why:** 目前的時間追蹤系統(v1)只有工單總週期時間,能提供「省下 X 天」的話術,但無法指出具體是哪個階段慢。階段級細節對銷售話術更有說服力,也能幫工坊老闆找到真正的流程瓶頸。

**Context:** 源自 2026-07-17 的 office-hours 設計討論(`Tim-main-design-20260717-173421.md`)。當時明確決定先做總週期時間版本(Approach A)驗證話術有效性,再投入這個階段級版本,避免在假設未驗證前投入 1-2 週工程時間。這個 TODO 就是那個「之後」。

**Effort:** M
**Priority:** P3
**Depends on:** Approach A(工單總週期時間功能)已上線且被至少一次真實銷售對話驗證話術有效;`workshop_invoices` 自動時間戳欄位(見下一項 TODO)

### workshop_invoices 補上自動時間戳欄位

**What:** 幫 `workshop_invoices` 表新增一個資料庫自動寫入的時間戳欄位(例如 `created_at`),取代目前只有 `invoice_date`/`payment_date` 這種員工手動填寫的日期欄位。

**Why:** 階段級時間線(見上一項 TODO)需要「開發票」這個階段的可信時間點,但目前 `workshop_invoices` 沒有任何員工改不了的自動時間戳,只有手動日期欄位——跟 `workshop_jobs.status`/`date_out` 一樣存在「延後補登」污染的風險。

**Context:** 源自 2026-07-17 的 /plan-eng-review 架構審查(對 `Tim-main-design-20260717-173421.md` 的審查),確認現有 `workshop_invoices` schema 缺少這個欄位。只有做階段級時間線(Approach B)時才需要,v1(總週期時間版本)不依賴這個欄位。

**Effort:** S
**Priority:** P3
**Depends on:** None(可以先做,不阻塞其他工作;但價值只在 Approach B 開工時才體現)

## Design System

### 建立正式 DESIGN.md

**What:** 跑 `/design-consultation` 建立正式的 DESIGN.md,把目前散落在各功能設計文檔裡的色彩選擇規則(例如什麼情況用 `--green`、什麼情況用 `--blue`/`--yellow`/`--red`)統一綁定成全局規範。

**Why:** `/plan-design-review` 審查「省下 X 天」統計卡片時發現:專案目前沒有 DESIGN.md,色彩選擇規則只能在每個功能文檔裡就事論事寫一次,沒有跨功能一致的規範,容易導致不同頁面對同一種語意(例如「正向/警示/中性」)用不同顏色。

**Context:** 源自 2026-07-17 的 `/plan-design-review`(對 `Tim-main-design-20260717-173421.md` 的審查)。現有的 `stat-card`/`SC` 元件模式(`App.jsx`、`ScrapyardSales.jsx`)已經很成熟,值得先盤點現有色彩使用慣例再正式文件化,而不是憑空定義新規則。

**Effort:** M
**Priority:** P3
**Depends on:** None
