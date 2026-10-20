# Flick

開いた瞬間にメモでき、カードのフリックでステータスを動かすタスク管理アプリ。

- 本番: https://flicktask.junjun-tama.workers.dev
- 操作: メモ欄で Enter → タスク追加（Shift+Enter で改行、複数行は行ごとにタスク化）
  - 右フリック: 未着手 → 進行中 → 完了
  - 左フリック: 完了 → 進行中 → 未着手、未着手で左フリック → 削除（元に戻す可）
  - タイトルをタップで編集、丸アイコンで次のステータス、キーボードは ← → / Enter / Delete
  - ✦ ボタン: Workers AI がメモをタスクに分解し、「金曜までに」「明日17時」などから期限も拾う（候補ごとに期限を外せる）
  - カードをタップ → 詳細シート（タイトル・ステータス・メモ・期限・やる時間）。「予定」を選ぶとカレンダーとスケジュールにだけ出る予定になる
  - ホームはタスク一覧とスケジュール一覧の2分割（スマホは切り替え、広い画面は左右並び）。メモ欄の「→ タスク / → 予定」で Enter の追加先を切り替え
  - 右上のカレンダーボタン → 月表示 → 日付タップで時間ごとの日表示（左右スワイプで前後、空き枠タップで新規作成、ブロックをドラッグで移動・下端で長さ変更／スマホは長押ししてから）
  - 表示ルール: **予定 = 青緑のフラットなブロック（左に濃い線）**、**やる時間 = 青紫のガラスのブロック**、**期限 = 破線の線・フラグ**（現在時刻は実線）
  - 予定は終了日を入れると連日・終日（例: 10/21〜10/22）。月表示ではつながった帯で表示
- **イベント（大会・行事）**: 右上の旗ボタン → 一覧（本番まで○日・準備の進み具合）→ 詳細（準備／当日の動き／予定）
  - ホームの「すべて」ではタスクがイベントごとの折りたたみ（タップで開閉、開閉状態は端末に記憶）。イベントチップで絞り込むと、メモや AI で追加したものはそのイベントに入る
  - 役割（担当）は「＋ 役割を追加」で自由に入力。終了したイベントは詳細画面から再開できる
  - 準備は 期限切れ → 今週 → 本番まで → 本番中 → 本番後 → 日付なし で並ぶ
  - 当日の動き = 本番日の時間つきタスク。担当（役割）・場所・持ち物を付けられる
- **当日モード**: 本番日はホームに帯が出る（イベント詳細の「当日モードを開始」からも）
  - 端末ごとに担当を選ぶ（共有ログインでも、受付の人のスマホは受付として開く）。本部は全体ボード
  - いま／つぎ（あと○分）、右フリックで完了、遅れは赤い破線、押し（+5/10/15分）をまとめて反映
  - 終了で未完了の扱い（完了／準備に回す）と来年への申し送りを保存。最終日を終えるとイベントは終了扱い（本番前のプレビューは閉じるだけ）
  - 全体ボードは「全員」列＋担当ごとの列。時間が重なる動きは列の中で横に並ぶ
- **同期とデータ**: 別端末の変更は WebSocket（Durable Objects）で約1秒で反映。端末には未完了と直近60日分だけを置き、
  古い月はカレンダーで開いたときに取得。削除は30日後に自動で消去。アカウントメニューから JSON で書き出し／読み込み（別アカウントへの引き継ぎ可）

## 構成

（Durable Objects の UserHub がアカウントごとのリアルタイム通知を担当。毎日 03:00 JST に削除済みデータを掃除する cron あり）


```
Browser (Svelte 5, local-first)
   │  HTML/CSS/JS  ── Workers Static Assets
   │  /api/*, /auth/* ──▶ Cloudflare Worker (Hono)
                              ├─ D1 (users / sessions / tasks)
                              ├─ Workers AI (Llama 3.3 70B, JSON Schema 出力)
                              └─ Google OAuth 2.0 (Authorization Code + PKCE)
```

## 技術選定の理由

