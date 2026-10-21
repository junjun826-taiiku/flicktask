# Flick

体育会の幹部・イベント担当向けの、イベント（大会・行事）単位のタスク管理。PC 中心、黒基調のガラス調（ライトにも切替可）。

- 本番: https://flicktask.junjun-tama.workers.dev
- **ホーム**: 左にサイドバー（小さな月カレンダー → イベント一覧 本番まで○日・準備の進み具合 → 「その他」＝イベントに入っていないタスク）
  - これからの流れ: 全イベントを1行ずつ、3か月の時間軸に（締切の点、期限切れは赤、本番の帯、週の線、今日の線）
  - 今週やること: 期限切れ＋今週末まで。イベント別（色の帯）または締切順。チェックで完了（元に戻す可）
  - 直近の予定: 読み合わせ・MTG など（タグつき）
- **イベント画面**（サイドバーから）: 見出しに本番まで○日・進み具合・当日モード、その下にこのイベントだけの時間軸
  - 準備: 追加欄（Enter で1行1件、箇条書き可、AIで分解すると「明日17時」などの期限も拾う）。未着手・進行中・完了の3列（ドラッグで移動、スマホは1列ずつ＋フリック、← → キー）。
    担当（イベント担当）で絞り込み、担当別タイムライン（人ごとの行、帯の右端が締切）に切替。カードをクリック → 右のパネルで状態・期限・担当・メモ
  - 当日の動き: 本番日の時間割（時刻・やること・担当・場所・持ち物）。役割で絞り込み、行を追加、Excel や運営マニュアルの表を貼り付けて追加、担当別ボードに切替
  - 予定: このイベントの予定を日付順に。タグ（MTG／読み合わせ／幹部読み合わせ＋自作）、本番日の予定は「本番」
  - メモ: 見出し・箇条書き・チェック・リンクが使えるメモ（自動保存）。前年の同じ名前のイベントの申し送りを横に表示
- **イベントの編集**: 名前・日程・会場・色（15色）、イベント担当（人数自由）、当日の役割。名前の変更や削除はタスクにも反映。終了／再開、削除（元に戻す可）
- **月表示**: 複数日のイベント・予定は週ごとに1本の帯。日付を押すとその日の一覧（項目から各画面へ）
- **当日モード**（/events/:id/live、スマホ用）: 端末ごとに担当を選ぶ（共有ログインでも、受付の人のスマホは受付として開く）。本部は全体ボード
  - いま／つぎ（あと○分）、右フリックで完了、遅れは赤い破線、押し（+5/10/15分）をまとめて反映
  - 終了で未完了の扱い（完了／準備に回す）と来年への申し送り（イベントのメモに入る）。最終日を終えるとイベントは終了（本番前のプレビューは閉じるだけ）
  - 全体ボードは担当ごとの列。全員の動きと予定はボード全体に広がり、題名は手前。重なる動きは列の中で横に並ぶ
- **同期とデータ**: 別端末の変更は WebSocket（Durable Objects）で約1秒で反映。端末には未完了と直近60日分だけを置き、
  古い月はカレンダーで開いたときに取得。削除は30日後に自動で消去。右上のアカウントメニューから JSON で書き出し／読み込み（別アカウントへの引き継ぎ可）

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
| 初回表示 | **インラインHTML/CSS + ローカルファースト** | 背景色とレイアウトのスケルトンを `index.html` に直書きし、JS 読み込み前の最初の描画から画面の形が出る（テーマも最初の1フレームで反映）。アプリと当日モードは別々の JS／CSS チャンクで、必要な方だけを読む。データは localStorage に即保存し、ログイン中はバックグラウンドで D1 と同期（オフラインでも動く）。 |
| ドラッグ・フリック | **HTML5 Drag and Drop + Pointer Events を自前実装** | PC は準備のカードを列へドラッグ、スマホと当日モードはフリック。キーボード（← →）でも同じ操作。ジェスチャーライブラリを使わず軽く、挙動を細かく調整できる。 |
| デザイン | **CSS のガラス調（黒・グレー・白）** | 黒基調、ライトにも切替（端末ごとに記憶）。`backdrop-filter` は見出しやパネルなど少数に限り、長い一覧のカードはぼかさない（数十枚のぼかしは重く、PC のファンが回るため）。背景も静止。`prefers-reduced-motion` ではアニメーションを抑制。 |
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
