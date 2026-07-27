# 内部エンドポイント検証記録 (Issue #8)

各アダプタが仮定している内部 API は **すべて未検証** です。実ブラウザのログイン済み
セッションで確認し、確認できたものからこの表を更新してください。
コード側の仮定はすべて各アダプタ冒頭の `UNVERIFIED` 定数ブロックに一元化されています。

| プロバイダ | 仮定エンドポイント | 認証 | 状態 |
|---|---|---|---|
| Claude | `GET https://claude.ai/api/organizations` → `GET /api/organizations/{uuid}/usage` | Cookie | OSS実装で確認 (2026-07-27) |
| Codex | `GET https://chatgpt.com/backend-api/wham/usage` (Bearer) | Cookie + accessToken | URL確認済み・内部スキーマ暫定 (2026-07-27) |
| Grok | `POST https://grok.com/rest/rate-limits` body `{"requestKind":"DEFAULT","modelName":"grok-4"}` | Cookie | コミュニティ実装で確認 (2026-07-27)・modelName要確認 |

想定レスポンス形はアダプタのフィクスチャ(`tests/fixtures/*.json`)を参照。

## 検証手順

1. `npm install && npm run build` で `dist/` を生成し、`chrome://extensions` →
   デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」で `dist/` を読み込む。
2. claude.ai / chatgpt.com / grok.com にログインした状態で、拡張のアイコンをクリックし
   ポップアップの表示を確認する。
3. 表示が「取得失敗」になるプロバイダは、該当サイトを開いて DevTools → Network で
   usage 系リクエストを観察し、実際の URL・認証ヘッダー・レスポンス JSON を採取する。
   - Claude: 設定 → 使用状況 画面を開いたときの XHR
   - Codex: chatgpt.com の Codex 画面 / usage 表示を開いたときの XHR
   - Grok: grok.com でモデル切替や送信直前に飛ぶ rate-limits 系 XHR
4. 実際のレスポンスをフィクスチャ JSON に反映し、アダプタの `UNVERIFIED` 定数
   ブロックを修正 → `npm test` が通ることを確認する。
5. 確認できた行の「状態」を「確認済み (YYYY-MM-DD)」に更新し、必要なら
   レスポンス例をこのファイルに追記する。

## service worker のデバッグ

`chrome://extensions` → 「Service Worker」リンクから background の DevTools を開き、
`chrome.storage.local.get(null, console.log)` で保存済みスナップショットを確認できる。
手動更新はポップアップの ↻ ボタン(10秒スロットル)。