| 領域 | 採用 | 理由 |
| --- | --- | --- |
| ホスティング | **Cloudflare Workers + Static Assets** | 静的ファイルとAPIを1つのWorkerで配信でき、Pages と Workers を分ける必要がない。エッジ配信で初回表示が速く、無料枠が大きい。 |
| DB | **Cloudflare D1** | Worker からバインディングで直接呼べる SQLite。ユーザー・セッション・タスクという素直なリレーショナルデータに合う。`batch()` で同期を1往復にまとめられる。 |
| AI | **Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) | 指定どおり。日本語の指示追従が安定し、`response_format: json_schema` で配列を確実に返せる。fp8-fast で応答が数秒以内。外部APIキー不要（バインディングのみ）。 |
| APIフレームワーク | **Hono** | Workers ネイティブで軽量（数十KB）。ルーティング・Cookie ヘルパーが揃っていて、認証まわりを最小コードで書ける。 |
| 認証 | **Google OAuth 2.0 を自前実装（PKCE + state）** | Google のみなので Auth.js などの汎用ライブラリは過剰。Web Crypto だけで実装でき依存ゼロ。セッションはランダムトークンを HttpOnly Cookie に入れ、DB には SHA-256 ハッシュのみ保存（DB流出時もセッションを奪えない）。 |
| フロント | **Svelte 5** | ランタイムが小さく（gzip 約26KB）初回表示が速い。`transition` / `animate:flip` が標準搭載で、追加ライブラリなしにリスト移動・出入りのアニメーションを書ける。runes（`$state`）でストアが簡潔。 |
| ビルド | **Vite + @cloudflare/vite-plugin** | 開発時も Worker を本物のランタイム（workerd）で動かせるので、ローカルと本番の差が小さい。HMR が速い。 |
| 「開いた瞬間メモ」 | **インラインHTML/CSS + ローカルファースト** | メモ欄とスケルトンを `index.html` に直書きし、JS 読み込み前の最初の描画からフォーカス済み・入力可能。JS 読み込み前に Enter した内容もキューに保存。アプリ起動時にその textarea 要素ごと引き継ぐので、入力途中の文字・カーソル位置も失われない。データは localStorage に即保存し、ログイン中はバックグラウンドで D1 と同期（オフラインでも動く）。Web フォントを使わずシステムフォントにしたのも初回表示のため。 |
| フリック | **Pointer Events を自前実装** | マウス・タッチ・ペンを1つのコードで扱える。`touch-action: pan-y` で縦スクロールを妨げず、横方向だけ取る。しきい値・速度（フリング）判定、端のラバーバンド、しきい値超えで触覚フィードバック（`navigator.vibrate`）。ジェスチャーライブラリより軽く、挙動を細かく調整できる。 |
| デザイン | **CSS の Liquid Glass** | `backdrop-filter: blur + saturate`、内側ハイライト、スペキュラー（マウス追従の光）、ゆっくり動く背景の色ブロブで白ベースのガラス感。`prefers-reduced-motion` ではアニメーションを抑制。 |
| テスト | **Playwright** | 実ブラウザ（Chromium）でデスクトップとモバイル（Pixel 7・タッチ）両方を自動テスト。Google ログインは自動化できないため、localhost 限定の `/auth/dev-login`（`.dev.vars` の `DEV_LOGIN=1` かつホスト名が localhost のときだけ有効、本番では 404 をテストで確認）を使う。 |

## 開発

```bash
npm install
npm run db:migrate:local
npm run dev          # http://localhost:5173 （.dev.vars に DEV_LOGIN=1）
npm test             # ローカル E2E（Workers AI は実際に呼ばれます）
BASE_URL=https://flicktask.junjun-tama.workers.dev npx playwright test   # 本番スモーク
```

## デプロイ

```bash
npm run db:migrate:remote
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npm run deploy
```

Google Cloud Console の OAuth クライアント（ウェブアプリケーション）に、承認済みのリダイレクト URI として
`https://flicktask.junjun-tama.workers.dev/auth/callback` を登録してください。

OAuth 同意画面は「本番環境」で公開しており、どの Google アカウントでもログインできます（スコープは `openid email profile` のみ）。
独自ドメインは使わず、`workers.dev` が Public Suffix List に載っていることを利用して `junjun-tama.workers.dev` を承認済みドメインにしています。

- 所有確認: Google Search Console の URL プレフィックス プロパティ `https://flicktask.junjun-tama.workers.dev/` を HTML ファイルで確認。
  確認ファイル `/googlefa52df59a4a2a0d4.html` は Worker が返します（静的アセットだと `.html` なしの URL へリダイレクトされるため）。消すと確認が外れます。
- ブランディング: ホームページ `/`、プライバシーポリシー [`/privacy`](public/privacy.html)、利用規約 [`/terms`](public/terms.html)。
